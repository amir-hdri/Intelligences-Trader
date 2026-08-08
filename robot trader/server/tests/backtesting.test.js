import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../index.js';
import { ModelManager } from '../modelManager.js';
import {
  BacktestRepository,
  DataCatalog,
  BacktestService,
  OnnxModelAdapter,
  PortfolioLedger,
  ExecutionSimulator,
  BacktestRiskEngine,
  ScenarioEngine,
  CausalFeaturePipeline,
  calculatePerformanceMetrics,
  validateRunConfig,
  BacktestValidationError,
} from '../modules/backtesting/index.js';

const START = Date.UTC(2024, 0, 1);

function candles(count = 80, instrumentId = 'TEST') {
  return Array.from({ length: count }, (_, index) => {
    const trend = index < count / 2 ? index * 0.8 : (count - index) * 0.8;
    const close = 100 + trend + Math.sin(index / 3);
    return {
      instrumentId,
      timestamp: START + index * 60_000,
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.8,
      close,
      volume: 1000 + index,
    };
  });
}

function config(datasetSnapshotId, overrides = {}) {
  return {
    schemaVersion: '1.0',
    datasetSnapshotId,
    instruments: ['TEST'],
    timeframe: '1m',
    startAt: START,
    endAt: START + 79 * 60_000,
    initialCash: 100_000,
    baseCurrency: 'USD',
    strategy: {
      type: 'RULE',
      name: 'SMA_CROSS',
      version: '1.0.0',
      parameters: { fastPeriod: 3, slowPeriod: 8, positionSize: 10, stopLossPct: 0.1, takeProfitPct: 0.2 },
    },
    execution: {
      fillModel: 'BAR', latencyMs: 0, commissionBps: 2,
      slippageModel: 'FIXED_BPS', slippageBps: 3, participationRate: 0.1,
      intrabarPolicy: 'WORST_CASE',
    },
    risk: { maxPositionNotional: 50_000, maxLeverage: 1, maxDrawdownPct: 0.5, liquidateOnBreach: true },
    scenario: { type: 'HISTORICAL', parameters: {}, seed: 'golden-seed' },
    metrics: { periodsPerYear: 252 * 390, riskFreeRateAnnual: 0 },
    qualityPolicy: 'FAIL',
    endOfRunPositionPolicy: 'LIQUIDATE',
    ...overrides,
  };
}

async function serviceWithDataset(id = 'unit-dataset') {
  const repository = new BacktestRepository({ disabled: true });
  const dataCatalog = new DataCatalog(repository);
  const service = new BacktestService({ repository, dataCatalog, maxConcurrent: 1 });
  await service.registerDataset({ id, timeframe: '1m', source: 'PHASE1_TEST_FIXTURE', candles: candles() });
  return service;
}

describe('Phase 3 data boundary and configuration', () => {
  test('stores immutable, content-addressed snapshots', async () => {
    const repository = new BacktestRepository({ disabled: true });
    const catalog = new DataCatalog(repository);
    const first = await catalog.registerSnapshot({ id: 'immutable', timeframe: '1m', candles: candles(10) });
    const second = await catalog.registerSnapshot({ id: 'immutable', timeframe: '1m', candles: candles(10) });
    assert.equal(first.contentHash, second.contentHash);
    await assert.rejects(
      catalog.registerSnapshot({ id: 'immutable', timeframe: '1m', candles: candles(11) }),
      /immutable/,
    );
  });

  test('rejects invalid OHLC and invalid run risk settings', async () => {
    const repository = new BacktestRepository({ disabled: true });
    const catalog = new DataCatalog(repository);
    const bad = candles(3);
    bad[1].high = bad[1].low - 1;
    await assert.rejects(catalog.registerSnapshot({ id: 'bad', timeframe: '1m', candles: bad }), BacktestValidationError);
    assert.throws(() => validateRunConfig({ ...config('x'), risk: { maxLeverage: 0 } }, {
      timeframe: '1m', startAt: START, endAt: START + 79 * 60_000, instruments: ['TEST'],
    }), BacktestValidationError);
  });
});

describe('Phase 3 accounting and execution', () => {
  test('derives realized PnL only from fills and includes fees', () => {
    const ledger = new PortfolioLedger(10_000, 'USD');
    ledger.applyFill({ id: 'f1', instrumentId: 'TEST', side: 'BUY', quantity: 10, price: 100, fee: 1, timestamp: START });
    const closed = ledger.applyFill({ id: 'f2', instrumentId: 'TEST', side: 'SELL', quantity: 10, price: 110, fee: 1.1, timestamp: START + 60_000 });
    ledger.mark('TEST', 110);
    assert.equal(closed.grossPnl, 100);
    assert.equal(closed.netPnl, 97.9);
    assert.ok(Math.abs(ledger.equity() - 10_097.9) < 1e-9);
  });

  test('supports deterministic partial fills under a participation cap', () => {
    const execution = new ExecutionSimulator({
      fillModel: 'BAR', latencyMs: 0, commissionBps: 0, slippageModel: 'FIXED_BPS',
      slippageBps: 0, participationRate: 0.1, volumeImpactCoefficient: 0,
    });
    execution.submit({ instrumentId: 'TEST', side: 'BUY', quantity: 20, type: 'MARKET', submittedAt: START });
    const fill = execution.processBar({ ...candles(1)[0], eventTime: START, availableAt: START, volume: 50, regime: 'RANGING' })[0];
    assert.equal(fill.quantity, 5);
    assert.equal(execution.orders[0].status, 'PARTIAL_FILLED');
    assert.equal(execution.orders[0].remainingQuantity, 15);
  });

  test('walks historical order-book depth', () => {
    const execution = new ExecutionSimulator({
      fillModel: 'ORDER_BOOK', latencyMs: 0, commissionBps: 0, slippageModel: 'BOOK_WALK',
      slippageBps: 0, participationRate: 1, volumeImpactCoefficient: 0,
    });
    execution.submit({ instrumentId: 'TEST', side: 'BUY', quantity: 4, type: 'MARKET', submittedAt: START });
    const fill = execution.processBar({
      ...candles(1)[0], eventTime: START, availableAt: START, regime: 'RANGING',
      book: { bids: [{ price: 99, quantity: 5 }], asks: [{ price: 101, quantity: 2 }, { price: 102, quantity: 2 }] },
    })[0];
    assert.equal(fill.quantity, 4);
    assert.equal(fill.rawPrice, 101.5);
  });

  test('enforces leverage across the whole portfolio rather than per symbol', () => {
    const risk = new BacktestRiskEngine({ maxPositionNotional: 10_000, maxLeverage: 1, maxDrawdownPct: 0.5 });
    const intent = risk.evaluateTarget({
      instrumentId: 'B', targetPosition: 100, price: 100, timestamp: START,
      portfolio: {
        equity: 10_000, grossExposure: 8_000, drawdown: 0,
        positions: [{ instrumentId: 'A', quantity: 80, averagePrice: 100 }],
      },
      signal: { reason: 'test' },
    });
    assert.equal(intent.acceptedTarget, 20);
    assert.equal(intent.resized, true);
  });
});

describe('Phase 3 scenarios and causal features', () => {
  test('applies reproducible volatility, trend, gap, and liquidity scenarios while preserving OHLC', () => {
    for (const scenario of [
      { type: 'VOLATILITY', parameters: { multiplier: 2 }, seed: 'a' },
      { type: 'TREND', parameters: { driftBpsPerBar: -5 }, seed: 'a' },
      { type: 'GAP', parameters: { gapPct: -0.1, eventIndex: 5 }, seed: 'a' },
      { type: 'LIQUIDITY_STRESS', parameters: { volumeMultiplier: 0.2 }, seed: 'a' },
    ]) {
      const engine = new ScenarioEngine(scenario);
      const first = engine.apply(candles(20)).events;
      const second = engine.apply(candles(20)).events;
      assert.deepEqual(first, second);
      assert.ok(first.every(bar => bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close)));
    }
  });

  test('causal features are not changed by future candles', () => {
    const original = candles(31);
    const changedFuture = candles(31);
    changedFuture[30] = { ...changedFuture[30], close: changedFuture[30].close * 4, high: changedFuture[30].high * 4 };
    const a = new CausalFeaturePipeline();
    const b = new CausalFeaturePipeline();
    let sequenceA;
    let sequenceB;
    for (let index = 0; index < 30; index += 1) {
      sequenceA = a.observe(original[index]);
      sequenceB = b.observe(changedFuture[index]);
    }
    assert.deepEqual(sequenceA, sequenceB);
  });
});

describe('Phase 3 performance metrics', () => {
  test('calculates Sharpe semantics, drawdown, win rate, and profit factor', () => {
    const result = calculatePerformanceMetrics({
      equityCurve: [
        { timestamp: START, equity: 100, grossExposure: 0 },
        { timestamp: START + 60_000, equity: 110, grossExposure: 10 },
        { timestamp: START + 120_000, equity: 99, grossExposure: 0 },
      ],
      closedTrades: [{ netPnl: 10 }, { netPnl: -5 }],
      fills: [], initialCash: 100, periodsPerYear: 252, riskFreeRateAnnual: 0,
    });
    assert.equal(result.maxDrawdown, 0.1);
    assert.equal(result.winRate, 0.5);
    assert.equal(result.profitFactor, 2);
    assert.ok(Number.isFinite(result.sharpeRatio));
  });

  test('uses null rather than non-JSON Infinity when there are no losses', () => {
    const result = calculatePerformanceMetrics({
      equityCurve: [{ timestamp: START, equity: 100, grossExposure: 0 }, { timestamp: START + 1, equity: 101, grossExposure: 0 }],
      closedTrades: [{ netPnl: 1 }], fills: [], initialCash: 100, periodsPerYear: 252,
    });
    assert.equal(result.profitFactor, null);
    assert.equal(result.reasons.profitFactor, 'NO_LOSING_TRADES');
    assert.doesNotThrow(() => JSON.stringify(result));
  });
});

describe('Phase 3 deterministic replay service', () => {
  test('runs from a pinned snapshot with next-bar execution and reproducible output', async () => {
    const service = await serviceWithDataset('golden');
    const firstCreated = await service.createRun(config('golden'));
    const first = await service.waitForRun(firstCreated.id);
    const secondCreated = await service.createRun(config('golden'));
    const second = await service.waitForRun(secondCreated.id);

    assert.equal(first.status, 'COMPLETED');
    assert.equal(second.status, 'COMPLETED');
    assert.equal(first.result.resultHash, second.result.resultHash);
    assert.deepEqual(first.result.fills, second.result.fills);
    assert.ok(first.result.fills.length >= 2);
    const firstFill = first.result.fills[0];
    const originatingSignal = first.result.signals.find(signal => signal.instrumentId === firstFill.instrumentId);
    assert.ok(firstFill.timestamp > originatingSignal.timestamp, 'signal must not fill on the same candle close');
    assert.ok(Math.abs(first.result.metrics.totalPnl - (first.result.metrics.finalEquity - 100_000)) < 1e-9);
    assert.equal(first.result.provenance.datasetSnapshotId, 'golden');
  });

  test('produces scenario-specific child results without mutating the source snapshot', async () => {
    const service = await serviceWithDataset('scenario-base');
    const historicalRun = await service.createRun(config('scenario-base'));
    const trendRun = await service.createRun(config('scenario-base', {
      scenario: { type: 'TREND', parameters: { driftBpsPerBar: 20 }, seed: 'trend' },
    }));
    const historical = await service.waitForRun(historicalRun.id);
    const trend = await service.waitForRun(trendRun.id);
    assert.notEqual(historical.result.resultHash, trend.result.resultHash);
    assert.equal(historical.result.provenance.datasetHash, trend.result.provenance.datasetHash);
    const comparison = await service.compare([historical.id, trend.id]);
    assert.equal(comparison.runs.length, 2);
  });

  test('runs a pinned trained ONNX model through the same strategy contract', async () => {
    const repository = new BacktestRepository({ disabled: true });
    const dataCatalog = new DataCatalog(repository);
    await dataCatalog.registerSnapshot({ id: 'ml-snapshot', timeframe: '1m', candles: candles() });
    const manager = new ModelManager();
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const modelPath = path.join(testDirectory, '..', 'models', 'market_model.onnx');
    assert.equal(await manager.loadModel(modelPath, 'ml-test-v1'), true);
    const adapter = new OnnxModelAdapter(manager);
    const service = new BacktestService({ repository, dataCatalog, modelAdapter: adapter, maxConcurrent: 1 });
    const created = await service.createRun(config('ml-snapshot', {
      strategy: {
        type: 'ML', name: 'ONNX_TCN', version: '1.0.0', modelVersion: 'ml-test-v1',
        parameters: { positionSize: 1, confidenceThreshold: 0, flatOnHold: true },
      },
    }));
    const completed = await service.waitForRun(created.id);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.result.strategy.strategy, 'ML');
    assert.match(completed.result.strategy.model.artifactHash, /^[a-f0-9]{64}$/);
    assert.ok(completed.result.signals.length > 0);
  });
});

describe('Phase 3 REST API', () => {
  const datasetId = 'api-phase3-dataset';
  let runId;

  test('reports queue and persistence health', async () => {
    const response = await request(app).get('/api/backtests/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'OPERATIONAL');
    assert.ok(['POSTGRESQL', 'MEMORY_FALLBACK'].includes(response.body.data.persistence));
  });

  test('registers a Phase-1 snapshot and runs a complete backtest', async () => {
    const registered = await request(app).post('/api/backtests/datasets').send({
      id: datasetId, timeframe: '1m', source: 'PHASE1_API_FIXTURE', candles: candles(),
    });
    assert.equal(registered.status, 201);
    assert.match(registered.body.data.contentHash, /^[a-f0-9]{64}$/);

    const response = await request(app).post('/api/backtests?wait=true').send(config(datasetId));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'COMPLETED');
    runId = response.body.data.id;
    assert.ok(response.body.data.result.metrics.totalTrades > 0);
  });

  test('returns status, results, and named artifacts', async () => {
    const status = await request(app).get(`/api/backtests/${runId}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.status, 'COMPLETED');
    const result = await request(app).get(`/api/backtests/${runId}/results`);
    assert.equal(result.status, 200);
    assert.match(result.body.data.resultHash, /^[a-f0-9]{64}$/);
    const fills = await request(app).get(`/api/backtests/${runId}/artifacts/fills`);
    assert.equal(fills.status, 200);
    assert.ok(Array.isArray(fills.body.data));
  });

  test('rejects a run that does not reference a stored snapshot', async () => {
    const response = await request(app).post('/api/backtests').send(config('missing-snapshot'));
    assert.equal(response.status, 400);
    assert.match(response.body.error, /not found/);
  });
});
