import { PerformanceAnalytics } from '../analytics/PerformanceAnalytics.js';

/**
 * Backtesting Harness for P2.
 *
 * Walks historical candles alongside ML signals and executes each signal at the
 * following candle's close (avoiding look-ahead). Handles both the base
 * PaperTradingEngine (executeTrade) and the P2ExecutionEngine (executeP2Order),
 * accounting for fees when available.
 */
export class BacktestHarness {
  constructor(engine, initialBalance = 1000000) {
    if (!engine) throw new TypeError('BacktestHarness requires an engine');
    this.engine = engine;
    this.initialBalance = initialBalance;
    this.analytics = new PerformanceAnalytics();
  }

  /**
   * Execute a signal on the given engine, adapting to its API surface.
   */
  _execute(order, forecast, price) {
    if (typeof this.engine.executeP2Order === 'function') {
      return this.engine.executeP2Order(order, forecast, price);
    }
    if (typeof this.engine.executeTrade === 'function') {
      return this.engine.executeTrade(order, forecast, price);
    }
    throw new TypeError('Engine does not expose executeTrade or executeP2Order');
  }

  /**
   * Run a backtest over candles and per-candle signals.
   * @param {Array<{close:number, timestamp?:number}>} candles
   * @param {Array<{action:string, confidence?:number, regime?:string, type?:string, price?:number, stopPrice?:number}>} signals
   */
  run(candles, signals) {
    if (!Array.isArray(candles) || !Array.isArray(signals)) {
      throw new TypeError('candles and signals must be arrays');
    }
    if (signals.length > 0 && candles.length < signals.length + 1) {
      throw new TypeError('Need at least one candle after the last signal to avoid look-ahead');
    }

    let equity = this.initialBalance;
    const trades = [];
    const equityCurve = [{ t: 0, equity }];

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      if (!signal || !signal.action || signal.action.toUpperCase() === 'HOLD') continue;

      // Execute at the next candle's close to prevent look-ahead bias.
      const fillPrice = candles[i + 1] ? candles[i + 1].close : candles[i].close;
      const action = signal.action.toUpperCase();
      const order = {
        action,
        symbol: signal.symbol || 'BTC/USDT',
        qty: signal.qty ?? 0.01,
        type: signal.type || 'MARKET',
        price: signal.price,
        stopPrice: signal.stopPrice,
      };

      const result = this._execute(order, signal, fillPrice);
      if (result && result.success && result.trade && result.trade.pnl !== undefined) {
        trades.push(result.trade);
        equity += (result.trade.netPnl !== undefined ? result.trade.netPnl : result.trade.pnl);
      }
      equityCurve.push({ t: i + 1, equity });
    }

    this.analytics.updateTrades(trades);
    return {
      trades,
      metrics: this.analytics.getMetrics(),
      finalEquity: equity,
      totalReturnPct: ((equity - this.initialBalance) / this.initialBalance) * 100,
      equityCurve,
    };
  }
}
