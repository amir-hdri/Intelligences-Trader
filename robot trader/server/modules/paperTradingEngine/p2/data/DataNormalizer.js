/**
 * Data Normalizer for P2 (OHLCV → ML-ready features)
 */
export class DataNormalizer {
  static normalize(ohlcv) {
    if (!ohlcv || ohlcv.length === 0) return [];
    const closes = ohlcv.map(c => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    return ohlcv.map(candle => ({
      ...candle,
      normOpen: (candle.open - min) / range,
      normHigh: (candle.high - min) / range,
      normLow: (candle.low - min) / range,
      normClose: (candle.close - min) / range,
      normVolume: Math.log1p(candle.volume) / 20,
    }));
  }
}
