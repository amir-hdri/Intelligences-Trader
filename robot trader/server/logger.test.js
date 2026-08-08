import { describe, test, after } from 'node:test';
import assert from 'node:assert';
import logger from './logger.js';

describe('ML logger', () => {
  after(() => logger.close());

  test('uses structured service metadata and at least one transport', () => {
    assert.strictEqual(logger.defaultMeta.service, 'ml-backend-server');
    assert.ok(logger.format);
    assert.ok(logger.transports.length >= 1);
  });
});
