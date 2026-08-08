/**
 * Causal OHLCV normalizer used by the legacy P2 surface.
 *
 * Each row is normalized using only values observed up to that row. The old
 * implementation used the min/max of the complete array and leaked future
 * test-range information into earlier features.
 */
export class DataNormalizer {
  static normalize(ohlcv) {
    if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
    let runningLow = Infinity;
    let runningHigh = -Infinity;

    return ohlcv.map((candle, index) => {
      for (const field of ['open', 'high', 'low', 'close', 'volume']) {
        if (!Number.isFinite(candle?.[field])) throw new TypeError(`ohlcv[${index}].${field} must be finite`);
      }
      if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.volume < 0) {
        throw new TypeError(`ohlcv[${index}] contains invalid prices or volume`);
      }
      if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
        throw new TypeError(`ohlcv[${index}] violates OHLC invariants`);
      }

      runningLow = Math.min(runningLow, candle.low);
      runningHigh = Math.max(runningHigh, candle.high);
      const range = runningHigh - runningLow || 1;
      return {
        ...candle,
        normOpen: (candle.open - runningLow) / range,
        normHigh: (candle.high - runningLow) / range,
        normLow: (candle.low - runningLow) / range,
        normClose: (candle.close - runningLow) / range,
        normVolume: Math.log1p(candle.volume) / 20,
      };
    });
  }
}
