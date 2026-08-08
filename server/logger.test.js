import { describe, test, after } from 'node:test';
import assert from 'node:assert';
import logger from './logger.js';

describe('Proxy logger', () => {
  after(() => logger.close());

  test('uses structured service metadata and at least one transport', () => {
    assert.strictEqual(logger.defaultMeta.service, 'tse-proxy-server');
    assert.ok(logger.format);
    assert.ok(logger.transports.length >= 1);
  });
});
