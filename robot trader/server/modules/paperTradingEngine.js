import { hashString } from '../utils/deterministic.js';
import { P2ExecutionEngine } from './paperTradingEngine/p2/execution/P2ExecutionEngine.js';
import { MLSignalBridge } from './paperTradingEngine/p2/ml/MLSignalBridge.js';
import { PerformanceAnalytics } from './paperTradingEngine/p2/analytics/PerformanceAnalytics.js';
import { OrderBookSimulator } from './paperTradingEngine/p2/execution/OrderBookSimulator.js';
import { OrderStateMachine } from './paperTradingEngine/p2/execution/OrderStateMachine.js';
import { BacktestHarness } from './paperTradingEngine/p2/backtest/BacktestHarness.js';
import { TradeRepository } from './paperTradingEngine/p2/storage/TradeRepository.js';
import { RedisCache } from './paperTradingEngine/p2/data/RedisCache.js';

/**
 * Deterministic paper-outcome simulator (never a live broker engine).
 */

export class PaperTradingEngine {
  constructor() {
    this.trades = [];
    this.balance = 1000000;

    // Active P2 strategy configuration (applied by MLSignalBridge)
    this.strategyConfig = {
      model: 'PPO',
      size: 1,
      stopLoss: 0.02,
      takeProfit: 0.04,
      confidenceThreshold: 0.6,
    };

    // P2 Extensions (lazy-initialized)
    this.p2Execution = null;
    this.mlBridge = null;
    this.orderBook = null;
    this.orderStateMachine = null;
    this.backtestHarness = null;
    this.tradeRepository = null;
    this.cache = null;
    this.analytics = new PerformanceAnalytics();
  }

  /**
   * Apply/merge a strategy configuration and push it to the ML bridge so that
   * subsequent signals use the updated confidence threshold and default size.
   */
  setStrategyConfig(config) {
    if (!config || typeof config !== 'object') return this.strategyConfig;
    const { model, size, stopLoss, takeProfit, confidenceThreshold } = config;
    if (model != null) this.strategyConfig.model = model;
    if (size != null && Number.isFinite(size) && size > 0) this.strategyConfig.size = size;
    if (stopLoss != null && Number.isFinite(stopLoss)) this.strategyConfig.stopLoss = stopLoss;
    if (takeProfit != null && Number.isFinite(takeProfit)) this.strategyConfig.takeProfit = takeProfit;
    if (confidenceThreshold != null && Number.isFinite(confidenceThreshold)) {
      this.strategyConfig.confidenceThreshold = Math.min(1, Math.max(0, confidenceThreshold));
    }
    if (this.mlBridge) {
      this.mlBridge.setDefaults({
        confidenceThreshold: this.strategyConfig.confidenceThreshold,
        size: this.strategyConfig.size,
      });
    }
    return this.strategyConfig;
  }

  getStrategyConfig() {
    return { ...this.strategyConfig };
  }

  // Lazy init P2 modules
  _ensureP2() {
    if (!this.p2Execution) {
      this.p2Execution = new P2ExecutionEngine(this);
      this.mlBridge = new MLSignalBridge(this.p2Execution);
    }
    if (!this.orderBook) {
      this.orderBook = new OrderBookSimulator();
    }
    if (!this.orderStateMachine) {
      this.orderStateMachine = new OrderStateMachine();
    }
    if (!this.backtestHarness) {
      this.backtestHarness = new BacktestHarness(this.p2Execution);
    }
    if (!this.tradeRepository) {
      this.tradeRepository = new TradeRepository();
    }
    if (!this.cache) {
      this.cache = new RedisCache();
    }
    return this.p2Execution;
  }

  // Deterministic trade outcome evaluation
  executeTrade(order, forecast, marketPrice) {
    const now = Date.now();
    if (!order || !['BUY', 'SELL'].includes(order.action)) throw new TypeError('Invalid paper order action');
    if (typeof order.symbol !== 'string' || !/^[A-Z0-9-]{1,64}$/.test(order.symbol)) throw new TypeError('Invalid paper order symbol');
    if (!Number.isFinite(order.qty) || order.qty <= 0) throw new TypeError('Invalid paper order quantity');
    if (!Number.isFinite(order.entry) || order.entry <= 0 || !Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new TypeError('Invalid paper order price');
    }

    const forecastAction = forecast?.action ?? 'HOLD';
    const confidence = forecast?.confidence ?? 0.5;
    const politicalRisk = forecast?.politicalRiskIndex ?? 50;
    if (!['BUY', 'SELL', 'HOLD'].includes(forecastAction) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new TypeError('Invalid paper forecast');
    }

    // Real logic:
    // - If forecast aligns with order side and confidence > threshold, profit
    // - Incorporate market regime: RANGING reduces edge
    // - Political risk high favors BUY for commodity inflation hedge
    let isWin = false;
    let reason = '';

    const threshold = 0.6;
    const alignment = forecastAction === order.action ? 1 : forecastAction === 'HOLD' ? 0 : -1;

    if (alignment === 1 && confidence >= threshold) {
      isWin = true;
      reason = `Forecast alignment ${forecastAction} @ ${(confidence*100).toFixed(0)}%`;
    } else if (alignment === -1 && confidence < 0.4) {
      // Counter-trend but low confidence -> still possible win if mean reversion
      isWin = politicalRisk > 60 && order.action === 'BUY';
      reason = `Counter-trend with political bias ${politicalRisk}`;
    } else if (forecast?.regime === 'TRENDING_UP' && order.action === 'BUY') {
      isWin = confidence >= 0.55;
      reason = `Trending up regime favors BUY`;
    } else if (forecast?.regime === 'TRENDING_DOWN' && order.action === 'SELL') {
      isWin = confidence >= 0.55;
      reason = `Trending down regime favors SELL`;
    } else {
      isWin = false;
      reason = `No edge: forecast ${forecastAction} vs order ${order.action}`;
    }

    // Deterministic PnL calculation based on risk, not random
    const riskPerTrade = 0.01 * this.balance;
    const profitFactor = 2.0; // From metrics or forecast
    const pnl = isWin ? riskPerTrade * profitFactor : -riskPerTrade;
    this.balance += pnl;

    const trade = {
      id: `trade-${hashString(order.action + String(now) + String(marketPrice)).toString(36)}`,
      timestamp: now,
      symbol: order.symbol || 'SAF1403',
      action: order.action,
      quantity: order.qty,
      entryPrice: order.entry || marketPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      leverage: order.leverage || 1,
      pnl,
      isWin,
      reason: reason + ` | ${order.leverage}x leverage`,
      forecastAtTrade: forecast ? { action: forecast.action, confidence: forecast.confidence, regime: forecast.regime } : null,
      balanceAfter: this.balance,
    };

    this.trades.unshift(trade);
    if (this.trades.length > 500) this.trades = this.trades.slice(0,500);

    // Legacy paper trades are resolved immediately and therefore are closed
    // outcomes, not open portfolio positions. They must not be inserted into
    // the open-position ledger.
    return { success: true, trade, isWin, pnl, newBalance: this.balance, simulated: true };
  }

  getTrades() {
    return this.trades;
  }

  getBalance() {
    return this.balance;
  }

  getStats() {
    const wins = this.trades.filter(t=>t.isWin).length;
    const winRate = this.trades.length ? wins/this.trades.length : 0;
    const totalPnl = this.trades.reduce((s,t)=>s+t.pnl,0);
    return { winRate, totalPnl, totalTrades: this.trades.length, balance: this.balance };
  }
}

export const paperTradingEngine = new PaperTradingEngine();
