import { calculateATR, calculateRSI, detectMarketRegime } from './analyzer.js';

export const isValidCandle = candle => (
  candle &&
  typeof candle === 'object' &&
  ['open', 'high', 'low', 'close', 'volume'].every(field => Number.isFinite(candle[field])) &&
  candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.volume >= 0 &&
  candle.high >= Math.max(candle.open, candle.close, candle.low) &&
  candle.low <= Math.min(candle.open, candle.close, candle.high)
);

export const calculateSMA = (prices, period) => {
  if (!Number.isInteger(period) || period < 1 || prices.length < period) return null;
  const slice = prices.slice(-period);
  if (slice.some(price => !Number.isFinite(price))) return null;
  return slice.reduce((sum, price) => sum + price, 0) / period;
};

export const calculateVaR95 = historyData => {
  if (historyData.length < 2) return 0;
  const returns = [];
  for (let index = 1; index < historyData.length; index++) {
    const previousClose = historyData[index - 1].close;
    const close = historyData[index].close;
    if (!Number.isFinite(previousClose) || previousClose <= 0 || !Number.isFinite(close)) continue;
    returns.push((close - previousClose) / previousClose);
  }
  if (returns.length === 0) return 0;
  returns.sort((a, b) => a - b);
  // Nearest-rank lower-tail empirical quantile.
  const index = Math.max(0, Math.ceil(returns.length * 0.05) - 1);
  return returns[index];
};

export const generateAnalysis = historyData => {
  if (!Array.isArray(historyData) || historyData.length === 0) {
    return {
      prediction: 'HOLD',
      confidence: 0,
      volatility: 'UNKNOWN',
      reasoning: 'Insufficient market history',
      risk: { valueAtRisk95: 0 },
      indicators: { sma20: 0, rsi: 50, atr: 0 },
    };
  }
  if (historyData.some(candle => !isValidCandle(candle))) {
    throw new TypeError('historyData contains an invalid OHLCV candle');
  }

  const prices = historyData.map(candle => candle.close);
  const currentPrice = prices.at(-1);
  const atr = calculateATR(historyData);
  const rsi = calculateRSI(prices, 14);
  const sma20 = calculateSMA(prices, 20) ?? currentPrice;
  const regime = detectMarketRegime(historyData, atr);
  const valueAtRisk95 = calculateVaR95(historyData);

  let score = 0;
  const reasons = [];
  if (currentPrice > sma20) {
    score += 1;
    reasons.push('price is above SMA20');
  } else if (currentPrice < sma20) {
    score -= 1;
    reasons.push('price is below SMA20');
  }

  if (rsi < 30) {
    score += 1;
    reasons.push('RSI is oversold');
  } else if (rsi > 70) {
    score -= 1;
    reasons.push('RSI is overbought');
  }

  if (regime === 'TRENDING_UP') score += 1;
  else if (regime === 'TRENDING_DOWN') score -= 1;

  const prediction = score >= 1 ? 'BUY' : score <= -1 ? 'SELL' : 'HOLD';
  const confidence = Math.min(Math.abs(score) / 3, 0.99);
  return {
    prediction,
    confidence,
    volatility: regime,
    reasoning: reasons.join('; ') || 'No directional edge detected',
    risk: { valueAtRisk95 },
    indicators: { sma20, rsi, atr },
  };
};
