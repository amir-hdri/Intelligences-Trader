import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Market Analyzer Worker', () => {
  let postMessageCalls: any[] = [];
  let originalSelf: any;

  beforeEach(() => {
    postMessageCalls = [];
    originalSelf = (global as any).self;
    (global as any).self = {
      onmessage: null,
      postMessage: (msg: any) => postMessageCalls.push(msg)
    };
  });

  afterEach(() => {
    (global as any).self = originalSelf;
  });

  test('Worker returns generic error message if error has no message', async () => {
    if (!(global as any).self.onmessage) {
      await import('./marketAnalyzer.worker.ts?v=' + Date.now());
    }

    const onmessage = (global as any).self.onmessage;
    assert.ok(onmessage);

    const mockEvent = {
        data: {
            type: 'performWalkForwardBacktest',
            id: 999,
            payload: {
                get candles() {
                    throw { customProperty: 'no message here' };
                }
            }
        }
    };

    await onmessage(mockEvent as any);

    assert.strictEqual(postMessageCalls.length, 1);
    assert.strictEqual(postMessageCalls[0].id, 999);
    assert.strictEqual(postMessageCalls[0].error, 'Unknown worker error');
  });

  test('Worker returns generic error message if string is thrown', async () => {
    if (!(global as any).self.onmessage) {
      await import('./marketAnalyzer.worker.ts?v=' + Date.now());
    }

    const onmessage = (global as any).self.onmessage;
    assert.ok(onmessage);

    const mockEvent = {
        data: {
            type: 'performWalkForwardBacktest',
            id: 888,
            payload: {
                get candles() {
                    throw 'A string error';
                }
            }
        }
    };

    await onmessage(mockEvent as any);

    assert.strictEqual(postMessageCalls.length, 1);
    assert.strictEqual(postMessageCalls[0].id, 888);
    assert.strictEqual(postMessageCalls[0].error, 'Unknown worker error');
  });

  test('Worker handles unknown message type', async () => {
    if (!(global as any).self.onmessage) {
      await import('./marketAnalyzer.worker.ts?v=' + Date.now());
    }

    const onmessage = (global as any).self.onmessage;
    assert.ok(onmessage);

    await onmessage({
      data: {
        type: 'unknown_type',
        id: 123,
        payload: {}
      }
    } as any);

    assert.strictEqual(postMessageCalls.length, 1);
    assert.strictEqual(postMessageCalls[0].id, 123);
    assert.strictEqual(postMessageCalls[0].error, 'Unknown worker message type: unknown_type');
  });
});
