import { calculateATR, calculateRSI, detectMarketRegime } from './analyzer.js';

export const calculateSMA = (prices, period) => {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
};

export const calculateVaR95 = (historyData) => {
  if (historyData.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < historyData.length; i++) {
    const prevClose = historyData[i - 1].close;
    if (prevClose === 0) continue;
    returns.push((historyData[i].close - prevClose) / prevClose);
  }
  if (returns.length === 0) return 0;
  returns.sort((a, b) => a - b);
  const index = Math.floor(returns.length * 0.05);
  return returns[index] || 0;
};

export const generateAnalysis = (historyData) => {
  if (!historyData || historyData.length === 0) {
    return {
      prediction: 'HOLD',
      confidence: 0,
      volatility: 'UNKNOWN',
      risk: { valueAtRisk95: 0 },
      indicators: { sma20: 0, rsi: 50, atr: 0 }
    };
  }

  const prices = historyData.map(c => c.close);
  const currentPrice = prices[prices.length - 1];

  const atr = calculateATR(historyData);
  const rsi = calculateRSI(prices, 14);
  const sma20 = calculateSMA(prices, 20) || currentPrice;
  const regime = detectMarketRegime(historyData, atr);
  const var95 = calculateVaR95(historyData);

  let score = 0;
  if (currentPrice > sma20) score += 1;
  else if (currentPrice < sma20) score -= 1;

  if (rsi < 30) score += 1;
  else if (rsi > 70) score -= 1;

  if (regime === 'TRENDING_UP') score += 1;
  else if (regime === 'TRENDING_DOWN') score -= 1;

  let prediction = 'HOLD';
  if (score >= 1) prediction = 'BUY';
  if (score <= -1) prediction = 'SELL';

  const confidence = Math.min(Math.abs(score) / 3, 0.99);

  return {
    prediction,
    confidence,
    volatility: regime,
    risk: {
      valueAtRisk95: var95
    },
    indicators: {
      sma20,
      rsi,
      atr
    }
  };
};
