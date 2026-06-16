// @ts-ignore
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
// @ts-ignore
import assert from 'node:assert';

// We must set globalThis.Worker before importing dataUtils to ensure analysisWorkerPool is initialized
globalThis.Worker = class MockWorker {
    postMessage() {}
    on() {}
    terminate() {}
} as any;

import { analyzeMarketMTF } from './dataUtils';
import { WorkerPool } from './workers/workerPool';

describe('dataUtils - Worker Error Handling', () => {
    let mockError: any;
    const originalConsoleError = console.error;
    const originalExecuteTask = WorkerPool.prototype.executeTask;

    beforeEach(() => {
        mockError = null;
        console.error = (err) => { mockError = err; };
        // Mock executeTask to reject
        WorkerPool.prototype.executeTask = mock.fn(() => Promise.reject(new Error('Mock executeTask error')));
    });

    afterEach(() => {
        console.error = originalConsoleError;
        WorkerPool.prototype.executeTask = originalExecuteTask;
    });

    it('should catch error when analysisWorkerPool.executeTask throws', async () => {
        const mtfData = { '1d': [], '1h': [], '15m': [], '1m': [] };

        analyzeMarketMTF(mtfData, 'TEST_SYMBOL');

        // Wait briefly for the promise rejection to be handled
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(mockError, 'Error should have been caught and logged');
        assert.strictEqual(mockError.message, 'Mock executeTask error');
    });
});
