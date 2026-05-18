// @ts-ignore
import { describe, it, test, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { calculateMACD, analyzeMarketMTF, TseApiClient, calculateRSI } from './dataUtils';
import type { MarketCandle } from './types';
import type { ApiConfig } from './types';

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

// ========================================
// Helper to create candles
// ========================================
const createCandles = (count: number, trend: 'UP' | 'DOWN' | 'FLAT' | 'VOLATILE'): MarketCandle[] => {
    const candles: MarketCandle[] = [];
    let price = 10000;
    for (let i = 0; i < count; i++) {
        let change = 0;
        if (trend === 'UP') change = 10;
        else if (trend === 'DOWN') change = -10;
        else if (trend === 'VOLATILE') change = (Math.random() - 0.5) * 2000; // Extreme volatility
        else change = (Math.random() - 0.5) * 2;

        price = Math.max(100, price + change); // Keep price positive

        const range = trend === 'VOLATILE' ? 500 : 5;

        candles.push({
            timestamp: Date.now() - (count - i) * 60000,
            open: price,
            high: price + range,
            low: price - range,
            close: price,
            volume: 1000
        });
    }
    return candles;
};

// ========================================
// Test Suite: Market Regime Detection
// ========================================
describe('dataUtils - Market Regime Detection', () => {
    it('should detect TRENDING_UP regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'UP');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        assert.strictEqual(result.regime, 'TRENDING_UP');
    });

    it('should detect TRENDING_DOWN regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'DOWN');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        assert.strictEqual(result.regime, 'TRENDING_DOWN');
    });

    it('should detect HIGH_VOLATILITY regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'VOLATILE');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        const volatility = result.indicators.atr / result.entryPrice;

        // Ensure volatility is high enough for the test
        if (volatility <= 0.03) {
            console.warn('Test warning: Generated data was not volatile enough. Retrying or adjusting test expectations might be needed.');
        }
        assert.strictEqual(result.regime, 'HIGH_VOLATILITY');
    });
});

// ========================================
// Test Suite: TseApiClient
// ========================================
describe('TseApiClient', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalConsoleError: typeof console.error;

  before(() => {
    originalFetch = globalThis.fetch;
    originalConsoleError = console.error;
    // Suppress console.error for expected failures
    console.error = () => {};
  });

  after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('fetchMarketData fetches from proxy when configured and connected', async () => {
    const mockResponse: MarketCandle[] = [{
      timestamp: 12345,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000
    }];

    // Mock fetch success
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: mockResponse }),
    } as any);

    const config: ApiConfig = {
      proxyUrl: 'http://proxy.com',
      apiKey: 'key',
      isConnected: true,
      useDigitalTwin: false,
    };

    const client = new TseApiClient(config);
    const data = await client.fetchMarketData('TEST');

    assert.deepStrictEqual(data, mockResponse);
  });

  test('fetchMarketData falls back to Digital Twin on fetch error after retries', async () => {
    // Mock fetch failure
    globalThis.fetch = async () => {
      throw new Error('Network Error');
    };

    const config: ApiConfig = {
      proxyUrl: 'http://proxy.com',
      apiKey: 'key',
      isConnected: true,
      useDigitalTwin: false,
    };

    const client = new TseApiClient(config);
    const data = await client.fetchMarketData('TEST');

    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 100); // Now falls back to digital twin (default 100 candles for 1d)
  });

  test('fetchMarketData falls back to Digital Twin when no proxy URL configured', async () => {
    const config: ApiConfig = {
      proxyUrl: undefined as any,
      apiKey: 'key',
      isConnected: true,
      useDigitalTwin: false,
    };

    const client = new TseApiClient(config);
    const data = await client.fetchMarketData('TEST');

    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 100); // Falls back to digital twin
  });
});

describe('calculateRSI', () => {
  test('returns 50 if prices.length is less than period + 1', () => {
    assert.strictEqual(calculateRSI([100, 101], 14), 50);
  });

  test('returns 100 if there are only gains during the period (average loss is 0)', () => {
    // 15 prices for period 14, strictly increasing
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    assert.strictEqual(calculateRSI(prices, 14), 100);
  });

  test('returns 0 if there are only losses during the period (average gain is 0)', () => {
    // 15 prices for period 14, strictly decreasing
    const prices = [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    assert.strictEqual(calculateRSI(prices, 14), 0);
  });

  test('returns correct RSI for a mixed sequence of gains and losses', () => {
    // 15 prices:
    // changes:
    // 1 -> 2 (+1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // 3 -> 2 (-1)
    // 2 -> 3 (+1)
    // gains: 8 * (+1) = +8
    // losses: 6 * (-1) = -6
    // avgGain = 8/14
    // avgLoss = 6/14
    // rs = 8/6 = 1.333...
    // RSI = 100 - 100 / (1 + 1.333...) = 100 - 100 / (14/6) = 100 - 600/14 = 100 - 42.857... = 57.142857...
    const prices = [1, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3];
    const rsi = calculateRSI(prices, 14);
    assert.ok(rsi > 57.1 && rsi < 57.2);
  });

  test('calculates RSI properly using a custom period', () => {
    // Period = 3, prices length = 4
    // changes:
    // 10 -> 12 (+2)
    // 12 -> 9 (-3)
    // 9 -> 11 (+2)
    // gains: +4
    // losses: -3
    // avgGain: 4/3
    // avgLoss: 3/3 = 1
    // rs: (4/3) / 1 = 4/3
    // RSI = 100 - 100 / (1 + 4/3) = 100 - 100 / (7/3) = 100 - 300/7 = 100 - 42.857... = 57.142857...
    const prices = [10, 12, 9, 11];
    const rsi = calculateRSI(prices, 3);
    assert.ok(rsi > 57.1 && rsi < 57.2);
  });
});
