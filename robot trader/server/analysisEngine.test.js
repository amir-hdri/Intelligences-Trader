import test from 'node:test';
import assert from 'node:assert';
import { calculateSMA, calculateVaR95, generateAnalysis } from './analysisEngine.js';

test('calculateSMA correctly computes Simple Moving Average', () => {
  const prices = [10, 20, 30, 40, 50];
  const sma = calculateSMA(prices, 3);
  assert.strictEqual(sma, 40); // (30 + 40 + 50) / 3

  const smaTooFew = calculateSMA(prices, 10);
  assert.strictEqual(smaTooFew, null);
});

test('calculateVaR95 correctly computes Value at Risk 95%', () => {
  const historyData = [
    { close: 100 }, // 0
    { close: 90 },  // -10%
    { close: 99 },  // +10%
    { close: 89.1 },// -10%
    { close: 98.01 },// +10%
    { close: 88.209 },// -10%
    { close: 97.0299 },// +10%
    { close: 87.32691 },// -10%
    { close: 96.059601 },// +10%
    { close: 86.4536409 },// -10%
    { close: 95.09900499 },// +10%
    { close: 85.589104491 },// -10%
    { close: 94.1480149401 },// +10%
    { close: 84.73321344609 },// -10%
    { close: 93.2065347907 },// +10%
    { close: 83.88588131163 },// -10%
    { close: 92.27446944279 },// +10%
    { close: 83.04702249851 },// -10%
    { close: 91.35172474836 },// +10%
    { close: 82.21655227353 },// -10%
    { close: 90.43820750088 },// +10%
    { close: 81.39438675079 } // -10%
  ];

  const var95 = calculateVaR95(historyData);
  // There are 21 returns.
  // 5% of 21 is 1.05. Math.floor is 1.
  // Sorted returns should have -10% (-0.1) as many of the lowest values.
  // We expect the 5th percentile to be roughly -0.1.
  assert.ok(Math.abs(var95 - (-0.1)) < 0.0001);
});

test('generateAnalysis handles empty history data', () => {
  const analysis = generateAnalysis([]);
  assert.strictEqual(analysis.prediction, 'HOLD');
  assert.strictEqual(analysis.confidence, 0);
  assert.strictEqual(analysis.volatility, 'UNKNOWN');
});

test('generateAnalysis returns valid prediction and < 500ms for 1000 candles', () => {
  const historyData = [];
  let price = 100;
  for (let i = 0; i < 1000; i++) {
    price += (Math.random() - 0.5) * 2;
    historyData.push({
      timestamp: Date.now() - (1000 - i) * 60000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 100
    });
  }

  const start = Date.now();
  const analysis = generateAnalysis(historyData);
  const end = Date.now();

  const duration = end - start;
  assert.ok(duration < 500, `Execution time was ${duration}ms, expected < 500ms`);

  assert.ok(['BUY', 'SELL', 'HOLD'].includes(analysis.prediction));
  assert.ok(analysis.confidence >= 0 && analysis.confidence <= 1);
  assert.ok(typeof analysis.risk.valueAtRisk95 === 'number');
});
