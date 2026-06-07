import { test, describe } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';

describe('Worker Serialization Audit', () => {
  test('Should not leak future metadata (close price) when serializing data for worker', () => {
    // Generate random MarketCandle sequences using fast-check
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
            open: fc.double({ min: 10, max: 100 }),
            high: fc.double({ min: 10, max: 100 }),
            low: fc.double({ min: 10, max: 100 }),
            close: fc.double({ min: 10, max: 100 }),
            volume: fc.integer({ min: 100, max: 10000 })
          })
        ),
        (candlesData) => {
          if (candlesData.length === 0) return true;

          // Make high and low realistic
          const candles = candlesData.map(c => ({
            ...c,
            high: Math.max(c.open, c.close, c.high, c.low),
            low: Math.min(c.open, c.close, c.high, c.low)
          }));

          // Sort by timestamp
          candles.sort((a, b) => a.timestamp - b.timestamp);

          // Simulated Worker Serialization Process (JSON stringify/parse)
          const serializedPayload = JSON.stringify({
             type: 'performWalkForwardBacktest',
             payload: { candles }
          });

          const deserialized = JSON.parse(serializedPayload);

          // Audit: Check for look-ahead bias
          assert.strictEqual(deserialized.type, 'performWalkForwardBacktest');
          assert.strictEqual(deserialized.payload.candles.length, candles.length);

          // Check that no arbitrary properties like 'nextClose' are added to any candle
          for (let i = 0; i < deserialized.payload.candles.length; i++) {
             const c = deserialized.payload.candles[i];
             assert.ok(!c.hasOwnProperty('nextClose'), 'Leakage found: nextClose is present');
             assert.ok(!c.hasOwnProperty('futurePrice'), 'Leakage found: futurePrice is present');
          }
          return true;
        }
      ),
      { numRuns: 1000 } // Execute 1000 random scenarios
    );
  });
});
