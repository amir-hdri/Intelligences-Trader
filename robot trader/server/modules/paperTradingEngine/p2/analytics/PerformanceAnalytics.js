import { calculateSharpeRatio, calculateMaxDrawdown } from '../../../tcnModel.js';

/**
 * P2 Performance Analytics — Sharpe, Drawdown, Accuracy
 */
export class PerformanceAnalytics {
  constructor(trades = []) {
    this.trades = trades;
  }

  updateTrades(trades) {
    this.trades = trades;
  }

  getMetrics() {
    if (!this.trades.length) {
      return { sharpe: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0 };
    }

    const returns = this.trades.map(t => t.pnl / 1000000); // normalized
    const equity = this.trades.reduce((acc, t) => {
      acc.push((acc[acc.length - 1] || 1000000) + t.pnl);
      return acc;
    }, [1000000]);

    const sharpe = calculateSharpeRatio(returns);
    const maxDD = calculateMaxDrawdown(equity);
    const wins = this.trades.filter(t => t.isWin).length;
    const winRate = wins / this.trades.length;

    return {
      sharpe,
      maxDrawdown: maxDD,
      winRate,
      totalTrades: this.trades.length,
      totalPnl: this.trades.reduce((s, t) => s + t.pnl, 0),
    };
  }
}
