// @ts-ignore
import { describe, test, beforeEach, afterEach } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { API_BASE_URL } from './constants';
import { fetchHistoricalData, fetchSaffronData, fetchGoldData } from './historicalData';
import { MarketCandle } from './types';

describe('historicalData', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalConsoleError = console.error;
    // Suppress console.error in tests
    console.error = () => {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('fetchHistoricalData', () => {
    test('should return data when response is a direct array', async () => {
      const mockData = [{ close: 100 }, { close: 101 }];

      globalThis.fetch = async (url) => {
        assert.strictEqual(url, 'http://localhost:3001/api/tse/history/TEST-SYM');
        return {
          ok: true,
          json: async () => mockData,
        } as Response;
      };

      const result = await fetchHistoricalData('TEST-SYM');
      assert.deepStrictEqual(result, mockData);
    });

    test('should return data when response has data array property', async () => {
      const mockData = [{ close: 100 }, { close: 101 }];

      globalThis.fetch = async (url) => {
        return {
          ok: true,
          json: async () => ({ data: mockData }),
        } as Response;
      };

      const result = await fetchHistoricalData('TEST-SYM');
      assert.deepStrictEqual(result, mockData);
    });

    test('should return empty array when response is not ok', async () => {
      globalThis.fetch = async (url) => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      const result = await fetchHistoricalData('TEST-SYM');
      assert.deepStrictEqual(result, []);
    });

    test('should return empty array when response data is invalid', async () => {
      globalThis.fetch = async (url) => {
        return {
          ok: true,
          json: async () => ({ unexpected: 'format' }),
        } as Response;
      };

      const result = await fetchHistoricalData('TEST-SYM');
      assert.deepStrictEqual(result, []);
    });

    test('should return empty array when fetch throws an error', async () => {
      globalThis.fetch = async () => {
        throw new Error('Network error');
      };

      const result = await fetchHistoricalData('TEST-SYM');
      assert.deepStrictEqual(result, []);
    });

    test('should use provided proxyUrl', async () => {
      const mockData = [{ close: 50 }];
      globalThis.fetch = async (url) => {
        assert.strictEqual(url, 'http://custom-proxy:4000/api/tse/history/TEST-SYM');
        return {
          ok: true,
          json: async () => mockData,
        } as Response;
      };

      const result = await fetchHistoricalData('TEST-SYM', 'http://custom-proxy:4000');
      assert.deepStrictEqual(result, mockData);
    });
  });

  describe('fetchSaffronData', () => {
    test('should fetch data for SAF-NGN-FUT', async () => {
      const mockData = [{ close: 200 }];
      globalThis.fetch = async (url) => {
        assert.strictEqual(url, 'http://localhost:3001/api/tse/history/SAF-NGN-FUT');
        return {
          ok: true,
          json: async () => mockData,
        } as Response;
      };

      const result = await fetchSaffronData();
      assert.deepStrictEqual(result, mockData);
    });
  });

  describe('fetchGoldData', () => {
    test('should fetch data for GOLD-FUT', async () => {
      const mockData = [{ close: 300 }];
      globalThis.fetch = async (url) => {
        assert.strictEqual(url, 'http://localhost:3001/api/tse/history/GOLD-FUT');
        return {
          ok: true,
          json: async () => mockData,
        } as Response;
      };

      const result = await fetchGoldData();
      assert.deepStrictEqual(result, mockData);
    });
  });
});
