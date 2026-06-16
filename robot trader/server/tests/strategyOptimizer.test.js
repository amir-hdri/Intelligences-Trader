import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateEMASeries } from '../strategyOptimizer.js';

describe('strategyOptimizer.js', () => {
  describe('calculateEMASeries', () => {
    test('should calculate EMA correctly for a simple series', () => {
      const prices = [10, 12, 14, 16];
      const period = 3;
      const expected = [10, 11, 12.5, 14.25];

      const result = calculateEMASeries(prices, period);

      assert.deepStrictEqual(result, expected);
    });

    test('should return an array of the same length as prices', () => {
      const prices = [1, 2, 3, 4, 5];
      const period = 3;
      const result = calculateEMASeries(prices, period);
      assert.strictEqual(result.length, prices.length);
    });

    test('should start with the first price', () => {
      const prices = [100, 105, 110];
      const period = 2;
      const result = calculateEMASeries(prices, period);
      assert.strictEqual(result[0], 100);
    });

    test('should handle empty arrays', () => {
      const prices = [];
      const period = 3;
      const result = calculateEMASeries(prices, period);
      assert.deepStrictEqual(result, []);
    });

    test('should handle single element arrays', () => {
      const prices = [10];
      const period = 3;
      const result = calculateEMASeries(prices, period);
      assert.deepStrictEqual(result, [10]);
    });
  });
});
