import crypto from 'crypto';

export class SecretManager {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    // Use a provided master key or generate one for dev (should be in env)
    this.masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!this.masterKey) {
      throw new Error('FATAL ERROR: MASTER_ENCRYPTION_KEY is not defined in the environment.');
    }

    // Ensure key is exactly 32 bytes (64 hex characters) and a valid hex string
    const isHex64 = typeof this.masterKey === 'string' && /^[0-9a-fA-F]{64}$/.test(this.masterKey);
    if (!isHex64) {
      // hash it to ensure it's 32 bytes (produces 64-char hex digest) if not provided properly
      this.masterKey = crypto.createHash('sha256').update(this.masterKey).digest('hex');
    }
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.masterKey, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted
    };
  }

  decrypt(encryptedData, iv) {
    const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.masterKey, 'hex'), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const secretManager = new SecretManager();
