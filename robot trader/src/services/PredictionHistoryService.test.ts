import test, { describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PredictionHistoryService } from './PredictionHistoryService';

describe('PredictionHistoryService', () => {
  let originalLocalStorage: any;
  let originalConsoleError: any;
  let consoleErrorCalls: any[] = [];

  beforeEach(() => {
    // Save original globals
    originalLocalStorage = global.localStorage;
    originalConsoleError = console.error;

    // Clear mock calls
    consoleErrorCalls = [];

    // Mock console.error
    console.error = (...args: any[]) => {
      consoleErrorCalls.push(args);
    };
  });

  afterEach(() => {
    // Restore original globals
    if (originalLocalStorage !== undefined) {
      global.localStorage = originalLocalStorage;
    } else {
      delete (global as any).localStorage;
    }
    console.error = originalConsoleError;
  });

  test('loadHistory should handle localStorage getItem errors gracefully', () => {
    // Arrange: Mock localStorage.getItem to throw an error
    global.localStorage = {
      getItem: () => {
        throw new Error('Mocked getItem error');
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    } as any;

    // Act
    const service = new PredictionHistoryService();

    // Assert
    assert.deepStrictEqual(service.getHistory(), []);
    assert.strictEqual(consoleErrorCalls.length, 1);
    assert.strictEqual(consoleErrorCalls[0][0], 'Failed to load prediction history');
    assert.strictEqual(consoleErrorCalls[0][1].message, 'Mocked getItem error');
  });

  test('saveHistory should handle localStorage setItem errors gracefully', () => {
    // Arrange: Mock localStorage for successful load but failing save
    let storedData: string | null = null;
    global.localStorage = {
      getItem: () => storedData,
      setItem: () => {
        throw new Error('Mocked setItem error');
      },
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    } as any;

    const service = new PredictionHistoryService();

    // Clear loadHistory console.error calls if any
    consoleErrorCalls = [];

    // Act
    service.clearHistory(); // this calls saveHistory internally

    // Assert
    assert.strictEqual(consoleErrorCalls.length, 1);
    assert.strictEqual(consoleErrorCalls[0][0], 'Failed to save prediction history');
    assert.strictEqual(consoleErrorCalls[0][1].message, 'Mocked setItem error');
  });
});
  });
});
