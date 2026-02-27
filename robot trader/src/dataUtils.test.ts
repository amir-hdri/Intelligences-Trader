import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { TseApiClient } from './dataUtils';
import type { ApiConfig, MarketCandle } from './types';

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
      json: async () => mockResponse,
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

  test('fetchMarketData falls back to Digital Twin on fetch error', async () => {
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
    assert.ok(data.length > 0);
    // Check if generated data has expected properties
    assert.ok('close' in data[0]);
  });

  test('fetchMarketData falls back to Digital Twin when not connected', async () => {
    const config: ApiConfig = {
      proxyUrl: 'http://proxy.com',
      apiKey: 'key',
      isConnected: false,
      useDigitalTwin: false,
    };

    const client = new TseApiClient(config);
    const data = await client.fetchMarketData('TEST');

    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
  });
});
