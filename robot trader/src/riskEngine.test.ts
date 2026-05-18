import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RiskEngine } from './riskEngine';
import type { RiskLimits } from './types';

describe('RiskEngine.calculateTrailingStop', () => {
  const defaultLimits: RiskLimits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxPositionSize: 5000,
    maxOpenTrades: 3,
    stopAllTrading: false
  };

  test('BUY action - trailing stop moves up with current price', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = 100;
    const atr = 2;

    // Initial stop: entryPrice - 1.5 * atr = 100 - 3 = 97
    // Trailing stop: currentPrice - 2 * atr
    // If currentPrice is 100, trailing stop is 100 - 4 = 96
    // Math.max(97, 96) = 97
    assert.strictEqual(engine.calculateTrailingStop(100, entryPrice, 'BUY', atr), 97);

    // If currentPrice rises to 105, trailing stop is 105 - 4 = 101
    // Math.max(97, 101) = 101
    assert.strictEqual(engine.calculateTrailingStop(105, entryPrice, 'BUY', atr), 101);
  });

  test('SELL action - trailing stop moves down with current price', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = 100;
    const atr = 2;

    // Initial stop: entryPrice + 1.5 * atr = 100 + 3 = 103
    // Trailing stop: currentPrice + 2 * atr
    // If currentPrice is 100, trailing stop is 100 + 4 = 104
    // Math.min(103, 104) = 103
    assert.strictEqual(engine.calculateTrailingStop(100, entryPrice, 'SELL', atr), 103);

    // If currentPrice falls to 95, trailing stop is 95 + 4 = 99
    // Math.min(103, 99) = 99
    assert.strictEqual(engine.calculateTrailingStop(95, entryPrice, 'SELL', atr), 99);
  });

  test('HOLD action - acts implicitly as SELL mathematically but usually not used directly', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = 100;
    const atr = 2;
    // Returns same logic as SELL branch because of if (action === 'BUY') { ... } else { ... }
    assert.strictEqual(engine.calculateTrailingStop(100, entryPrice, 'HOLD', atr), 103);
  });

  test('BUY action - handles large negative price and atr (edge cases)', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = -10000;
    const atr = 500;
    const currentPrice = -9000;

    // entryPrice - 1.5 * atr = -10000 - 750 = -10750
    // currentPrice - 2.0 * atr = -9000 - 1000 = -10000
    // Math.max(-10750, -10000) = -10000
    assert.strictEqual(engine.calculateTrailingStop(currentPrice, entryPrice, 'BUY', atr), -10000);
  });

  test('SELL action - handles large negative price and atr (edge cases)', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = -10000;
    const atr = 500;
    const currentPrice = -11000;

    // entryPrice + 1.5 * atr = -10000 + 750 = -9250
    // currentPrice + 2.0 * atr = -11000 + 1000 = -10000
    // Math.min(-9250, -10000) = -10000
    assert.strictEqual(engine.calculateTrailingStop(currentPrice, entryPrice, 'SELL', atr), -10000);
  });

  test('handles zero atr safely', () => {
    const engine = new RiskEngine(defaultLimits, 10000);
    const entryPrice = 100;
    const atr = 0;
    const currentPrice = 105;

    // BUY: Math.max(100 - 0, 105 - 0) = 105
    assert.strictEqual(engine.calculateTrailingStop(currentPrice, entryPrice, 'BUY', atr), 105);
    // SELL: Math.min(100 + 0, 105 + 0) = 100
    assert.strictEqual(engine.calculateTrailingStop(currentPrice, entryPrice, 'SELL', atr), 100);
  });
});
