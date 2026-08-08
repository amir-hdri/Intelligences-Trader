import Redis from 'ioredis';

/**
 * Redis Cache for P2 real-time market data
 */
export class RedisCache {
  constructor(url = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.client = new Redis(url);
  }

  async setOHLCV(symbol, timeframe, data) {
    const key = `ohlcv:${symbol}:${timeframe}`;
    await this.client.set(key, JSON.stringify(data), 'EX', 300); // 5 min TTL
  }

  async getOHLCV(symbol, timeframe) {
    const key = `ohlcv:${symbol}:${timeframe}`;
    const raw = await this.client.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async setTicker(symbol, data) {
    await this.client.set(`ticker:${symbol}`, JSON.stringify(data), 'EX', 10);
  }

  async getTicker(symbol) {
    const raw = await this.client.get(`ticker:${symbol}`);
    return raw ? JSON.parse(raw) : null;
  }
}
