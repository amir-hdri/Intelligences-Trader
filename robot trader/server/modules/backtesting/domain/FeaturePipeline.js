import { sha256 } from './canonical.js';

export const MODEL_FEATURE_NAMES = Object.freeze([
  'open_from_sequence_base',
  'high_from_sequence_base',
  'low_from_sequence_base',
  'close_from_sequence_base',
  'log_volume',
  'close_return',
  'range_fraction',
  'body_fraction',
  'volume_change',
  'sequence_progress',
]);

export const MODEL_FEATURE_SCHEMA = Object.freeze({
  version: 'market-sequence-v1',
  featureNames: MODEL_FEATURE_NAMES,
  featureCount: MODEL_FEATURE_NAMES.length,
  sequenceLength: 30,
  dtype: 'float32',
});

export const MODEL_FEATURE_SCHEMA_HASH = sha256(MODEL_FEATURE_SCHEMA);
export const MODEL_NORMALIZER = Object.freeze({
  version: 'causal-relative-v1',
  fitScope: 'NONE_CAUSAL',
  description: 'Sequence-base relative prices, one-step returns, and log1p volume',
});
export const MODEL_NORMALIZER_HASH = sha256(MODEL_NORMALIZER);

/**
 * Causal feature pipeline.  It never fits a scaler over the backtest range;
 * every row is derived only from candles already visible at the current clock.
 */
export class CausalFeaturePipeline {
  constructor({ sequenceLength = MODEL_FEATURE_SCHEMA.sequenceLength } = {}) {
    if (!Number.isInteger(sequenceLength) || sequenceLength < 2) throw new TypeError('sequenceLength must be >= 2');
    this.sequenceLength = sequenceLength;
    this.history = new Map();
  }

  observe(candle) {
    const history = this.history.get(candle.instrumentId) || [];
    history.push(candle);
    if (history.length > this.sequenceLength) history.shift();
    this.history.set(candle.instrumentId, history);
    return this.sequence(candle.instrumentId);
  }

  sequence(instrumentId) {
    const history = this.history.get(instrumentId) || [];
    if (history.length < this.sequenceLength) return null;
    const baseClose = history[0].close;
    return history.map((candle, index) => {
      const previous = index > 0 ? history[index - 1] : candle;
      return [
        candle.open / baseClose - 1,
        candle.high / baseClose - 1,
        candle.low / baseClose - 1,
        candle.close / baseClose - 1,
        Math.log1p(candle.volume) / 20,
        candle.close / previous.close - 1,
        (candle.high - candle.low) / candle.close,
        (candle.close - candle.open) / candle.open,
        previous.volume > 0 ? candle.volume / previous.volume - 1 : 0,
        index / (this.sequenceLength - 1),
      ];
    });
  }

  historyFor(instrumentId) {
    return [...(this.history.get(instrumentId) || [])];
  }
}
