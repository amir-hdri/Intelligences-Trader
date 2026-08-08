/** Legacy P2 analytics. The Phase 3 engine contains the canonical calculator. */
export class PerformanceAnalytics {
  constructor(trades = [], { initialBalance = 1_000_000, periodsPerYear = 252 } = {}) {
    this.trades = Array.isArray(trades) ? trades : [];
    this.initialBalance = initialBalance;
    this.periodsPerYear = periodsPerYear;
  }

  updateTrades(trades) {
    this.trades = Array.isArray(trades) ? trades : [];
  }

  _equityAndReturns() {
    const equity = [this.initialBalance];
    const returns = [];
    for (const trade of this.trades) {
      const pnl = trade.netPnl ?? trade.pnl ?? 0;
      const previous = equity[equity.length - 1];
      const next = previous + pnl;
      returns.push(previous !== 0 ? pnl / previous : 0);
      equity.push(next);
    }
    return { equity, returns };
  }

  getMetrics() {
    if (!this.trades.length) {
      return {
        sharpe: 0, sortino: 0, maxDrawdown: 0, winRate: 0,
        profitFactor: 0, totalTrades: 0, totalPnl: 0, avgWin: 0,
        avgLoss: 0, accuracy: 0, totalFees: 0,
      };
    }

    const { equity, returns } = this._equityAndReturns();
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.length > 1
      ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
      : 0;
    const deviation = Math.sqrt(variance);
    const sharpe = deviation > 0 ? mean / deviation * Math.sqrt(this.periodsPerYear) : 0;
    const downside = returns.filter(value => value < 0);
    const downsideDeviation = downside.length
      ? Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length)
      : 0;
    const sortino = downsideDeviation > 0 ? mean / downsideDeviation * Math.sqrt(this.periodsPerYear) : 0;

    let peak = equity[0];
    let maxDrawdown = 0;
    for (const value of equity) {
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    }

    const values = this.trades.map(trade => trade.netPnl ?? trade.pnl ?? 0);
    const wins = values.filter(value => value > 0);
    const losses = values.filter(value => value < 0);
    const grossProfit = wins.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
    const totalPnl = values.reduce((sum, value) => sum + value, 0);

    return {
      sharpe,
      sortino,
      maxDrawdown,
      winRate: wins.length / this.trades.length,
      profitFactor,
      totalTrades: this.trades.length,
      totalPnl,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      accuracy: wins.length / this.trades.length,
      totalFees: this.trades.reduce((sum, trade) => sum + (trade.fee || 0), 0),
    };
  }
}
