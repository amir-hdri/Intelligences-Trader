import ccxt from 'ccxt';

/**
 * Historical Data Provider (Yahoo-style + CCXT fallback)
 */
export class HistoricalDataProvider {
  constructor() {
    this.exchange = new ccxt.binance();
  }

  async fetchHistorical(symbol, timeframe = '1h', since = null, limit = 500) {
    try {
      const data = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
      return data.map(([ts, o, h, l, c, v]) => ({
        timestamp: ts, open: o, high: h, low: l, close: c, volume: v,
      }));
    } catch (e) {
      console.warn('Historical fetch failed, returning empty');
      return [];
    }
  }
}
