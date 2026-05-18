// @ts-ignore
import { describe, it, test, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { RiskEngine } from './riskEngine';
import { RiskLimits } from './types';

test('RiskEngine - calculateKellySize with negative profit factor', () => {
  const limits: RiskLimits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxOpenTrades: 5,
    stopAllTrading: false,
    maxPositionSize: 100
  };
  const engine = new RiskEngine(limits, 10000);

  // Set performance metrics with negative profit factor
  engine.updatePerformanceMetrics(0.55, -1.5);

  const size = engine.calculateKellySize(100, 2.5);

  assert.strictEqual(size, 0, 'Kelly size should be 0 for negative profit factor');
});

test('RiskEngine - calculateKellySize with zero profit factor', () => {
  const limits: RiskLimits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxOpenTrades: 5,
    stopAllTrading: false,
    maxPositionSize: 100
  };
  const engine = new RiskEngine(limits, 10000);

  // Set performance metrics with zero profit factor
  engine.updatePerformanceMetrics(0.55, 0);

  const size = engine.calculateKellySize(100, 2.5);

  assert.strictEqual(size, 0, 'Kelly size should be 0 for zero profit factor');
});

test('RiskEngine - calculateKellySize with positive profit factor', () => {
  const limits: RiskLimits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxOpenTrades: 5,
    stopAllTrading: false,
    maxPositionSize: 100
  };
  const engine = new RiskEngine(limits, 10000);

  // Set performance metrics with typical values
  // p = 0.55, b = 1.8
  // q = 1 - 0.55 = 0.45
  // kellyF = (0.55 * 1.8 - 0.45) / 1.8 = (0.99 - 0.45) / 1.8 = 0.54 / 1.8 = 0.3
  // safeKelly = 0.3 * 0.25 = 0.075
  // riskAmount = 10000 * 0.075 = 750
  // stopLossDistance = 1.5 * 2.5 = 3.75
  // size = 750 / 3.75 = 200
  engine.updatePerformanceMetrics(0.55, 1.8);

  const size = engine.calculateKellySize(100, 2.5);

  assert.strictEqual(size, 200, 'Kelly size should be correctly calculated for positive profit factor');
});
