function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

export function calculateDrawdown(equityCurve) {
  if (!equityCurve.length) return { value: 0, peakTime: null, troughTime: null, recoveryTime: null };
  let peak = equityCurve[0].equity;
  let peakTime = equityCurve[0].timestamp;
  let activePeakTime = peakTime;
  let max = 0;
  let troughTime = null;
  let recoveryTime = null;
  let awaitingRecovery = false;

  for (const point of equityCurve) {
    if (point.equity >= peak) {
      peak = point.equity;
      activePeakTime = point.timestamp;
      if (awaitingRecovery && recoveryTime == null) recoveryTime = point.timestamp;
      awaitingRecovery = false;
    }
    const drawdown = peak > 0 ? (peak - point.equity) / peak : 0;
    if (drawdown > max) {
      max = drawdown;
      peakTime = activePeakTime;
      troughTime = point.timestamp;
      recoveryTime = null;
      awaitingRecovery = true;
    }
  }
  return { value: max, peakTime, troughTime, recoveryTime };
}

export function calculatePerformanceMetrics({ equityCurve, closedTrades, fills, initialCash, periodsPerYear, riskFreeRateAnnual = 0 }) {
  const reasons = {};
  const returns = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1].equity;
    const current = equityCurve[index].equity;
    if (previous > 0 && Number.isFinite(current)) {
      const periodReturn = current / previous - 1;
      if (Number.isFinite(periodReturn)) returns.push(periodReturn);
      else reasons.invalidReturns = 'NON_FINITE_PERIOD_RETURN_SKIPPED';
    }
  }
  const periodicRiskFree = (1 + riskFreeRateAnnual) ** (1 / periodsPerYear) - 1;
  const excess = returns.map(value => value - periodicRiskFree);
  const excessDeviation = sampleStandardDeviation(excess);
  const rawSharpe = excessDeviation > 0 ? mean(excess) / excessDeviation * Math.sqrt(periodsPerYear) : null;
  const sharpeRatio = Number.isFinite(rawSharpe) ? rawSharpe : null;
  if (sharpeRatio == null) reasons.sharpeRatio = rawSharpe == null ? 'INSUFFICIENT_RETURN_VARIANCE' : 'NUMERIC_OVERFLOW';

  const downside = excess.filter(value => value < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length)
    : 0;
  const rawSortino = downsideDeviation > 0 ? mean(excess) / downsideDeviation * Math.sqrt(periodsPerYear) : null;
  const sortinoRatio = Number.isFinite(rawSortino) ? rawSortino : null;
  if (sortinoRatio == null) reasons.sortinoRatio = rawSortino == null ? 'NO_DOWNSIDE_VARIANCE' : 'NUMERIC_OVERFLOW';

  const maxDrawdown = calculateDrawdown(equityCurve);
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialCash;
  const totalReturn = finalEquity / initialCash - 1;
  const firstTimestamp = equityCurve[0]?.timestamp;
  const lastTimestamp = equityCurve[equityCurve.length - 1]?.timestamp;
  const years = Number.isFinite(firstTimestamp) && Number.isFinite(lastTimestamp) && lastTimestamp > firstTimestamp
    ? (lastTimestamp - firstTimestamp) / (365.25 * 24 * 60 * 60 * 1000)
    : 0;
  const annualizedLogReturn = years > 0 && finalEquity > 0 ? Math.log(finalEquity / initialCash) / years : null;
  const rawCagr = annualizedLogReturn != null && annualizedLogReturn < Math.log(Number.MAX_VALUE)
    ? Math.expm1(annualizedLogReturn)
    : null;
  const cagr = Number.isFinite(rawCagr) ? rawCagr : null;
  if (cagr == null) reasons.cagr = annualizedLogReturn == null
    ? 'NON_POSITIVE_OR_ZERO_DURATION'
    : 'ANNUALIZATION_OVERFLOW';

  const epsilon = 1e-10;
  const wins = closedTrades.filter(trade => trade.netPnl > epsilon);
  const losses = closedTrades.filter(trade => trade.netPnl < -epsilon);
  const breakeven = closedTrades.length - wins.length - losses.length;
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const rawProfitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  const profitFactor = Number.isFinite(rawProfitFactor) ? rawProfitFactor : null;
  if (profitFactor == null) reasons.profitFactor = rawProfitFactor != null
    ? 'NUMERIC_OVERFLOW'
    : grossProfit > 0 ? 'NO_LOSING_TRADES' : 'NO_GROSS_LOSS';

  const totalFees = fills.reduce((sum, fill) => sum + fill.fee, 0);
  const totalSlippage = fills.reduce((sum, fill) => sum + fill.slippageCost, 0);
  const turnover = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
  const averageExposure = equityCurve.length
    ? mean(equityCurve.map(point => point.equity > 0 ? point.grossExposure / point.equity : 0))
    : 0;
  const holdingPeriods = closedTrades
    .filter(trade => Number.isFinite(trade.openedAt) && Number.isFinite(trade.closedAt))
    .map(trade => trade.closedAt - trade.openedAt);

  const rawVolatility = returns.length > 1 ? sampleStandardDeviation(returns) * Math.sqrt(periodsPerYear) : null;
  const volatilityAnnualized = Number.isFinite(rawVolatility) ? rawVolatility : null;
  if (rawVolatility != null && volatilityAnnualized == null) reasons.volatilityAnnualized = 'NUMERIC_OVERFLOW';
  const rawCalmar = cagr != null && maxDrawdown.value > 0 ? cagr / maxDrawdown.value : null;
  const calmarRatio = Number.isFinite(rawCalmar) ? rawCalmar : null;
  if (rawCalmar != null && calmarRatio == null) reasons.calmarRatio = 'NUMERIC_OVERFLOW';

  return {
    sharpeRatio,
    sharpe: sharpeRatio,
    sortinoRatio,
    sortino: sortinoRatio,
    maxDrawdown: maxDrawdown.value,
    maxDrawdownDetails: maxDrawdown,
    winRate: closedTrades.length ? wins.length / closedTrades.length : 0,
    profitFactor,
    totalTrades: closedTrades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakeven,
    grossProfit,
    grossLoss,
    totalPnl: finalEquity - initialCash,
    totalReturn,
    totalReturnPct: totalReturn * 100,
    cagr,
    volatilityAnnualized,
    calmarRatio,
    averageWin: wins.length ? mean(wins.map(trade => trade.netPnl)) : 0,
    averageLoss: losses.length ? mean(losses.map(trade => trade.netPnl)) : 0,
    expectancy: closedTrades.length ? mean(closedTrades.map(trade => trade.netPnl)) : 0,
    averageHoldingPeriodMs: holdingPeriods.length ? mean(holdingPeriods) : null,
    totalFees,
    totalSlippage,
    turnover,
    averageExposure,
    finalEquity,
    returnObservations: returns.length,
    assumptions: { periodsPerYear, riskFreeRateAnnual, pnlIsNetOfCosts: true },
    reasons,
  };
}

export function calculateRegimeAttribution(equityCurve) {
  const groups = new Map();
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1];
    const current = equityCurve[index];
    if (previous.equity <= 0) continue;
    const periodReturn = current.equity / previous.equity - 1;
    if (!Number.isFinite(periodReturn)) continue;
    const regime = current.regime || 'UNKNOWN';
    const values = groups.get(regime) || [];
    values.push(periodReturn);
    groups.set(regime, values);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([regime, returns]) => {
    const cumulative = returns.reduce((value, item) => value * (1 + item), 1) - 1;
    return [regime, {
      periods: returns.length,
      cumulativeReturn: Number.isFinite(cumulative) ? cumulative : null,
      averageReturn: mean(returns),
      positivePeriodRate: returns.length ? returns.filter(value => value > 0).length / returns.length : 0,
    }];
  }));
}
