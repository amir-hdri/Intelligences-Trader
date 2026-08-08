import { cloneJson, sha256 } from '../domain/canonical.js';
import { BacktestValidationError } from '../domain/validation.js';

function finiteParameter(parameters, name, fallback, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  const value = parameters[name] ?? fallback;
  if (!Number.isFinite(value) || (exclusiveMin ? value <= min : value < min) || value > max) {
    throw new BacktestValidationError(`scenario.parameters.${name} is out of range`);
  }
  return value;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/** Deterministic market path transformations plus causal regime labels. */
export class ScenarioEngine {
  constructor(config) {
    this.config = cloneJson(config);
    this.scenarioHash = sha256(this.config);
  }

  apply(sourceEvents) {
    const events = sourceEvents.map(cloneJson);
    const type = this.config.type;
    const parameters = this.config.parameters || {};
    const state = new Map();
    const gapIndex = Math.max(0, Math.floor(finiteParameter(parameters, 'eventIndex', Math.floor(events.length / 2), { min: 0 })));
    const gapAt = parameters.timestamp == null ? null : Number(parameters.timestamp);
    let globalIndex = 0;

    const volatilityMultiplier = finiteParameter(parameters, 'multiplier', type === 'VOLATILITY' ? 2 : 1, { min: 0, exclusiveMin: true, max: 20 });
    const driftBps = finiteParameter(parameters, 'driftBpsPerBar', type === 'TREND' ? 10 : 0, { min: -10_000, max: 10_000 });
    const gapPct = finiteParameter(parameters, 'gapPct', type === 'GAP' ? -0.1 : 0, { min: -0.99, max: 10 });
    const volumeMultiplier = finiteParameter(parameters, 'volumeMultiplier', type === 'LIQUIDITY_STRESS' ? 0.2 : 1, { min: 0, max: 100, exclusiveMin: true });
    const depthMultiplier = finiteParameter(parameters, 'depthMultiplier', type === 'LIQUIDITY_STRESS' ? 0.2 : 1, { min: 0, max: 100, exclusiveMin: true });
    const spreadMultiplier = finiteParameter(parameters, 'spreadMultiplier', type === 'LIQUIDITY_STRESS' ? 3 : 1, { min: 0, max: 100, exclusiveMin: true });

    for (const event of events) {
      const instrumentState = state.get(event.instrumentId) || { originalClose: null, transformedClose: null, closes: [], returns: [], localIndex: 0 };
      const originalClose = event.close;
      let transformedClose = originalClose;

      if (instrumentState.originalClose != null) {
        const originalReturn = Math.log(originalClose / instrumentState.originalClose);
        let transformedReturn = originalReturn;
        if (type === 'VOLATILITY') transformedReturn *= volatilityMultiplier;
        if (type === 'TREND') transformedReturn += driftBps / 10_000;
        const shouldGap = type === 'GAP' && (
          (gapAt != null && event.eventTime >= gapAt && !instrumentState.gapApplied)
          || (gapAt == null && globalIndex >= gapIndex && !instrumentState.gapApplied)
        );
        if (shouldGap) {
          transformedReturn += Math.log1p(gapPct);
          instrumentState.gapApplied = true;
        }
        transformedClose = instrumentState.transformedClose * Math.exp(transformedReturn);
      }
      if (!Number.isFinite(transformedClose) || transformedClose <= 0) {
        throw new BacktestValidationError(`Scenario ${type} generated a non-finite price path at ${event.instrumentId}:${event.eventTime}`);
      }

      const priceScale = transformedClose / originalClose;
      event.open *= priceScale;
      event.high *= priceScale;
      event.low *= priceScale;
      event.close = transformedClose;
      event.high = Math.max(event.high, event.open, event.close);
      event.low = Math.max(Number.EPSILON, Math.min(event.low, event.open, event.close));
      event.volume *= volumeMultiplier;
      if (![event.open, event.high, event.low, event.close, event.volume].every(Number.isFinite)) {
        throw new BacktestValidationError(`Scenario ${type} generated non-finite OHLCV at ${event.instrumentId}:${event.eventTime}`);
      }

      if (event.book) {
        event.book.bids = event.book.bids.map(level => ({ price: level.price * priceScale, quantity: level.quantity * depthMultiplier }));
        event.book.asks = event.book.asks.map(level => ({ price: level.price * priceScale, quantity: level.quantity * depthMultiplier }));
        if (type === 'LIQUIDITY_STRESS' && event.book.bids.length && event.book.asks.length) {
          const mid = (event.book.bids[0].price + event.book.asks[0].price) / 2;
          const halfSpread = (event.book.asks[0].price - event.book.bids[0].price) * spreadMultiplier / 2;
          const bidScale = (mid - halfSpread) / event.book.bids[0].price;
          const askScale = (mid + halfSpread) / event.book.asks[0].price;
          event.book.bids = event.book.bids.map(level => ({ ...level, price: Math.max(Number.EPSILON, level.price * bidScale) }));
          event.book.asks = event.book.asks.map(level => ({ ...level, price: Math.max(Number.EPSILON, level.price * askScale) }));
        }
        if ([...event.book.bids, ...event.book.asks].some(level => !Number.isFinite(level.price) || !Number.isFinite(level.quantity))) {
          throw new BacktestValidationError(`Scenario ${type} generated non-finite order-book depth at ${event.instrumentId}:${event.eventTime}`);
        }
      }

      const previousTransformed = instrumentState.transformedClose;
      if (previousTransformed != null) instrumentState.returns.push(Math.log(transformedClose / previousTransformed));
      instrumentState.closes.push(transformedClose);
      if (instrumentState.returns.length > 20) instrumentState.returns.shift();
      if (instrumentState.closes.length > 20) instrumentState.closes.shift();

      const volatility = standardDeviation(instrumentState.returns);
      const trend = instrumentState.closes.length > 1
        ? instrumentState.closes[instrumentState.closes.length - 1] / instrumentState.closes[0] - 1
        : 0;
      const highVolatilityThreshold = finiteParameter(parameters, 'highVolatilityThreshold', 0.02, { min: 0, max: 10 });
      const trendThreshold = finiteParameter(parameters, 'trendThreshold', 0.01, { min: 0, max: 10 });
      event.regime = volatility >= highVolatilityThreshold
        ? 'HIGH_VOLATILITY'
        : trend >= trendThreshold
          ? 'TRENDING_UP'
          : trend <= -trendThreshold
            ? 'TRENDING_DOWN'
            : 'RANGING';
      event.scenario = { type, synthetic: type !== 'HISTORICAL', scenarioHash: this.scenarioHash };

      instrumentState.originalClose = originalClose;
      instrumentState.transformedClose = transformedClose;
      instrumentState.localIndex += 1;
      state.set(event.instrumentId, instrumentState);
      globalIndex += 1;
    }

    return {
      events,
      metadata: {
        type,
        parameters: cloneJson(parameters),
        seed: this.config.seed,
        scenarioHash: this.scenarioHash,
        synthetic: type !== 'HISTORICAL',
        executionModifiers: { spreadMultiplier },
      },
    };
  }
}
