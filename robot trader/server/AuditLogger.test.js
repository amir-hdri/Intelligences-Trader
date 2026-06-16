import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { auditLogger } from './AuditLogger.js';

describe('AuditLogger', () => {
  let originalAppendFile;
  let originalConsoleError;

  beforeEach(() => {
    originalAppendFile = fs.appendFile;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    fs.appendFile = originalAppendFile;
    console.error = originalConsoleError;
  });

  test('should trigger console.error when fs.appendFile yields an error', (t, done) => {
    const fakeError = new Error('Disk full');

    // Mock fs.appendFile to yield an error
    fs.appendFile = (path, data, callback) => {
      callback(fakeError);
    };

    let consoleErrorCalled = false;
    let consoleErrorMessage = null;
    let consoleErrorDetails = null;

    // Mock console.error
    console.error = (message, err) => {
      consoleErrorCalled = true;
      consoleErrorMessage = message;
      consoleErrorDetails = err;
    };

    // Trigger log, which calls the mocked appendFile
    auditLogger.log('TEST_ACTION', '127.0.0.1', 'user123', { test: true });

    // In this synchronous mock execution, the callback happens immediately
    assert.strictEqual(consoleErrorCalled, true, 'console.error should have been called');
    assert.strictEqual(consoleErrorMessage, 'Failed to write audit log:');
    assert.strictEqual(consoleErrorDetails, fakeError);

    done();
  });
});
