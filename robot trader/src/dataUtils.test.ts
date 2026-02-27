// @ts-ignore
import { describe, it, test, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { analyzeMarketMTF, TseApiClient } from './dataUtils';
import { MarketCandle } from './types';
import type { ApiConfig } from './types';

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

  test('fetchMarketData returns empty array on fetch error after retries', async () => {
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
    assert.strictEqual(data.length, 0); // Returns empty array after retries (per main branch logic)
  });

  test('fetchMarketData returns empty array when no proxy URL configured', async () => {
    const config: ApiConfig = {
      proxyUrl: undefined,
      apiKey: 'key',
      isConnected: true,
      useDigitalTwin: false,
    };

    const client = new TseApiClient(config);
    const data = await client.fetchMarketData('TEST');

    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 0);
  });
});