import ccxt from 'ccxt';

/**
 * CCXT Data Adapter for P2 — real-time & historical OHLCV
 */
export class CCXTAdapter {
  constructor(exchangeId = 'binance') {
    this.exchange = new ccxt[exchangeId]({ enableRateLimit: true });
  }

  async fetchOHLCV(symbol, timeframe = '1m', limit = 500) {
    try {
      const data = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      return data.map(([ts, o, h, l, c, v]) => ({
        timestamp: ts,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      }));
    } catch (err) {
      console.error('CCXT fetch error:', err.message);
      return [];
    }
  }

  async fetchTicker(symbol) {
    try {
      return await this.exchange.fetchTicker(symbol);
    } catch (err) {
      console.error('CCXT ticker error:', err.message);
      return null;
    }
  }
}
