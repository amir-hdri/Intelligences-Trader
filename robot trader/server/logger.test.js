import { test, mock, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { NodeSDK } from '@opentelemetry/sdk-node';
import winston from 'winston';

describe('logger', () => {
  let sigtermCallback;
  let originalOn;
  let originalExit;
  let originalLog;
  let originalShutdown;

  before(() => {
    // We mock these global methods before the logger module is imported.
    originalOn = process.on;
    originalExit = process.exit;
    originalLog = console.log;
    originalShutdown = NodeSDK.prototype.shutdown;
  });

  after(() => {
    process.on = originalOn;
    process.exit = originalExit;
    console.log = originalLog;
    NodeSDK.prototype.shutdown = originalShutdown;
  });

  test('successfully shuts down OpenTelemetry and logs on SIGTERM', async (t) => {
    t.mock.method(process, 'on', (event, callback) => {
      if (event === 'SIGTERM') {
        sigtermCallback = callback;
      }
    });

    let exitCode = null;
    t.mock.method(process, 'exit', (code) => {
      exitCode = code;
    });

    let hasSuccessLog = false;
    t.mock.method(console, 'log', (...args) => {
      if (args[0] === 'Tracing terminated') {
        hasSuccessLog = true;
      }
    });

    // Mock shutdown to resolve
    t.mock.method(NodeSDK.prototype, 'shutdown', () => Promise.resolve());

    // Import logger dynamically to trigger setup
    const { default: logger } = await import('./logger.js');

    assert.ok(logger.transports.length > 0, 'Logger initialized with transports');
    assert.ok(sigtermCallback, 'SIGTERM callback was registered');

    // Call the callback and wait for promise chain via setImmediate
    await sigtermCallback();
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(hasSuccessLog, true, 'Should log success message');
    assert.strictEqual(exitCode, 0, 'Should exit with code 0');
  });

  test('handles OpenTelemetry shutdown error gracefully on SIGTERM', async (t) => {
    t.mock.method(process, 'on', (event, callback) => {
      if (event === 'SIGTERM') {
        sigtermCallback = callback;
      }
    });

    let exitCode = null;
    t.mock.method(process, 'exit', (code) => {
      exitCode = code;
    });

    let hasErrorLog = false;
    let loggedError = null;
    t.mock.method(console, 'log', (...args) => {
      if (args[0] === 'Error terminating tracing') {
        hasErrorLog = true;
        loggedError = args[1];
      }
    });

    const testError = new Error('simulated shutdown failure');
    // Mock shutdown to reject
    t.mock.method(NodeSDK.prototype, 'shutdown', () => Promise.reject(testError));

    // Append a query param to bypass module cache so it runs setup again
    await import(`./logger.js?bypassCache=${Date.now()}`);

    assert.ok(sigtermCallback, 'SIGTERM callback was registered');

    // Call the callback and wait for promise chain via setImmediate
    await sigtermCallback();
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(hasErrorLog, true, 'Should log error message');
    assert.strictEqual(loggedError, testError, 'Should log the caught error');
    assert.strictEqual(exitCode, 0, 'Should exit with code 0 even on error');
  });
});
