import { generateHistoricalData } from './dataFactory.js';
import { createSeededRng } from './utils/deterministic.js';

export const calculateRSISeries = (prices, period = 14) => {
  const rsi = new Array(prices.length).fill(50);
  if (prices.length <= period) return rsi;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const getRSIValue = (g, l) => {
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };
  rsi[period] = getRSIValue(gains, losses);
  for (let i = period + 1; i < prices.length; i++) {
    const oldChange = prices[i - period] - prices[i - period - 1];
    const newChange = prices[i] - prices[i - 1];
    if (oldChange >= 0) gains -= oldChange;
    else losses += oldChange;
    if (newChange >= 0) gains += newChange;
    else losses -= newChange;
    rsi[i] = getRSIValue(gains, losses);
  }
  return rsi;
};

const calculateEMASeries = (prices, period) => {
  if (!prices || prices.length === 0) return [];
  const ema = new Array(prices.length);
  const k = 2 / (period + 1);
  ema[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
};

export const evaluateStrategy = (candles, weights) => {
  let capital = 1000000;
  let position = 0;
  let entryPrice = 0;
  let trades = [];
  const prices = candles.map(c => c.close);
  const rsiSeries = calculateRSISeries(prices, 14);
  const emaShortSeries = calculateEMASeries(prices, 12);
  const emaLongSeries = calculateEMASeries(prices, 26);
  const windowSize = 60;
  for (let i = windowSize; i < candles.length; i++) {
    const current = candles[i];
    const rsi = rsiSeries[i];
    const macd = emaShortSeries[i] - emaLongSeries[i];
    let score = 0;
    if (rsi < 30) score += weights.rsi;
    if (rsi > 70) score -= weights.rsi;
    if (macd > 0) score += weights.macd;
    if (macd < 0) score -= weights.macd;
    const signal = score > 5 ? 'BUY' : score < -5 ? 'SELL' : 'HOLD';
    if (signal === 'BUY' && position <= 0) {
      if (position === -1) {
        const pnl = (entryPrice - current.close) * 1;
        capital += pnl;
        trades.push({ type: 'SHORT_CLOSE', price: current.close, pnl });
      }
      position = 1;
      entryPrice = current.close;
    } else if (signal === 'SELL' && position >= 0) {
      if (position === 1) {
        const pnl = (current.close - entryPrice) * 1;
        capital += pnl;
        trades.push({ type: 'LONG_CLOSE', price: current.close, pnl });
      }
      position = -1;
      entryPrice = current.close;
    }
  }
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;
  const totalProfit = trades.reduce((sum, t) => sum + t.pnl, 0);
  const profitFactor = Math.abs(totalProfit) / (Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)) || 1);
  return { winRate, profitFactor, totalProfit, trades: trades.length, capital };
};

const optimizeStrategy = (symbolId = 'SAF1403') => {
  const candles = generateHistoricalData(symbolId, 3);
  let bestMetrics = { winRate: 0, profitFactor: 0 };
  let bestWeights = { rsi: 2, macd: 1, sentiment: 2 };
  const baseRng = createSeededRng(`opt-${symbolId}`);
  for (let i = 0; i < 10; i++) {
    const rng = createSeededRng(`candidate-${symbolId}-${i}-${baseRng()}`);
    const candidateWeights = {
      rsi: rng() * 5,
      macd: rng() * 5,
      sentiment: rng() * 5
    };
    const metrics = evaluateStrategy(candles, candidateWeights);
    if (metrics.profitFactor > bestMetrics.profitFactor) {
      bestMetrics = metrics;
      bestWeights = candidateWeights;
    }
  }
  return {
    period: '3 Years',
    symbol: symbolId,
    optimizedWeights: bestWeights,
    performance: bestMetrics,
    dataPoints: candles.length
  };
};

export { optimizeStrategy, calculateEMASeries };
