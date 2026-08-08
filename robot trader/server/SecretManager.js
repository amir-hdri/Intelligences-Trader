import crypto from 'node:crypto';

export class SecretManager {
  constructor(masterKey = process.env.MASTER_ENCRYPTION_KEY) {
    this.algorithm = 'aes-256-gcm';
    if (!masterKey) throw new Error('FATAL ERROR: MASTER_ENCRYPTION_KEY is not defined in the environment.');

    const isHex64 = typeof masterKey === 'string' && /^[0-9a-fA-F]{64}$/.test(masterKey);
    this.masterKey = isHex64
      ? masterKey.toLowerCase()
      : crypto.createHash('sha256').update(String(masterKey)).digest('hex');
  }

  encrypt(text) {
    if (typeof text !== 'string') throw new TypeError('Plaintext must be a string');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.masterKey, 'hex'), iv);
    const encryptedData = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return {
      version: 1,
      algorithm: this.algorithm,
      iv: iv.toString('hex'),
      encryptedData: encryptedData.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  decrypt(encryptedData, iv, authTag) {
    if (![encryptedData, iv, authTag].every(value => typeof value === 'string' && /^[0-9a-f]+$/i.test(value))) {
      throw new TypeError('encryptedData, iv, and authTag must be hexadecimal strings');
    }
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(this.masterKey, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}

// Retained for compatibility with existing callers. Import this module only in
// a process where the key has already been provisioned.
export const secretManager = new SecretManager();
