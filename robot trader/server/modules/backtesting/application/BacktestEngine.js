import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { sha256 } from '../domain/canonical.js';
import { SimulationClock } from '../domain/SimulationClock.js';
import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import { PortfolioLedger } from '../domain/PortfolioLedger.js';
import { BacktestRiskEngine } from '../domain/BacktestRiskEngine.js';
import { ExecutionSimulator } from '../domain/ExecutionSimulator.js';
import { createStrategy } from '../domain/StrategyEngine.js';
import { calculatePerformanceMetrics, calculateRegimeAttribution } from '../domain/PerformanceMetrics.js';

const EPSILON = 1e-12;

export class BacktestCancelledError extends Error {
  constructor() {
    super('Backtest was cancelled');
    this.name = 'BacktestCancelledError';
  }
}

export class BacktestEngine {
  constructor({ modelAdapter } = {}) {
    this.modelAdapter = modelAdapter;
  }

  async run({
    runId,
    config,
    loadedDataset,
    cancellationToken = { cancelled: false },
    shouldCancel = async () => false,
    onProgress = () => {},
  }) {
    const clock = new SimulationClock();
    const scenarioEngine = new ScenarioEngine(config.scenario);
    const scenarioResult = scenarioEngine.apply(loadedDataset.events);
    const events = scenarioResult.events;
    const ledger = new PortfolioLedger(config.initialCash, config.baseCurrency);
    const risk = new BacktestRiskEngine(config.risk);
    const execution = new ExecutionSimulator(config.execution, scenarioResult.metadata.executionModifiers);
    const strategy = createStrategy(config.strategy, { modelAdapter: this.modelAdapter });
    const signals = [];
    const desiredTargets = new Map();
    const latestBars = new Map();

    await strategy.initialize({ runId, config, provenance: loadedDataset.provenance });
    ledger.snapshot(events[0].availableAt, 'INITIAL');

    let processed = 0;
    let nextCancellationCheck = 0;
    for (let offset = 0; offset < events.length;) {
      let remoteCancellation = false;
      if (processed >= nextCancellationCheck) {
        remoteCancellation = await shouldCancel();
        nextCancellationCheck = processed + 1000;
      }
      if (cancellationToken.cancelled || remoteCancellation) {
        cancellationToken.cancelled = true;
        throw new BacktestCancelledError();
      }
      if (cancellationToken.deadline && Date.now() > cancellationToken.deadline) {
        throw new Error(`Backtest exceeded maxRuntimeMs (${config.limits.maxRuntimeMs})`);
      }
      const time = events[offset].availableAt;
      const group = [];
      while (offset < events.length && events[offset].availableAt === time) {
        group.push(events[offset]);
        offset += 1;
      }
      clock.advance(time);

      // Existing orders were created from earlier information, so they execute
      // before this bar's close can be observed by the strategy.
      for (const bar of group) {
        const fills = execution.processBar(bar);
        for (const fill of fills) {
          ledger.applyFill(fill);
          await strategy.onFill(fill, ledger.portfolioSnapshot());
        }
        const protectiveFill = this._applyProtectiveExit({ bar, ledger, execution, config });
        if (protectiveFill) {
          ledger.applyFill(protectiveFill);
          await strategy.onFill(protectiveFill, ledger.portfolioSnapshot());
          desiredTargets.set(bar.instrumentId, 0);
        }
      }

      // Publish all marks at this timestamp before any strategy in a
      // multi-instrument run is called.
      for (const bar of group) {
        latestBars.set(bar.instrumentId, bar);
        ledger.mark(bar.instrumentId, bar.close);
      }
      const groupRegime = group.length === 1 ? group[0].regime : 'MIXED';
      ledger.snapshot(time, groupRegime);

      if (ledger.currentDrawdown >= config.risk.maxDrawdownPct) {
        risk.killSwitchActive = true;
        if (config.risk.liquidateOnBreach) {
          for (const position of ledger.portfolioSnapshot().positions) {
            if (Math.abs(position.quantity) <= EPSILON) continue;
            const bar = latestBars.get(position.instrumentId);
            if (!bar) continue;
            execution.cancelInstrument(position.instrumentId, time, 'RISK_LIQUIDATION');
            const intent = risk.liquidationIntent(position.instrumentId, ledger.portfolioSnapshot(), time);
            const fill = execution.executeImmediate(intent, bar, bar.close, 'DRAWDOWN_KILL_SWITCH');
            ledger.applyFill(fill);
            await strategy.onFill(fill, ledger.portfolioSnapshot());
            desiredTargets.set(position.instrumentId, 0);
          }
          ledger.snapshot(time, groupRegime);
        }
      }

      for (const bar of group) {
        const signal = await strategy.onBar(bar, {
          clock: clock.now(),
          portfolio: ledger.portfolioSnapshot(),
          latestBars: new Map(latestBars),
        });
        if (!signal) continue;
        signals.push({
          sequence: signals.length + 1,
          timestamp: time,
          instrumentId: bar.instrumentId,
          regime: bar.regime,
          ...signal,
        });
        if (signal.targetPosition == null) continue;

        const previousTarget = desiredTargets.get(bar.instrumentId);
        if (previousTarget != null && Math.abs(previousTarget - signal.targetPosition) > EPSILON) {
          execution.cancelInstrument(bar.instrumentId, time, 'TARGET_REPLACED');
        }
        desiredTargets.set(bar.instrumentId, signal.targetPosition);
        const intent = risk.evaluateTarget({
          instrumentId: bar.instrumentId,
          targetPosition: signal.targetPosition,
          price: bar.close,
          portfolio: ledger.portfolioSnapshot(),
          timestamp: time,
          signal,
          pendingDelta: execution.pendingDelta(bar.instrumentId),
        });
        if (intent && !intent.rejected) execution.submit(intent);
      }

      processed += group.length;
      onProgress(Math.min(0.99, processed / events.length));
      if (processed % 1000 === 0) await yieldToEventLoop();
    }

    const finalTime = events[events.length - 1].availableAt;
    execution.cancelAll(finalTime, 'END_OF_RUN');
    if (config.endOfRunPositionPolicy === 'LIQUIDATE') {
      for (const position of ledger.portfolioSnapshot().positions) {
        if (Math.abs(position.quantity) <= EPSILON) continue;
        const bar = latestBars.get(position.instrumentId);
        if (!bar) continue;
        const intent = risk.liquidationIntent(position.instrumentId, ledger.portfolioSnapshot(), finalTime, 'END_OF_RUN_LIQUIDATION');
        const fill = execution.executeImmediate(intent, bar, bar.close, 'END_OF_RUN_LIQUIDATION');
        ledger.applyFill(fill);
        await strategy.onFill(fill, ledger.portfolioSnapshot());
      }
      ledger.snapshot(finalTime, events[events.length - 1].regime);
    }

    const strategyResult = await strategy.finalize();
    const metrics = calculatePerformanceMetrics({
      equityCurve: ledger.equityCurve,
      closedTrades: ledger.closedTrades,
      fills: ledger.fills,
      initialCash: config.initialCash,
      periodsPerYear: config.metrics.periodsPerYear,
      riskFreeRateAnnual: config.metrics.riskFreeRateAnnual,
    });
    const attribution = {
      scenario: {
        type: scenarioResult.metadata.type,
        scenarioHash: scenarioResult.metadata.scenarioHash,
        synthetic: scenarioResult.metadata.synthetic,
        totalReturn: metrics.totalReturn,
        totalPnl: metrics.totalPnl,
      },
      regimes: calculateRegimeAttribution(ledger.equityCurve),
    };

    const provenance = {
      ...loadedDataset.provenance,
      ...(strategyResult.model ? {
        modelVersion: strategyResult.model.modelVersion,
        modelHash: strategyResult.model.artifactHash,
        featureSchemaHash: strategyResult.model.featureSchemaHash,
        normalizerHash: strategyResult.model.normalizerHash,
      } : {}),
    };
    const deterministicOutput = {
      configHash: sha256(config),
      provenance,
      scenario: scenarioResult.metadata,
      strategy: strategyResult,
      orders: execution.orders,
      orderEvents: execution.orderEvents,
      fills: ledger.fills,
      trades: ledger.closedTrades,
      equityCurve: ledger.equityCurve,
      metrics,
      attribution,
      risk: { killSwitchActive: risk.killSwitchActive, rejections: risk.rejections },
      quality: loadedDataset.quality,
      signals,
    };
    const resultHash = sha256(deterministicOutput);
    onProgress(1);
    return { ...deterministicOutput, resultHash };
  }

  _applyProtectiveExit({ bar, ledger, execution, config }) {
    const position = ledger.position(bar.instrumentId);
    if (Math.abs(position.quantity) <= EPSILON) return null;
    const stopPct = config.strategy.parameters.stopLossPct;
    const takePct = config.strategy.parameters.takeProfitPct;
    if (!stopPct && !takePct) return null;

    const isLong = position.quantity > 0;
    const stopPrice = stopPct ? position.averagePrice * (isLong ? 1 - stopPct : 1 + stopPct) : null;
    const takePrice = takePct ? position.averagePrice * (isLong ? 1 + takePct : 1 - takePct) : null;
    const stopHit = stopPrice != null && (isLong ? bar.low <= stopPrice : bar.high >= stopPrice);
    const takeHit = takePrice != null && (isLong ? bar.high >= takePrice : bar.low <= takePrice);
    if (!stopHit && !takeHit) return null;
    if (stopHit && takeHit && config.execution.intrabarPolicy === 'LOWER_TIMEFRAME') {
      throw new Error('Ambiguous stop/take order requires lower-timeframe events');
    }

    // WORST_CASE resolves an ambiguous bar in favor of the stop.
    const useStop = stopHit;
    const trigger = useStop ? stopPrice : takePrice;
    let referencePrice = trigger;
    if (isLong) referencePrice = useStop ? Math.min(bar.open, trigger) : Math.max(bar.open, trigger);
    else referencePrice = useStop ? Math.max(bar.open, trigger) : Math.min(bar.open, trigger);
    const intent = {
      instrumentId: bar.instrumentId,
      side: isLong ? 'SELL' : 'BUY',
      quantity: Math.abs(position.quantity),
      type: 'MARKET',
      submittedAt: bar.availableAt,
      forceFill: true,
      reason: useStop ? 'STOP_LOSS' : 'TAKE_PROFIT',
    };
    execution.cancelInstrument(bar.instrumentId, bar.availableAt, intent.reason);
    return execution.executeImmediate(intent, bar, referencePrice, intent.reason);
  }
}
