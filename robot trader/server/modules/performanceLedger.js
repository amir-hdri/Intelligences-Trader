/**
 * Performance metrics calculated only from an explicit realized-trade ledger.
 * No sample history or filtered synthetic winners are generated here.
 */
export function calculatePerformanceFromTrades(trades, initialCapital = 1_000_000) {
  if (!Array.isArray(trades)) throw new TypeError('trades must be an array');
  if (!Number.isFinite(initialCapital) || initialCapital <= 0) throw new TypeError('initialCapital must be positive');

  const normalized = trades.map((trade, index) => {
    const pnl = Number(trade?.pnl ?? trade?.profit);
    if (!Number.isFinite(pnl)) throw new TypeError(`trades[${index}] requires finite pnl or profit`);
    const timestamp = Number(trade?.timestamp);
    return { ...trade, pnl, timestamp: Number.isFinite(timestamp) ? timestamp : null, inputIndex: index };
  }).sort((a, b) => {
    if (a.timestamp == null || b.timestamp == null) return a.inputIndex - b.inputIndex;
    return a.timestamp - b.timestamp;
  });

  if (normalized.length === 0) {
    return {
      sharpe: 0,
      sortino: 0,
      cagr: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      totalTrades: 0,
      avgWin: 0,
      avgLoss: 0,
      totalPnl: 0,
      finalEquity: initialCapital,
      equityCurve: [],
    };
  }

  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  const returns = [];
  const equityCurve = [];
  for (const trade of normalized) {
    const previousEquity = equity;
    equity += trade.pnl;
    returns.push(previousEquity > 0 ? trade.pnl / previousEquity : 0);
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? Math.max(0, (peak - equity) / peak) : 1;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    equityCurve.push({
      time: trade.timestamp,
      equity,
      drawdown,
    });
  }

  const wins = normalized.filter(trade => trade.pnl > 0);
  const losses = normalized.filter(trade => trade.pnl < 0);
  const totalGain = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const downside = returns.filter(value => value < 0);
  const downsideVariance = downside.length
    ? downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  const firstTimestamp = normalized.find(trade => trade.timestamp != null)?.timestamp;
  const lastTimestamp = [...normalized].reverse().find(trade => trade.timestamp != null)?.timestamp;
  const elapsedDays = firstTimestamp != null && lastTimestamp != null
    ? Math.max(0, (lastTimestamp - firstTimestamp) / 86_400_000)
    : 0;
  const growth = equity / initialCapital;
  const cagr = elapsedDays > 0 && growth > 0
    ? (growth ** (365 / elapsedDays) - 1) * 100
    : (growth - 1) * 100;

  const finiteOrZero = value => Number.isFinite(value) ? value : 0;
  return {
    sharpe: Number(finiteOrZero(stdDev > Number.EPSILON ? (mean / stdDev) * Math.sqrt(252) : 0).toFixed(4)),
    sortino: Number(finiteOrZero(downsideDev > Number.EPSILON ? (mean / downsideDev) * Math.sqrt(252) : 0).toFixed(4)),
    cagr: Number(finiteOrZero(cagr).toFixed(4)),
    maxDrawdown: Number((maxDrawdown * 100).toFixed(4)),
    winRate: Number((wins.length / normalized.length).toFixed(6)),
    profitFactor: totalLoss > Number.EPSILON ? Number((totalGain / totalLoss).toFixed(4)) : null,
    totalTrades: normalized.length,
    avgWin: wins.length ? Number((totalGain / wins.length).toFixed(4)) : 0,
    avgLoss: losses.length ? Number((totalLoss / losses.length).toFixed(4)) : 0,
    totalPnl: Number((equity - initialCapital).toFixed(4)),
    finalEquity: Number(equity.toFixed(4)),
    equityCurve,
  };
}

export function getPerformance(symbolId = 'SAF1403', trades = [], initialCapital = 1_000_000) {
  const selected = Array.isArray(trades)
    ? trades.filter(trade => !symbolId || trade?.symbol === symbolId)
    : [];
  return calculatePerformanceFromTrades(selected, initialCapital);
}

export const performanceLedger = { getPerformance, calculatePerformanceFromTrades };
