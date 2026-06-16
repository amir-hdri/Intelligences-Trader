import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PredictionHistoryService } from './PredictionHistoryService';

// Mock localStorage
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  clear(): void {
    this.store = {};
  }
}

// Global mocks
let originalLocalStorage: any;
let originalConsoleError: any;

describe('PredictionHistoryService', () => {
  before(() => {
    originalLocalStorage = (globalThis as any).localStorage;
    originalConsoleError = console.error;

    (globalThis as any).localStorage = new LocalStorageMock();

    // Polyfill crypto if it doesn't exist, otherwise add randomUUID to it
    if (!(globalThis as any).crypto) {
        (globalThis as any).crypto = { randomUUID: () => 'test-uuid-1234' };
    } else if (!(globalThis as any).crypto.randomUUID) {
        (globalThis as any).crypto.randomUUID = () => 'test-uuid-1234';
    }
  });

  after(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    ((globalThis as any).localStorage as LocalStorageMock).clear();
    console.error = () => {}; // Silence errors by default during tests
  });

  test('loadHistory error path', () => {
    // Force getItem to throw an error
    const mockStorage = new LocalStorageMock();
    mockStorage.getItem = () => {
      throw new Error('Storage access denied');
    };
    (globalThis as any).localStorage = mockStorage;

    let errorLogged = false;
    console.error = (msg: string, e: any) => {
      if (msg === 'Failed to load prediction history' && e.message === 'Storage access denied') {
        errorLogged = true;
      }
    };

    const service = new PredictionHistoryService();

    assert.strictEqual(errorLogged, true, 'Error should be logged when loadHistory fails');
    assert.deepStrictEqual(service.getHistory(), [], 'History should be initialized to empty array on failure');
  });

  test('saveHistory error path', () => {
    const service = new PredictionHistoryService();

    // Force setItem to throw an error
    const mockStorage = new LocalStorageMock();
    mockStorage.setItem = () => {
      throw new Error('Storage quota exceeded');
    };
    (globalThis as any).localStorage = mockStorage;

    let errorLogged = false;
    console.error = (msg: string, e: any) => {
      if (msg === 'Failed to save prediction history' && e.message === 'Storage quota exceeded') {
        errorLogged = true;
      }
    };

    // Trigger saveHistory by calling clearHistory
    service.clearHistory();

    assert.strictEqual(errorLogged, true, 'Error should be logged when saveHistory fails');
  });

  test('savePrediction handles valid forecast', () => {
    // Reset to normal mock
    (globalThis as any).localStorage = new LocalStorageMock();
    const service = new PredictionHistoryService();

    const forecast = {
      action: 'BUY' as const,
      entryPrice: 100,
      targetPrice: 110,
      stopLoss: 95,
      confidence: 0.8,
      indicators: {
        rsi: 40,
        macd: { histogram: 0.5, value: 1, signal: 0.5 },
        atr: 2
      },
      regime: 'TRENDING_UP',
      reason: 'Test reason'
    };

    const weights = {
      rsi: 1,
      macd: 1,
      engulfing: 1,
      bollinger: 1,
      ichimoku: 1,
      stochastic: 1,
      vwap: 1,
      obv: 1,
      basis: 1,
      sentiment: 1,
      orderBook: 1,
      correlation: 1,
      openInterest: 1
    };

    service.savePrediction(forecast as any, 'TEST_SYM', weights);

    const history = service.getHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].symbol, 'TEST_SYM');
    assert.strictEqual(history[0].action, 'BUY');

    // Ensure it saved to local storage
    const saved = (globalThis as any).localStorage.getItem('ime_prediction_history_v1');
    assert.ok(saved);
    const parsed = JSON.parse(saved as string);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].symbol, 'TEST_SYM');
  });
});
