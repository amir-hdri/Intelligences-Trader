const TIMEFRAME_MS = Object.freeze({
  tick: 0,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
});

const SCENARIOS = new Set(['HISTORICAL', 'VOLATILITY', 'TREND', 'GAP', 'LIQUIDITY_STRESS']);
const FILL_MODELS = new Set(['BAR', 'ORDER_BOOK']);
const SLIPPAGE_MODELS = new Set(['FIXED_BPS', 'VOLUME_IMPACT', 'BOOK_WALK']);
const STRATEGY_TYPES = new Set(['RULE', 'ML']);

export class BacktestValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'BacktestValidationError';
    this.details = details;
  }
}

function assertObject(value, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function finiteInRange(value, path, errors, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (!Number.isFinite(value) || (exclusiveMin ? value <= min : value < min) || value > max) {
    errors.push(`${path} must be a finite number ${exclusiveMin ? '>' : '>='} ${min} and <= ${max}`);
    return false;
  }
  return true;
}

export function parseTimestamp(value, path = 'timestamp') {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new BacktestValidationError(`${path} must be a valid timestamp`);
  return parsed;
}

export function timeframeMilliseconds(timeframe) {
  return TIMEFRAME_MS[timeframe] ?? null;
}

/** Validate and normalize the immutable run configuration. */
export function validateRunConfig(input, datasetMetadata = null) {
  const errors = [];
  if (!assertObject(input, 'config', errors)) throw new BacktestValidationError('Invalid backtest config', errors);

  const datasetSnapshotId = input.datasetSnapshotId;
  if (typeof datasetSnapshotId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(datasetSnapshotId)) {
    errors.push('datasetSnapshotId must use 1-128 safe characters');
  }

  const timeframe = input.timeframe || datasetMetadata?.timeframe || '1h';
  if (!(timeframe in TIMEFRAME_MS)) errors.push(`Unsupported timeframe: ${timeframe}`);
  if (datasetMetadata?.timeframe && timeframe !== datasetMetadata.timeframe) {
    errors.push(`timeframe ${timeframe} does not match dataset timeframe ${datasetMetadata.timeframe}`);
  }

  let startAt;
  let endAt;
  try {
    startAt = parseTimestamp(input.startAt ?? datasetMetadata?.startAt, 'startAt');
    endAt = parseTimestamp(input.endAt ?? datasetMetadata?.endAt, 'endAt');
    if (startAt >= endAt) errors.push('startAt must be earlier than endAt');
    if (datasetMetadata && (endAt < datasetMetadata.startAt || startAt > datasetMetadata.endAt)) {
      errors.push('Requested date range does not overlap the dataset snapshot');
    }
  } catch (error) {
    errors.push(error.message);
  }

  const initialCash = input.initialCash ?? 1_000_000;
  finiteInRange(initialCash, 'initialCash', errors, { min: 0, exclusiveMin: true, max: 1e15 });

  const baseCurrency = input.baseCurrency || 'IRR';
  if (typeof baseCurrency !== 'string' || !/^[A-Z]{3,8}$/.test(baseCurrency)) {
    errors.push('baseCurrency must be an uppercase 3-8 character code');
  }

  const availableInstruments = new Set(datasetMetadata?.instruments || []);
  const instruments = input.instruments?.length ? input.instruments : [...availableInstruments];
  if (!Array.isArray(instruments) || instruments.length === 0 || instruments.length > 50) {
    errors.push('instruments must contain between 1 and 50 instruments');
  } else {
    for (const instrument of instruments) {
      if (typeof instrument !== 'string' || instrument.length > 64) errors.push('Each instrument must be a string of at most 64 characters');
      if (availableInstruments.size && !availableInstruments.has(instrument)) {
        errors.push(`Instrument ${instrument} is absent from dataset snapshot`);
      }
    }
  }

  const strategyInput = input.strategy || {};
  if (!assertObject(strategyInput, 'strategy', errors)) errors.push('strategy is required');
  const strategyType = strategyInput.type || 'RULE';
  if (!STRATEGY_TYPES.has(strategyType)) errors.push(`Unsupported strategy.type: ${strategyType}`);
  const strategyName = strategyInput.name || (strategyType === 'RULE' ? 'SMA_CROSS' : 'ONNX_TCN');
  if (strategyType === 'RULE' && !['SMA_CROSS', 'MOMENTUM'].includes(strategyName)) {
    errors.push(`Unsupported rule strategy: ${strategyName}`);
  }
  const strategyVersion = strategyInput.version || '1.0.0';
  const parameters = strategyInput.parameters || {};
  if (!assertObject(parameters, 'strategy.parameters', errors)) errors.push('strategy.parameters is invalid');
  if (strategyType === 'ML' && (!strategyInput.modelVersion || typeof strategyInput.modelVersion !== 'string')) {
    errors.push('strategy.modelVersion is required for ML backtests');
  }

  const fastPeriod = parameters.fastPeriod ?? 5;
  const slowPeriod = parameters.slowPeriod ?? 20;
  if (strategyType === 'RULE' && strategyName === 'SMA_CROSS') {
    if (!Number.isInteger(fastPeriod) || fastPeriod < 1) errors.push('strategy.parameters.fastPeriod must be a positive integer');
    if (!Number.isInteger(slowPeriod) || slowPeriod <= fastPeriod || slowPeriod > 1000) {
      errors.push('strategy.parameters.slowPeriod must be an integer greater than fastPeriod and <= 1000');
    }
  }
  if (strategyType === 'RULE' && strategyName === 'MOMENTUM') {
    const lookback = parameters.lookback ?? 10;
    if (!Number.isInteger(lookback) || lookback < 1 || lookback > 1000) errors.push('strategy.parameters.lookback must be an integer between 1 and 1000');
    if (parameters.threshold != null) finiteInRange(parameters.threshold, 'strategy.parameters.threshold', errors, { min: 0, max: 10 });
  }
  if (strategyType === 'ML' && parameters.confidenceThreshold != null) {
    finiteInRange(parameters.confidenceThreshold, 'strategy.parameters.confidenceThreshold', errors, { min: 0, max: 1 });
  }
  const positionSize = parameters.positionSize ?? 1;
  finiteInRange(positionSize, 'strategy.parameters.positionSize', errors, { min: 0, exclusiveMin: true, max: 1e12 });
  for (const field of ['stopLossPct', 'takeProfitPct']) {
    if (parameters[field] != null) finiteInRange(parameters[field], `strategy.parameters.${field}`, errors, { min: 0, exclusiveMin: true, max: 1 });
  }

  const executionInput = input.execution || {};
  const fillModel = executionInput.fillModel || 'BAR';
  const slippageModel = executionInput.slippageModel || (fillModel === 'ORDER_BOOK' ? 'BOOK_WALK' : 'FIXED_BPS');
  if (!FILL_MODELS.has(fillModel)) errors.push(`Unsupported execution.fillModel: ${fillModel}`);
  if (fillModel === 'ORDER_BOOK' && datasetMetadata && !datasetMetadata.hasOrderBook) {
    errors.push('ORDER_BOOK execution requires order-book depth on every selected dataset event');
  }
  if (!SLIPPAGE_MODELS.has(slippageModel)) errors.push(`Unsupported execution.slippageModel: ${slippageModel}`);
  const latencyMs = executionInput.latencyMs ?? 0;
  const commissionBps = executionInput.commissionBps ?? 4;
  const makerFeeBps = executionInput.makerFeeBps ?? commissionBps;
  const takerFeeBps = executionInput.takerFeeBps ?? commissionBps;
  const slippageBps = executionInput.slippageBps ?? 5;
  const participationRate = executionInput.participationRate ?? 0.1;
  finiteInRange(latencyMs, 'execution.latencyMs', errors, { min: 0, max: 86_400_000 });
  finiteInRange(commissionBps, 'execution.commissionBps', errors, { min: 0, max: 10_000 });
  finiteInRange(makerFeeBps, 'execution.makerFeeBps', errors, { min: 0, max: 10_000 });
  finiteInRange(takerFeeBps, 'execution.takerFeeBps', errors, { min: 0, max: 10_000 });
  finiteInRange(slippageBps, 'execution.slippageBps', errors, { min: 0, max: 10_000 });
  finiteInRange(participationRate, 'execution.participationRate', errors, { min: 0, exclusiveMin: true, max: 1 });
  const volumeImpactCoefficient = executionInput.volumeImpactCoefficient ?? 25;
  finiteInRange(volumeImpactCoefficient, 'execution.volumeImpactCoefficient', errors, { min: 0, max: 100_000 });
  const intrabarPolicy = executionInput.intrabarPolicy || 'WORST_CASE';
  if (!['WORST_CASE', 'LOWER_TIMEFRAME'].includes(intrabarPolicy)) errors.push('execution.intrabarPolicy is unsupported');

  const riskInput = input.risk || {};
  const maxPositionNotional = riskInput.maxPositionNotional ?? initialCash;
  const maxLeverage = riskInput.maxLeverage ?? 1;
  const maxDrawdownPct = riskInput.maxDrawdownPct ?? 1;
  finiteInRange(maxPositionNotional, 'risk.maxPositionNotional', errors, { min: 0, exclusiveMin: true, max: 1e15 });
  finiteInRange(maxLeverage, 'risk.maxLeverage', errors, { min: 0, exclusiveMin: true, max: 100 });
  finiteInRange(maxDrawdownPct, 'risk.maxDrawdownPct', errors, { min: 0, exclusiveMin: true, max: 1 });

  const scenarioInput = input.scenario || {};
  const scenarioType = scenarioInput.type || 'HISTORICAL';
  if (!SCENARIOS.has(scenarioType)) errors.push(`Unsupported scenario.type: ${scenarioType}`);
  const scenarioParameters = scenarioInput.parameters || {};
  if (!assertObject(scenarioParameters, 'scenario.parameters', errors)) errors.push('scenario.parameters is invalid');
  for (const [name, value] of Object.entries(scenarioParameters)) {
    if (!Number.isFinite(value)) errors.push(`scenario.parameters.${name} must be finite`);
  }
  const seed = String(scenarioInput.seed ?? 'backtest-default-seed');
  if (seed.length < 1 || seed.length > 256) errors.push('scenario.seed must contain 1-256 characters');

  const qualityPolicy = input.qualityPolicy || 'FAIL';
  if (!['FAIL', 'WARN_AND_SKIP'].includes(qualityPolicy)) errors.push('qualityPolicy must be FAIL or WARN_AND_SKIP');
  const endOfRunPositionPolicy = input.endOfRunPositionPolicy || 'LIQUIDATE';
  if (!['LIQUIDATE', 'MARK_TO_MARKET'].includes(endOfRunPositionPolicy)) {
    errors.push('endOfRunPositionPolicy must be LIQUIDATE or MARK_TO_MARKET');
  }
  const periodsPerYear = input.metrics?.periodsPerYear ?? ({ '1m': 252 * 390, '5m': 252 * 78, '15m': 252 * 26, '1h': 252 * 6.5, '1d': 252, tick: 252 }[timeframe] || 252);
  finiteInRange(periodsPerYear, 'metrics.periodsPerYear', errors, { min: 0, exclusiveMin: true, max: 1e9 });
  const riskFreeRateAnnual = input.metrics?.riskFreeRateAnnual ?? 0;
  finiteInRange(riskFreeRateAnnual, 'metrics.riskFreeRateAnnual', errors, { min: -1, max: 10 });

  const maxEvents = input.limits?.maxEvents ?? 100_000;
  if (!Number.isInteger(maxEvents) || maxEvents < 2 || maxEvents > 2_000_000) errors.push('limits.maxEvents must be an integer between 2 and 2,000,000');
  const maxRuntimeMs = input.limits?.maxRuntimeMs ?? 120_000;
  if (!Number.isInteger(maxRuntimeMs) || maxRuntimeMs < 100 || maxRuntimeMs > 3_600_000) {
    errors.push('limits.maxRuntimeMs must be an integer between 100 and 3,600,000');
  }

  if (errors.length) throw new BacktestValidationError('Invalid backtest config', errors);

  return {
    schemaVersion: '1.0',
    datasetSnapshotId,
    instruments: [...new Set(instruments)].sort(),
    timeframe,
    startAt,
    endAt,
    initialCash,
    baseCurrency,
    strategy: {
      type: strategyType,
      name: strategyName,
      version: strategyVersion,
      parameters: { ...parameters, fastPeriod, slowPeriod, positionSize },
      ...(strategyInput.modelVersion ? { modelVersion: strategyInput.modelVersion } : {}),
    },
    execution: {
      fillModel,
      latencyMs,
      commissionBps,
      makerFeeBps,
      takerFeeBps,
      slippageModel,
      slippageBps,
      participationRate,
      intrabarPolicy,
      volumeImpactCoefficient,
    },
    risk: {
      maxPositionNotional,
      maxLeverage,
      maxDrawdownPct,
      liquidateOnBreach: riskInput.liquidateOnBreach !== false,
    },
    scenario: { type: scenarioType, parameters: { ...scenarioParameters }, seed },
    metrics: { periodsPerYear, riskFreeRateAnnual },
    qualityPolicy,
    endOfRunPositionPolicy,
    limits: { maxEvents, maxRuntimeMs },
  };
}

export function validateCandle(candle, index = 0, defaultInstrument = null) {
  const prefix = `candles[${index}]`;
  if (!candle || typeof candle !== 'object' || Array.isArray(candle)) {
    throw new BacktestValidationError(`${prefix} must be an object`);
  }
  const timestamp = parseTimestamp(candle.timestamp ?? candle.eventTime, `${prefix}.timestamp`);
  const availableAt = parseTimestamp(candle.availableAt ?? timestamp, `${prefix}.availableAt`);
  if (availableAt < timestamp) throw new BacktestValidationError(`${prefix}.availableAt cannot precede event time`);
  const instrumentId = candle.instrumentId || candle.symbol || defaultInstrument;
  if (typeof instrumentId !== 'string' || !instrumentId || instrumentId.length > 64) {
    throw new BacktestValidationError(`${prefix}.instrumentId is required`);
  }

  const values = {};
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    const value = Number(candle[field]);
    if (!Number.isFinite(value)) throw new BacktestValidationError(`${prefix}.${field} must be finite`);
    values[field] = value;
  }
  if (values.open <= 0 || values.high <= 0 || values.low <= 0 || values.close <= 0) {
    throw new BacktestValidationError(`${prefix} prices must be positive`);
  }
  if (values.volume < 0) throw new BacktestValidationError(`${prefix}.volume cannot be negative`);
  if (values.high < Math.max(values.open, values.close) || values.low > Math.min(values.open, values.close) || values.high < values.low) {
    throw new BacktestValidationError(`${prefix} violates OHLC invariants`);
  }

  let book;
  if (candle.book != null) {
    if (!candle.book || !Array.isArray(candle.book.bids) || !Array.isArray(candle.book.asks)) {
      throw new BacktestValidationError(`${prefix}.book must contain bids and asks arrays`);
    }
    const normalizeSide = (levels, side) => levels.map((level, levelIndex) => {
      const price = Number(level.price ?? level[0]);
      const quantity = Number(level.quantity ?? level.qty ?? level[1]);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 0) {
        throw new BacktestValidationError(`${prefix}.book.${side}[${levelIndex}] is invalid`);
      }
      return { price, quantity };
    });
    book = {
      bids: normalizeSide(candle.book.bids, 'bids').sort((a, b) => b.price - a.price),
      asks: normalizeSide(candle.book.asks, 'asks').sort((a, b) => a.price - b.price),
    };
    if (book.bids.length && book.asks.length && book.bids[0].price >= book.asks[0].price) {
      throw new BacktestValidationError(`${prefix}.book is crossed`);
    }
  }

  return {
    eventId: String(candle.eventId || `${instrumentId}:${timestamp}`),
    instrumentId,
    timestamp,
    eventTime: timestamp,
    availableAt,
    sequence: Number.isInteger(candle.sequence) ? candle.sequence : index,
    ...values,
    ...(book ? { book } : {}),
    qualityFlags: Array.isArray(candle.qualityFlags) ? [...candle.qualityFlags] : [],
  };
}
