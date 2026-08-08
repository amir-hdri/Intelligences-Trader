import { CausalFeaturePipeline, MODEL_FEATURE_SCHEMA, MODEL_FEATURE_SCHEMA_HASH } from './FeaturePipeline.js';

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

class SmaCrossStrategy {
  constructor(config) {
    this.config = config;
    this.history = new Map();
  }

  async initialize() {}

  onBar(bar) {
    const parameters = this.config.parameters;
    const history = this.history.get(bar.instrumentId) || [];
    history.push(bar.close);
    if (history.length > parameters.slowPeriod) history.shift();
    this.history.set(bar.instrumentId, history);
    if (history.length < parameters.slowPeriod) return null;

    const fast = average(history.slice(-parameters.fastPeriod));
    const slow = average(history);
    const difference = (fast - slow) / slow;
    const neutralBand = Number.isFinite(parameters.neutralBand) ? Math.max(0, parameters.neutralBand) : 0;
    const direction = difference > neutralBand ? 1 : difference < -neutralBand ? -1 : 0;
    return {
      action: direction > 0 ? 'BUY' : direction < 0 ? 'SELL' : 'HOLD',
      targetPosition: direction * parameters.positionSize,
      confidence: Math.min(1, Math.abs(difference) * 100),
      reason: `SMA(${parameters.fastPeriod})=${fast.toFixed(6)} vs SMA(${parameters.slowPeriod})=${slow.toFixed(6)}`,
    };
  }

  onFill() {}
  finalize() { return { strategy: 'SMA_CROSS' }; }
}

class MomentumStrategy {
  constructor(config) {
    this.config = config;
    this.history = new Map();
  }

  async initialize() {}

  onBar(bar) {
    const lookback = this.config.parameters.lookback ?? 10;
    const threshold = this.config.parameters.threshold ?? 0;
    const history = this.history.get(bar.instrumentId) || [];
    history.push(bar.close);
    if (history.length > lookback + 1) history.shift();
    this.history.set(bar.instrumentId, history);
    if (history.length < lookback + 1) return null;
    const momentum = bar.close / history[0] - 1;
    const direction = momentum > threshold ? 1 : momentum < -threshold ? -1 : 0;
    return {
      action: direction > 0 ? 'BUY' : direction < 0 ? 'SELL' : 'HOLD',
      targetPosition: direction * this.config.parameters.positionSize,
      confidence: Math.min(1, Math.abs(momentum) * 20),
      reason: `${lookback}-bar momentum=${momentum.toFixed(6)}`,
    };
  }

  onFill() {}
  finalize() { return { strategy: 'MOMENTUM' }; }
}

class MlStrategy {
  constructor(config, modelAdapter) {
    if (!modelAdapter) throw new Error('ML strategy requires a model adapter');
    this.config = config;
    this.modelAdapter = modelAdapter;
    this.features = new CausalFeaturePipeline({ sequenceLength: MODEL_FEATURE_SCHEMA.sequenceLength });
    this.modelMetadata = null;
  }

  async initialize(context) {
    this.modelMetadata = await this.modelAdapter.assertCompatible({
      modelVersion: this.config.modelVersion,
      featureSchemaHash: MODEL_FEATURE_SCHEMA_HASH,
      sequenceLength: MODEL_FEATURE_SCHEMA.sequenceLength,
      featureCount: MODEL_FEATURE_SCHEMA.featureCount,
    });
    this.correlationId = context.runId;
  }

  async onBar(bar) {
    const sequence = this.features.observe(bar);
    if (!sequence) return null;
    const prediction = await this.modelAdapter.predict(sequence, this.correlationId);
    const threshold = this.config.parameters.confidenceThreshold ?? 0.6;
    const accepted = prediction.confidence >= threshold;
    const action = accepted ? prediction.action : 'HOLD';
    const direction = action === 'BUY' ? 1 : action === 'SELL' ? -1 : 0;
    const flatOnHold = this.config.parameters.flatOnHold === true;
    return {
      action,
      targetPosition: action === 'HOLD' && !flatOnHold ? null : direction * this.config.parameters.positionSize,
      confidence: prediction.confidence,
      probabilities: prediction.probabilities,
      reason: accepted ? `Pinned ML model ${this.config.modelVersion}` : `Confidence below threshold ${threshold}`,
    };
  }

  onFill() {}
  finalize() { return { strategy: 'ML', model: this.modelMetadata }; }
}

export class StrategyEngine {
  constructor(strategy) {
    this.strategy = strategy;
  }

  async initialize(context) {
    await this.strategy.initialize(context);
  }

  async onBar(bar, context) {
    return this.strategy.onBar(bar, context);
  }

  async onFill(fill, portfolio) {
    return this.strategy.onFill(fill, portfolio);
  }

  async finalize() {
    return this.strategy.finalize();
  }
}

export function createStrategy(config, { modelAdapter } = {}) {
  if (config.type === 'ML') return new StrategyEngine(new MlStrategy(config, modelAdapter));
  if (config.name === 'SMA_CROSS') return new StrategyEngine(new SmaCrossStrategy(config));
  if (config.name === 'MOMENTUM') return new StrategyEngine(new MomentumStrategy(config));
  throw new Error(`Unsupported rule strategy: ${config.name}`);
}
