import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AuditLogger } from './AuditLogger.js';

describe('AuditLogger', () => {
  let originalAppendFile;

  beforeEach(() => {
    originalAppendFile = fs.appendFile;
  });

  afterEach(() => {
    fs.appendFile = originalAppendFile;
  });

  test('emits structured audit events without requiring writable disk', () => {
    const events = [];
    const logger = new AuditLogger({ sink: { info: (...args) => events.push(args), error: () => {} } });
    const entry = logger.log('LOGIN_SUCCESS', '127.0.0.1', 'user123');
    assert.equal(entry.action, 'LOGIN_SUCCESS');
    assert.equal(events.length, 1);
    assert.equal(events[0][0].audit.userId, 'user123');
  });

  test('reports optional append failures without throwing', () => {
    const fakeError = new Error('Disk full');
    fs.appendFile = (...args) => args.at(-1)(fakeError);
    const errors = [];
    const logger = new AuditLogger({
      logFile: '/tmp/audit-test.log',
      sink: { info: () => {}, error: (...args) => errors.push(args) },
    });

    logger.log('TEST_ACTION', '127.0.0.1', 'user123', { test: true });
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0].err, fakeError);
  });
});
