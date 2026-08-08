import { PerformanceAnalytics } from '../analytics/PerformanceAnalytics.js';

/**
 * Legacy P2 compatibility harness.
 *
 * New integrations should use /api/backtests. This adapter nevertheless keeps
 * the old endpoint honest: a signal observed on bar i enters no earlier than
 * bar i+1 open and PnL comes from that bar's actual price movement, never from
 * forecast/action alignment.
 */
export class BacktestHarness {
  constructor(engine, initialBalance = 1000000) {
    if (!engine) throw new TypeError('BacktestHarness requires an engine');
    if (!Number.isFinite(initialBalance) || initialBalance <= 0) throw new TypeError('initialBalance must be positive');
    this.engine = engine;
    this.initialBalance = initialBalance;
    this.analytics = new PerformanceAnalytics([], { initialBalance });
  }

  _entry(signal, bar) {
    const action = signal.action.toUpperCase();
    const type = signal.type || 'MARKET';
    if (type === 'LIMIT') {
      if (!Number.isFinite(signal.price) || signal.price <= 0) return null;
      const crossed = action === 'BUY' ? bar.low <= signal.price : bar.high >= signal.price;
      if (!crossed) return null;
      return action === 'BUY' ? Math.min(bar.open, signal.price) : Math.max(bar.open, signal.price);
    }
    if (type === 'STOP_LOSS' || type === 'STOP') {
      if (!Number.isFinite(signal.stopPrice) || signal.stopPrice <= 0) return null;
      const crossed = action === 'BUY' ? bar.high >= signal.stopPrice : bar.low <= signal.stopPrice;
      if (!crossed) return null;
      return action === 'BUY' ? Math.max(bar.open, signal.stopPrice) : Math.min(bar.open, signal.stopPrice);
    }
    return bar.open;
  }

  run(candles, signals) {
    if (!Array.isArray(candles) || !Array.isArray(signals)) throw new TypeError('candles and signals must be arrays');
    if (signals.length > 0 && candles.length < signals.length + 1) {
      throw new TypeError('Need at least one candle after the last signal to avoid look-ahead');
    }

    let equity = this.initialBalance;
    const trades = [];
    const equityCurve = [{ t: candles[0]?.timestamp ?? 0, equity }];
    const slippageBps = Number.isFinite(this.engine.slippageBps) ? this.engine.slippageBps : 0;
    const feeRate = typeof this.engine.feeRateFor === 'function' ? this.engine.feeRateFor('MARKET') : 0;

    for (let index = 0; index < signals.length; index += 1) {
      const signal = signals[index];
      const action = signal?.action?.toUpperCase();
      const bar = candles[index + 1];
      if (!bar || action === 'HOLD' || !['BUY', 'SELL'].includes(action)) {
        equityCurve.push({ t: bar?.timestamp ?? index + 1, equity });
        continue;
      }
      const rawEntry = this._entry(signal, bar);
      if (rawEntry == null) {
        equityCurve.push({ t: bar.timestamp ?? index + 1, equity });
        continue;
      }
      const quantity = signal.qty ?? 0.01;
      if (!Number.isFinite(quantity) || quantity <= 0) throw new TypeError('signal.qty must be positive');
      const direction = action === 'BUY' ? 1 : -1;
      const entryPrice = rawEntry * (1 + direction * slippageBps / 10_000);
      const exitPrice = bar.close * (1 - direction * slippageBps / 10_000);
      const grossPnl = (exitPrice - entryPrice) * quantity * direction;
      const fee = (entryPrice + exitPrice) * quantity * feeRate / 10_000;
      const netPnl = grossPnl - fee;
      equity += netPnl;
      trades.push({
        id: `legacy-backtest-trade-${index + 1}`,
        timestamp: bar.timestamp ?? index + 1,
        symbol: signal.symbol || 'BTC/USDT',
        action,
        quantity,
        entryPrice,
        exitPrice,
        pnl: grossPnl,
        netPnl,
        fee,
        isWin: netPnl > 0,
        regime: signal.regime,
        reason: 'NEXT_BAR_PRICE_PATH',
      });
      equityCurve.push({ t: bar.timestamp ?? index + 1, equity });
    }

    this.analytics.updateTrades(trades);
    return {
      trades,
      metrics: this.analytics.getMetrics(),
      finalEquity: equity,
      totalReturnPct: ((equity - this.initialBalance) / this.initialBalance) * 100,
      equityCurve,
      deprecated: true,
      replacement: '/api/backtests',
    };
  }
}
