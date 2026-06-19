import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

describe('SecretManager', () => {
  const originalEnv = process.env.MASTER_ENCRYPTION_KEY;
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let SecretManager, secretManager;

  before(async () => {
    process.env.MASTER_ENCRYPTION_KEY = testKey;
    const module = await import('./SecretManager.js');
    SecretManager = module.SecretManager;
    secretManager = module.secretManager;
  });

  after(() => {
    process.env.MASTER_ENCRYPTION_KEY = originalEnv;
  });

  test('throws error when MASTER_ENCRYPTION_KEY is missing', () => {
    const tempKey = process.env.MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;

    assert.throws(
      () => new SecretManager(),
      /FATAL ERROR: MASTER_ENCRYPTION_KEY is not defined in the environment/
    );

    process.env.MASTER_ENCRYPTION_KEY = tempKey;
  });

  test('encrypts and decrypts text successfully with valid key', () => {
    const sm = new SecretManager();
    const plainText = 'Hello, Secret World!';

    const { iv, encryptedData } = sm.encrypt(plainText);

    assert.ok(iv);
    assert.ok(encryptedData);
    assert.notStrictEqual(encryptedData, plainText);

    const decryptedText = sm.decrypt(encryptedData, iv);

    assert.strictEqual(decryptedText, plainText);
  });

  test('handles environment MASTER_ENCRYPTION_KEY', () => {
    const sm = new SecretManager();

    assert.strictEqual(sm.masterKey, testKey);

    const plainText = 'Testing env key';
    const { iv, encryptedData } = sm.encrypt(plainText);
    const decryptedText = sm.decrypt(encryptedData, iv);

    assert.strictEqual(decryptedText, plainText);
  });

  test('hashes an invalid length MASTER_ENCRYPTION_KEY to 32 bytes', () => {
    const invalidKey = 'too-short-key';

    const tempKey = process.env.MASTER_ENCRYPTION_KEY;
    process.env.MASTER_ENCRYPTION_KEY = invalidKey;

    const sm = new SecretManager();

    // Should be hashed to 32 bytes (64 hex characters)
    assert.strictEqual(sm.masterKey.length, 64);
    assert.notStrictEqual(sm.masterKey, invalidKey);

    const plainText = 'Testing invalid key fallback';
    const { iv, encryptedData } = sm.encrypt(plainText);
    const decryptedText = sm.decrypt(encryptedData, iv);

    assert.strictEqual(decryptedText, plainText);

    process.env.MASTER_ENCRYPTION_KEY = tempKey;
  });

  test('exported singleton instance works', () => {
    const plainText = 'Testing singleton';
    const { iv, encryptedData } = secretManager.encrypt(plainText);

    assert.ok(iv);
    assert.ok(encryptedData);

    const decryptedText = secretManager.decrypt(encryptedData, iv);
    assert.strictEqual(decryptedText, plainText);
  });

  test('decrypting with wrong iv fails or produces gibberish', () => {
    const sm = new SecretManager();
    const plainText = 'Secret payload';
    const { iv, encryptedData } = sm.encrypt(plainText);

    // Create a wrong IV of same length
    const wrongIv = '00'.repeat(16); // 16 bytes = 32 hex chars

    try {
      const decryptedText = sm.decrypt(encryptedData, wrongIv);
      assert.notStrictEqual(decryptedText, plainText);
    } catch (e) {
      // It might throw a decipher error due to bad padding, which is also fine
      assert.ok(e);
    }
  });
});
