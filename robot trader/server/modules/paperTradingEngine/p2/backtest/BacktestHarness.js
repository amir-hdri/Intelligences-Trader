import { PerformanceAnalytics } from '../analytics/PerformanceAnalytics.js';

/**
 * Simple Backtesting Harness for P2
 */
export class BacktestHarness {
  constructor(engine) {
    this.engine = engine;
    this.analytics = new PerformanceAnalytics();
  }

  run(candles, signals) {
    let equity = 1000000;
    const trades = [];

    for (let i = 0; i < candles.length - 1; i++) {
      const candle = candles[i];
      const signal = signals[i];
      if (!signal) continue;

      const result = this.engine.executeTrade(
        { action: signal.action, symbol: 'BTC/USDT', qty: 0.01 },
        signal,
        candle.close
      );

      if (result.success) {
        trades.push(result.trade);
        equity += result.trade.pnl;
      }
    }

    this.analytics.updateTrades(trades);
    return {
      trades,
      metrics: this.analytics.getMetrics(),
      finalEquity: equity,
    };
  }
}
