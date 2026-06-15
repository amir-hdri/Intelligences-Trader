import test from 'node:test';
import assert from 'node:assert';
import { calculateRSISeries } from '../strategyOptimizer.js';

test('calculateRSISeries', async (t) => {
  await t.test('returns an array of 50s when prices length is less than or equal to period', () => {
    const prices = [10, 11, 12];
    const rsi = calculateRSISeries(prices, 3);
    assert.deepStrictEqual(rsi, [50, 50, 50]);
  });

  await t.test('calculates RSI correctly for simple trend', () => {
    const prices = [10, 11, 12, 13, 14, 15];
    const rsi = calculateRSISeries(prices, 4);
    assert.strictEqual(rsi.length, 6);
    assert.strictEqual(rsi[4], 100);
    assert.strictEqual(rsi[5], 100);
  });

  await t.test('calculates RSI correctly for downtrend', () => {
    const prices = [15, 14, 13, 12, 11, 10];
    const rsi = calculateRSISeries(prices, 4);
    assert.strictEqual(rsi[4], 0);
    assert.strictEqual(rsi[5], 0);
  });

  await t.test('calculates RSI correctly for mixed trend', () => {
    const prices = [10, 12, 11, 13, 12, 14];
    const rsi = calculateRSISeries(prices, 4);
    assert.ok(Math.abs(rsi[4] - 66.66666) < 0.0001);
    assert.ok(Math.abs(rsi[5] - 66.66666) < 0.0001);
  });
});
