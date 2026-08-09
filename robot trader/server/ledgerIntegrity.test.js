import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { positionLedger } from './modules/positionLedger.js';
import { orderLedger } from './modules/orderLedger.js';
import { calculatePerformanceFromTrades } from './modules/performanceLedger.js';

beforeEach(() => {
  positionLedger.clear();
  orderLedger.clear();
});

describe('honest process-local ledgers', () => {
  test('empty position and order ledgers do not fabricate records', () => {
    assert.deepEqual(positionLedger.getPositions('SAF1403'), []);
    assert.deepEqual(positionLedger.getAllPositions(), []);
    assert.deepEqual(orderLedger.getOrders('SAF1403'), []);
    assert.deepEqual(orderLedger.getAllOrders(), []);
  });

  test('position ledger filters symbols and calculates close PnL', () => {
    positionLedger.upsertPosition({
      id: 'position-1', symbol: 'SAF1403', side: 'BUY', quantity: 2,
      entryPrice: 100, currentPrice: 101, pnl: 2, pnlPercent: 1,
      timestamp: 1, status: 'OPEN',
    });
    positionLedger.upsertPosition({
      id: 'position-2', symbol: 'GOLD1403', side: 'SELL', quantity: 1,
      entryPrice: 200, currentPrice: 190, pnl: 10, pnlPercent: 5,
      timestamp: 2, status: 'OPEN',
    });
    assert.deepEqual(positionLedger.getPositions('SAF1403').map(row => row.id), ['position-1']);
    const closed = positionLedger.closePosition('position-1', 110);
    assert.equal(closed.pnl, 20);
    assert.deepEqual(positionLedger.getPositions('SAF1403'), []);
  });

  test('order ledger stores only explicitly submitted orders and enforces transitions', () => {
    const order = orderLedger.addOrder({
      id: 'order-1', symbol: 'SAF1403', side: 'BUY', type: 'LIMIT',
      price: 100, quantity: 5, timestamp: 1,
    });
    assert.equal(order.status, 'PENDING');
    assert.equal(orderLedger.getOrders('SAF1403').length, 1);
    assert.equal(orderLedger.transitionOrder('order-1', 'PARTIAL_FILLED').status, 'PARTIAL_FILLED');
    assert.equal(orderLedger.transitionOrder('order-1', 'REJECTED'), null);
    assert.equal(orderLedger.transitionOrder('order-1', 'FILLED').status, 'FILLED');
  });
});

describe('realized ledger performance', () => {
  test('reconciles final equity, PnL, drawdown, and profit factor', () => {
    const metrics = calculatePerformanceFromTrades([
      { timestamp: Date.UTC(2024, 0, 1), pnl: 100 },
      { timestamp: Date.UTC(2024, 0, 2), pnl: -50 },
      { timestamp: Date.UTC(2024, 0, 3), pnl: 25 },
    ], 1_000);
    assert.equal(metrics.totalPnl, 75);
    assert.equal(metrics.finalEquity, 1_075);
    assert.ok(Math.abs(metrics.winRate - 2 / 3) < 1e-6);
    assert.equal(metrics.profitFactor, 2.5);
    assert.ok(metrics.maxDrawdown > 0);
    assert.equal(metrics.equityCurve.length, 3);
  });

  test('rejects malformed trade PnL instead of silently fabricating metrics', () => {
    assert.throws(() => calculatePerformanceFromTrades([{ pnl: 'not-a-number' }]), /finite pnl/);
  });
});
