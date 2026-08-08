import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
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

  test('reports append failures without throwing', () => {
    const fakeError = new Error('Disk full');
    fs.appendFile = (...args) => args.at(-1)(fakeError);

    let logged;
    console.error = (...args) => {
      logged = args;
    };

    auditLogger.log('TEST_ACTION', '127.0.0.1', 'user123', { test: true });
    assert.deepStrictEqual(logged, ['Failed to write audit log:', fakeError]);
  });
});
