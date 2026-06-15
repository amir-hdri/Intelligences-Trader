import { describe, test } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { secretManager } from './SecretManager.js';

describe('SecretManager', () => {
  test('encrypt and decrypt should work correctly with a standard string', () => {
    const originalText = 'my secret message 123!';
    const encrypted = secretManager.encrypt(originalText);

    assert.ok(encrypted.iv);
    assert.ok(encrypted.encryptedData);

    const decrypted = secretManager.decrypt(encrypted.encryptedData, encrypted.iv);
    assert.strictEqual(decrypted, originalText);
  });

  test('encrypt and decrypt should handle empty strings', () => {
    const originalText = '';
    const encrypted = secretManager.encrypt(originalText);
    const decrypted = secretManager.decrypt(encrypted.encryptedData, encrypted.iv);
    assert.strictEqual(decrypted, originalText);
  });

  test('encrypt and decrypt should handle large text', () => {
    const originalText = 'A'.repeat(10000);
    const encrypted = secretManager.encrypt(originalText);
    const decrypted = secretManager.decrypt(encrypted.encryptedData, encrypted.iv);
    assert.strictEqual(decrypted, originalText);
  });

  test('encrypt and decrypt should handle special characters', () => {
    const originalText = 'こんにちは世界! 🌟';
    const encrypted = secretManager.encrypt(originalText);
    const decrypted = secretManager.decrypt(encrypted.encryptedData, encrypted.iv);
    assert.strictEqual(decrypted, originalText);
  });

  test('decrypt should throw error on invalid encrypted data', () => {
    const iv = crypto.randomBytes(16).toString('hex');
    assert.throws(() => {
      secretManager.decrypt('invalid_hex_data', iv);
    });
  });

  test('decrypt should throw error on invalid iv', () => {
    const originalText = 'test';
    const encrypted = secretManager.encrypt(originalText);
    assert.throws(() => {
      secretManager.decrypt(encrypted.encryptedData, 'invalid_iv');
    });
  });

  test('decrypt should throw error with wrong iv but valid format', () => {
    const originalText = 'test';
    const encrypted = secretManager.encrypt(originalText);
    const wrongIv = crypto.randomBytes(16).toString('hex');
    assert.throws(() => {
      secretManager.decrypt(encrypted.encryptedData, wrongIv);
    });
  });
});
