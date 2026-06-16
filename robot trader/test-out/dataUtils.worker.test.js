"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const node_test_1 = require("node:test");
// @ts-ignore
const node_assert_1 = __importDefault(require("node:assert"));
// We must set globalThis.Worker before importing dataUtils to ensure analysisWorkerPool is initialized
globalThis.Worker = class MockWorker {
    postMessage() { }
    on() { }
    terminate() { }
};
const dataUtils_1 = require("./dataUtils");
const workerPool_1 = require("./workers/workerPool");
(0, node_test_1.describe)('dataUtils - Worker Error Handling', () => {
    let mockError;
    const originalConsoleError = console.error;
    const originalExecuteTask = workerPool_1.WorkerPool.prototype.executeTask;
    (0, node_test_1.beforeEach)(() => {
        mockError = null;
        console.error = (err) => { mockError = err; };
        // Mock executeTask to reject
        workerPool_1.WorkerPool.prototype.executeTask = node_test_1.mock.fn(() => Promise.reject(new Error('Mock executeTask error')));
    });
    (0, node_test_1.afterEach)(() => {
        console.error = originalConsoleError;
        workerPool_1.WorkerPool.prototype.executeTask = originalExecuteTask;
    });
    (0, node_test_1.it)('should catch error when analysisWorkerPool.executeTask throws', async () => {
        const mtfData = { '1d': [], '1h': [], '15m': [], '1m': [] };
        (0, dataUtils_1.analyzeMarketMTF)(mtfData, 'TEST_SYMBOL');
        // Wait briefly for the promise rejection to be handled
        await new Promise(resolve => setTimeout(resolve, 50));
        node_assert_1.default.ok(mockError, 'Error should have been caught and logged');
        node_assert_1.default.strictEqual(mockError.message, 'Mock executeTask error');
    });
});
