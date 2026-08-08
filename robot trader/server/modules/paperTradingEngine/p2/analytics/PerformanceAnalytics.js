import { calculateSharpeRatio, calculateMaxDrawdown } from '../../../../tcnModel.js';

/**
 * P2 Performance Analytics — Sharpe, Drawdown, Win Rate, Profit Factor,
 * Accuracy, Sortino, and Average Win/Loss.
 */
export class PerformanceAnalytics {
  constructor(trades = []) {
    this.trades = trades;
  }

  updateTrades(trades) {
    this.trades = Array.isArray(trades) ? trades : [];
  }

  _returns() {
    // Normalize each trade PnL as a fraction of a 1M starting balance.
    return this.trades.map(t => (t.netPnl ?? t.pnl) / 1000000);
  }

  getMetrics() {
    if (!this.trades.length) {
      return {
        sharpe: 0,
        sortino: 0,
        maxDrawdown: 0,
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
        totalPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        accuracy: 0,
      };
    }

    const returns = this._returns();
    const equity = this.trades.reduce((acc, t) => {
      acc.push((acc[acc.length - 1] || 1000000) + (t.netPnl ?? t.pnl));
      return acc;
    }, [1000000]);

    const sharpe = calculateSharpeRatio(returns);

    // Sortino: annualized downside-deviation variant using only negative returns.
    const downside = returns.filter(r => r < 0);
    const downsideDev = downside.length
      ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length)
      : 0;
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const sortino = downsideDev ? meanRet / downsideDev : 0;

    const maxDD = calculateMaxDrawdown(equity);
    const wins = this.trades.filter(t => t.isWin);
    const losses = this.trades.filter(t => !t.isWin);
    const winRate = wins.length / this.trades.length;

    const grossProfit = wins.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    const totalPnl = this.trades.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0) / losses.length : 0;

    // Signal accuracy: fraction of trades that were wins (honest, measured).
    const accuracy = winRate;

    return {
      sharpe,
      sortino,
      maxDrawdown: maxDD,
      winRate,
      profitFactor,
      totalTrades: this.trades.length,
      totalPnl,
      avgWin,
      avgLoss,
      accuracy,
    };
  }
}
