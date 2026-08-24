import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';

// Phase-2 fault-injection / recovery chaos tests.
//
// These exercises target the failure paths of every P2 module: dependency
// loss, malformed input floods, liquidity exhaustion, state-machine misuse,
// capacity exhaustion, and engine failures mid-trade.

import { OrderBookSimulator } from '../modules/paperTradingEngine/p2/execution/OrderBookSimulator.js';
import { OrderStateMachine, ORDER_STATES } from '../modules/paperTradingEngine/p2/execution/OrderStateMachine.js';
import { P2ExecutionEngine } from '../modules/paperTradingEngine/p2/execution/P2ExecutionEngine.js';
import { MLSignalBridge } from '../modules/paperTradingEngine/p2/ml/MLSignalBridge.js';
import { TickByTickProcessor } from '../modules/paperTradingEngine/p2/data/TickByTickProcessor.js';
import { RedisCache } from '../modules/paperTradingEngine/p2/data/RedisCache.js';
import { TradeRepository } from '../modules/paperTradingEngine/p2/storage/TradeRepository.js';
import { BacktestRepository } from '../modules/backtesting/infrastructure/BacktestRepository.js';

// Deterministic stub of the base paper-trading engine.
class StubEngine {
  constructor({ fail = false, throwOnExecute = false, balance = 1_000_000 } = {}) {
    this.balance = balance;
    this.trades = [];
    this.fail = fail;
    this.throwOnExecute = throwOnExecute;
  }
  executeTrade(order, forecast, marketPrice) {
    if (this.throwOnExecute) throw new Error('base engine exploded');
    if (this.fail) return { success: false, reason: 'insufficient balance' };
    const isWin = (forecast?.action || 'HOLD') === order.action;
    const pnl = isWin ? 1000 : -1000;
    this.balance += pnl;
    const trade = {
      id: `t-${this.trades.length}`,
      timestamp: Date.now(),
      symbol: order.symbol,
      action: order.action,
      quantity: order.qty,
      entryPrice: order.entry || marketPrice,
      pnl,
      isWin,
      reason: 'stub',
    };
    this.trades.push(trade);
    return { success: true, trade, newBalance: this.balance };
  }
}

describe('P2 chaos: RedisCache dependency loss', () => {
  test('client error event degrades to in-memory mode without throwing', async () => {
    process.env.REDIS_DISABLED = '';
    const cache = new RedisCache('redis://127.0.0.1:1', { ttlCheckMs: 50 });
    try {
      assert.strictEqual(cache.enabled, true); // lazy-connect starts optimistic
      cache.client.emit('error', new Error('ECONNREFUSED'));
      await cache.setOHLCV('BTC-USDT', '1h', [{ c: 1 }]);
      const got = await cache.getOHLCV('BTC-USDT', '1h');
      assert.ok(Array.isArray(got), 'memory fallback must serve reads');
    } finally {
      await cache.close();
    }
  });

  test('TTL expiry sweeps expired entries from the memory fallback', async () => {
    const cache = new RedisCache('redis://127.0.0.1:1', { ttlCheckMs: 20 });
    try {
      cache.client.emit('error', new Error('down'));
      await cache._set('k', 'v', 0.03); // 30ms TTL
      await new Promise(r => setTimeout(r, 120));
      assert.strictEqual(await cache._get('k'), null, 'expired entry must be swept');
    } finally {
      await cache.close();
    }
  });
});

describe('P2 chaos: TradeRepository persistence faults', () => {
  test('missing DATABASE_URL stays in memory mode and never dials a DSN', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_DISABLED;
    const repo = new TradeRepository();
    await repo.ready;
    assert.strictEqual(repo.dbEnabled, false);
    assert.strictEqual(repo.pool, null);
    await repo.saveTrade({ id: 'm1', timestamp: 1, symbol: 'X', action: 'BUY', quantity: 1, entryPrice: 1, pnl: 0, isWin: true, reason: '' });
    assert.strictEqual(await repo.count(), 1);
  });

  test('memory ledger is FIFO-capped at MAX_MEMORY_TRADES', async () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_DISABLED = 'true';
    const repo = new TradeRepository();
    await repo.ready;
    try {
      for (let i = 0; i < TradeRepository.MAX_MEMORY_TRADES + 25; i++) {
        await repo.saveTrade({ id: `t${i}`, timestamp: i, symbol: 'X', action: 'BUY', quantity: 1, entryPrice: 1, pnl: 0, isWin: true, reason: '' });
      }
      assert.strictEqual(repo.memory.length, TradeRepository.MAX_MEMORY_TRADES);
      assert.strictEqual(repo.memory[0].id, 't25', 'oldest entries evicted first');
      assert.strictEqual(repo.memory.at(-1).id, `t${TradeRepository.MAX_MEMORY_TRADES + 24}`);
    } finally {
      delete process.env.DATABASE_DISABLED;
    }
  });
});

describe('P2 chaos: BacktestRepository capacity exhaustion', () => {
  test('dataset map is capped without breaking immutability of retained entries', async () => {
    process.env.DATABASE_DISABLED = 'true';
    const repo = new BacktestRepository({ disabled: true });
    await repo.ready;
    for (let i = 0; i < BacktestRepository.MAX_MEMORY_DATASETS + 5; i++) {
      await repo.saveDataset({ id: `d${i}`, contentHash: `h${i}`, schemaVersion: '1', createdAt: i });
    }
    assert.strictEqual(repo.datasets.size, BacktestRepository.MAX_MEMORY_DATASETS);
    // Retained entries keep their immutability contract…
    await assert.rejects(
      () => repo.saveDataset({ id: `d${BacktestRepository.MAX_MEMORY_DATASETS + 4}`, contentHash: 'DIFFERENT', schemaVersion: '1', createdAt: 0 }),
      /immutable/,
    );
    // …and evicted ids may be re-created with fresh content.
    await repo.saveDataset({ id: 'd0', contentHash: 'fresh', schemaVersion: '1', createdAt: 0 });
  });

  test('run map is capped and cancellation flags survive updates within cap', async () => {
    const repo = new BacktestRepository({ disabled: true });
    await repo.ready;
    for (let i = 0; i < BacktestRepository.MAX_MEMORY_RUNS + 10; i++) {
      await repo.saveRun({ id: `r${i}`, status: 'queued', createdAt: i, updatedAt: i });
    }
    assert.strictEqual(repo.runs.size, BacktestRepository.MAX_MEMORY_RUNS);
    await repo.requestCancellation(`r${BacktestRepository.MAX_MEMORY_RUNS - 1}`);
    await repo.saveRun({ id: `r${BacktestRepository.MAX_MEMORY_RUNS - 1}`, status: 'running', createdAt: 1, updatedAt: 2 });
    assert.strictEqual((await repo.getRun(`r${BacktestRepository.MAX_MEMORY_RUNS - 1}`)).cancellationRequested, true);
  });
});

describe('P2 chaos: order book liquidity exhaustion', () => {
  let book;
  beforeEach(() => { book = new OrderBookSimulator(); });

  test('market order larger than available liquidity partially fills honestly', () => {
    book.updateBook(
      [{ price: 99, qty: 5 }, { price: 98, qty: 5 }],
      [{ price: 101, qty: 5 }],
    );
    const result = book.marketOrder('BUY', 20);
    assert.strictEqual(result.filled, 5);
    assert.strictEqual(result.remaining, 15);
    assert.strictEqual(result.avgPrice, 101);
    assert.strictEqual(book.bestAsk(), null, 'ask side fully consumed');
  });

  test('trade log is FIFO-capped under flood', () => {
    for (let i = 0; i < OrderBookSimulator.MAX_TRADES + 10; i++) {
      book.updateBook([], [{ price: 100 + i * 0.001, qty: 1 }]);
      book.marketOrder('BUY', 1);
    }
    assert.strictEqual(book.trades.length, OrderBookSimulator.MAX_TRADES);
  });

  test('resting-order cap evicts terminal orders but never OPEN ones', () => {
    for (let i = 0; i < OrderBookSimulator.MAX_RESTING; i++) {
      const o = book.placeLimitOrder('SELL', 200, 1);
      book.cancelOrder(o.id); // terminal
    }
    const before = book.resting.size;
    const openId = book.placeLimitOrder('BUY', 90, 1).id;
    assert.ok(book.resting.size <= OrderBookSimulator.MAX_RESTING, 'cap must hold');
    assert.strictEqual(book.resting.size, before, 'one terminal entry made room');
    assert.ok(book.resting.has(openId), 'freshly placed OPEN order must survive eviction');
    assert.strictEqual(book.resting.get(openId).status, 'OPEN');
  });
});

describe('P2 chaos: order state machine misuse', () => {
  let sm;
  beforeEach(() => { sm = new OrderStateMachine(); });

  test('terminal orders reject further transitions', () => {
    const o = sm.createOrder({ symbol: 'X', action: 'BUY', qty: 1 });
    sm.recordFill(o.id, 1, 100);
    assert.strictEqual(sm.getOrder(o.id).status, ORDER_STATES.FILLED);
    assert.strictEqual(sm.cancelOrder(o.id), null);
    assert.strictEqual(sm.recordFill(o.id, 0.5, 100), null);
  });

  test('over-fill clamps to ordered quantity instead of corrupting position', () => {
    const o = sm.createOrder({ symbol: 'X', action: 'BUY', qty: 2 });
    const filled = sm.recordFill(o.id, 99, 42.5);
    assert.strictEqual(filled.filledQty, 2);
    assert.strictEqual(filled.status, ORDER_STATES.FILLED);
    assert.strictEqual(filled.lastFillPrice, 42.5);
  });

  test('terminal pruning preserves every OPEN order', () => {
    const openIds = [];
    for (let i = 0; i < 60; i++) openIds.push(sm.createOrder({ symbol: 'OPEN', action: 'BUY', qty: 1 }).id);
    for (let i = 0; i < OrderStateMachine.MAX_ORDERS; i++) {
      const t = sm.createOrder({ symbol: 'TERM', action: 'BUY', qty: 1 });
      sm.cancelOrder(t.id);
    }
    assert.ok(sm.orders.size <= OrderStateMachine.MAX_ORDERS, 'map must be pruned to cap');
    for (const id of openIds) {
      assert.strictEqual(sm.getOrder(id).status, ORDER_STATES.OPEN, 'open orders are never evicted');
    }
  });
});

describe('P2 chaos: execution engine failure paths', () => {
  test('base-engine exception propagates without applying fees or mutating balance', () => {
    const base = new StubEngine({ throwOnExecute: true });
    const engine = new P2ExecutionEngine(base);
    assert.throws(() => engine.marketOrder('X', 'BUY', 1, { action: 'BUY' }, 100), /exploded/);
    assert.strictEqual(base.balance, 1_000_000);
  });

  test('base rejection keeps balance untouched and fee unapplied', () => {
    const base = new StubEngine({ fail: true });
    const engine = new P2ExecutionEngine(base);
    const result = engine.marketOrder('X', 'BUY', 3, { action: 'BUY' }, 100);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'insufficient balance');
    assert.strictEqual(base.balance, 1_000_000);
  });

  test('STOP_LOSS rests until the trigger price crosses, then fills', () => {
    const base = new StubEngine();
    const engine = new P2ExecutionEngine(base);
    const resting = engine.stopLossOrder('X', 'SELL', 1, 95, { action: 'SELL' }, 100);
    assert.strictEqual(resting.status, 'OPEN');
    const triggered = engine.stopLossOrder('X', 'SELL', 1, 95, { action: 'SELL' }, 94);
    assert.strictEqual(triggered.success, true);
    assert.strictEqual(triggered.trade.status, 'FILLED');
  });

  test('LIMIT BUY rests above market and fills when price reaches the limit', () => {
    const base = new StubEngine();
    const engine = new P2ExecutionEngine(base);
    const resting = engine.limitOrder('X', 'BUY', 1, 95, { action: 'BUY' }, 100);
    assert.strictEqual(resting.status, 'OPEN');
    const filled = engine.limitOrder('X', 'BUY', 1, 95, { action: 'BUY' }, 95);
    assert.strictEqual(filled.trade.status, 'FILLED');
  });
});

describe('P2 chaos: ML bridge malformed inputs', () => {
  const bridge = new MLSignalBridge(new P2ExecutionEngine(new StubEngine()));

  test('garbage signals fail closed with explicit reasons', () => {
    assert.strictEqual(bridge.signalToOrder(null, 'X', 100).success, false);
    assert.match(bridge.signalToOrder({ action: 'YOLO' }, 'X', 100).reason, /Unknown ML signal/);
    assert.match(bridge.signalToOrder({ action: 'BUY' }, '../etc/passwd', 100).reason, /Invalid paper-trading symbol/);
    assert.match(bridge.signalToOrder({ action: 'BUY', confidence: 0.9 }, 'X', NaN).reason, /marketPrice/);
    assert.match(bridge.signalToOrder({ action: 'BUY', confidence: 1.5 }, 'X', 100).reason, /Confidence/);
  });

  test('confidence exactly at threshold executes', () => {
    const result = bridge.signalToOrder({ action: 'BUY', confidence: 0.6 }, 'X', 100);
    assert.strictEqual(result.success, true);
  });
});

describe('P2 chaos: tick processor under malformed flood', () => {
  test('rejects non-finite/non-positive prices instead of poisoning VWAP', () => {
    const proc = new TickByTickProcessor();
    proc.addTick({ price: 100, volume: 1 });
    proc.addTick({ price: NaN, volume: 5 });
    proc.addTick({ price: Infinity, volume: 5 });
    proc.addTick({ price: -7, volume: 5 });
    proc.addTick({ price: undefined, volume: 5 });
    proc.addTick(null);
    proc.addTick({ price: 102, volume: 3 });
    assert.strictEqual(proc.ticks.length, 2);
    assert.strictEqual(proc.getVWAP(), (100 * 1 + 102 * 3) / 4);
  });

  test('zero-volume series falls back to last price rather than dividing by zero', () => {
    const proc = new TickByTickProcessor();
    proc.addTick({ price: 55, volume: 0 });
    proc.addTick({ price: 65, volume: 0 });
    assert.strictEqual(proc.getVWAP(), 65);
  });

  test('tick buffer is capped at 10,000 under flood', () => {
    const proc = new TickByTickProcessor();
    for (let i = 0; i < 10_500; i++) proc.addTick({ price: 100 + (i % 5), volume: 1 });
    assert.strictEqual(proc.ticks.length, 10_000);
  });
});
