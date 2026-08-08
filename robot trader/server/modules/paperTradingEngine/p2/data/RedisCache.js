import Redis from 'ioredis';

/**
 * Redis Cache for P2 real-time market data.
 *
 * Uses Redis when available; otherwise transparently falls back to an in-memory
 * store so the engine keeps working in environments without Redis (e.g. tests,
 * local dev without infra). Supports TTL expiry in both modes.
 */
export class RedisCache {
  constructor(url = process.env.REDIS_URL || 'redis://localhost:6379', opts = {}) {
    this.url = url;
    this.enabled = false;
    this.client = null;
    this.memory = new Map();
    this.ttlCheckMs = opts.ttlCheckMs ?? 1000;
    this._timer = null;

    if (opts.disabled === true || process.env.REDIS_DISABLED === 'true') {
      return;
    }

    try {
      this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
      this.client.on('error', () => { this.enabled = false; });
      this.enabled = true;
    } catch {
      this.enabled = false;
    }

    this._timer = setInterval(() => this._sweep(), this.ttlCheckMs);
    if (this._timer.unref) this._timer.unref();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt != null && entry.expiresAt <= now) this.memory.delete(key);
    }
  }

  async _set(key, data, ttlSeconds) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    if (this.enabled && this.client) {
      try {
        await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds || 0);
        return;
      } catch {
        // fall through to memory
      }
    }
    this.memory.set(key, { value: data, expiresAt });
  }

  async _get(key) {
    if (this.enabled && this.client) {
      try {
        const raw = await this.client.get(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        // fall through to memory
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async setOHLCV(symbol, timeframe, data) {
    await this._set(`ohlcv:${symbol}:${timeframe}`, data, 300); // 5 min TTL
  }

  async getOHLCV(symbol, timeframe) {
    return this._get(`ohlcv:${symbol}:${timeframe}`);
  }

  async setTicker(symbol, data) {
    await this._set(`ticker:${symbol}`, data, 10);
  }

  async getTicker(symbol) {
    return this._get(`ticker:${symbol}`);
  }

  async close() {
    if (this._timer) clearInterval(this._timer);
    if (this.enabled && this.client) {
      try { await this.client.quit(); } catch { /* ignore */ }
    }
  }
}
