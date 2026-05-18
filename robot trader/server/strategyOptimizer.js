const { generateHistoricalData } = require('./dataFactory');

// --- Indicator Helpers ---
const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const calculateEMA = (prices, period) => {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

// --- Core Strategy Logic ---
const evaluateStrategy = (candles, weights) => {
  let capital = 1000000;
  let position = 0; // 0: None, 1: Long, -1: Short
  let entryPrice = 0;
  let trades = [];

  // Use a sliding window for indicators
  const windowSize = 60;

  for (let i = windowSize; i < candles.length; i++) {
    const slice = candles.slice(i - windowSize, i + 1);
    const current = slice[slice.length - 1];
    const prices = slice.map(c => c.close);

    // Indicators
    const rsi = calculateRSI(prices);
    const emaShort = calculateEMA(prices, 12);
    const emaLong = calculateEMA(prices, 26);
    const macd = emaShort - emaLong;

    let score = 0;

    // Logic matching frontend roughly
    if (rsi < 30) score += weights.rsi;
    if (rsi > 70) score -= weights.rsi;
    if (macd > 0) score += weights.macd;
    if (macd < 0) score -= weights.macd;

    // Sentiment Simulation (Random for backtest speed, or 0)
    // score += (Math.random() - 0.5) * weights.sentiment;

    // Decision
    const signal = score > 5 ? 'BUY' : score < -5 ? 'SELL' : 'HOLD';

    if (signal === 'BUY' && position <= 0) {
      if (position === -1) { // Close Short
        const pnl = (entryPrice - current.close) * 1; // 1 unit
        capital += pnl;
        trades.push({ type: 'SHORT_CLOSE', price: current.close, pnl });
      }
      position = 1;
      entryPrice = current.close;
    } else if (signal === 'SELL' && position >= 0) {
      if (position === 1) { // Close Long
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
  console.log('Generating 3 years of data...');
  const candles = generateHistoricalData(symbolId, 3);
  console.log(`Data generated: ${candles.length} candles.`);

  let bestMetrics = { winRate: 0, profitFactor: 0 };
  let bestWeights = { rsi: 2, macd: 1, sentiment: 2 };

  // Monte Carlo Optimization (10 iterations for demo speed)
  for (let i = 0; i < 10; i++) {
    const candidateWeights = {
      rsi: Math.random() * 5,
      macd: Math.random() * 5,
      sentiment: Math.random() * 5
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

module.exports = { optimizeStrategy };
