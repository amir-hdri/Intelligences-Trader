import { test } from 'node:test';
import assert from 'node:assert';
import { calculateMACD } from './dataUtils';

test('calculateMACD - returns correct structure', () => {
  const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
  const result = calculateMACD(prices);

  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(typeof result.value, 'number', 'value should be a number');
  assert.strictEqual(typeof result.signal, 'number', 'signal should be a number');
  assert.strictEqual(typeof result.histogram, 'number', 'histogram should be a number');
});

test('calculateMACD - constant prices results in zero macdValue', () => {
  const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  const result = calculateMACD(prices);

  // ema12 and ema26 should both be 100, so value should be 0
  assert.strictEqual(result.value, 0);
  assert.strictEqual(result.signal, 0);
  assert.strictEqual(result.histogram, 0);
});

test('calculateMACD - increasing prices results in positive macdValue', () => {
  const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130];
  const result = calculateMACD(prices);

  // With increasing prices, short EMA should be higher than long EMA
  assert.ok(result.value > 0, `macdValue should be positive for increasing prices, got ${result.value}`);
});

test('calculateMACD - calculation logic verification', () => {
  // Manual calculation for a small set
  // EMA_SHORT = 12, k_short = 2 / 13
  // EMA_LONG = 26, k_long = 2 / 27
  // prices = [100, 110]
  // ema12 = 110 * (2/13) + 100 * (11/13) = (220 + 1100) / 13 = 1320 / 13 = 101.538...
  // ema26 = 110 * (2/27) + 100 * (25/27) = (220 + 2500) / 27 = 2720 / 27 = 100.740...
  // value = 101.538 - 100.740 = 0.798...
  // signal = 0.798 * 0.9 = 0.718...
  // histogram = 0.798 - 0.718 = 0.08

  const prices = [100, 110];
  const result = calculateMACD(prices);

  const expectedEma12 = 110 * (2/13) + 100 * (11/13);
  const expectedEma26 = 110 * (2/27) + 100 * (25/27);
  const expectedValue = expectedEma12 - expectedEma26;
  const expectedSignal = expectedValue * 0.9;
  const expectedHistogram = expectedValue - expectedSignal;

  assert.ok(Math.abs(result.value - expectedValue) < 0.0001, `Value mismatch: got ${result.value}, expected ${expectedValue}`);
  assert.ok(Math.abs(result.signal - expectedSignal) < 0.0001, `Signal mismatch: got ${result.signal}, expected ${expectedSignal}`);
  assert.ok(Math.abs(result.histogram - expectedHistogram) < 0.0001, `Histogram mismatch: got ${result.histogram}, expected ${expectedHistogram}`);
});

test('calculateMACD - handles single price element', () => {
  const prices = [100];
  const result = calculateMACD(prices);

  assert.strictEqual(result.value, 0);
  assert.strictEqual(result.signal, 0);
  assert.strictEqual(result.histogram, 0);
});
