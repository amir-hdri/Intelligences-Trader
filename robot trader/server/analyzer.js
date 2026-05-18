// Central logic exported from frontend's dataUtils to run cleanly in backend
// Simplified version to support the index.js without depending on TS/DOM

// ... constants
export const INDICATOR_PARAMS = {
    EMA_SHORT: 12,
    EMA_LONG: 26,
};

export const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

export const calculateEMA = (prices, period) => {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

export const calculateMACD = (prices) => {
  const ema12 = calculateEMA(prices, INDICATOR_PARAMS.EMA_SHORT);
  const ema26 = calculateEMA(prices, INDICATOR_PARAMS.EMA_LONG);
  const macdValue = ema12 - ema26;
  const signal = macdValue * 0.9;
  return {
    value: macdValue,
    signal: signal,
    histogram: macdValue - signal,
  };
};

export const calculateATR = (candles, period = 14) => {
  if (candles.length < 2) return 0;
  const trs = candles.slice(-period).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const prevClose = arr[i - 1].close;
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
};

export const calculateIchimoku = (candles) => {
  const getHighLowMid = (slice) => {
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    return (Math.max(...highs) + Math.min(...lows)) / 2;
  };

  const tenkan = candles.length >= 9 ? getHighLowMid(candles.slice(-9)) : candles[candles.length - 1].close;
  const kijun = candles.length >= 26 ? getHighLowMid(candles.slice(-26)) : candles[candles.length - 1].close;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = candles.length >= 52 ? getHighLowMid(candles.slice(-52)) : candles[candles.length - 1].close;

  return { tenkan, kijun, senkouA, senkouB };
};

export const calculateBollingerBands = (prices, period = 20, stdDev = 2) => {
  const slice = prices.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const squareDiffs = slice.map(p => Math.pow(p - avg, 2));
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: avg + stdDev * std,
    middle: avg,
    lower: avg - stdDev * std,
  };
};

export const detectMarketRegime = (candles, atr) => {
  const prices = candles.map(c => c.close);
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const lastPrice = prices[prices.length - 1];

  const volatility = atr / lastPrice;
  if (volatility > 0.03) return 'HIGH_VOLATILITY';

  if (lastPrice > ema20 && ema20 > ema50) return 'TRENDING_UP';
  if (lastPrice < ema20 && ema20 < ema50) return 'TRENDING_DOWN';

  return 'RANGING';
};

export const analyzeMarketMTF = (
  mtfData,
  symbolId = '',
  externalMetrics = null,
  weights = {
    ichimoku: 2,
    rsi: 2,
    macd: 1,
    basis: 3,
    sentiment: 2,
    orderBook: 2,
    correlation: 2
  }
) => {
  const hourlyCandles = mtfData['1h'];
  if (!hourlyCandles || hourlyCandles.length === 0) return { action: 'HOLD', confidence: 0 };
  const lastCandle = hourlyCandles[hourlyCandles.length - 1];

  const hPrices = hourlyCandles.map(c => c.close);
  const rsi = calculateRSI(hPrices);
  const macd = calculateMACD(hPrices);
  const atr = calculateATR(hourlyCandles);
  const bb = calculateBollingerBands(hPrices);
  const ichimoku = calculateIchimoku(hourlyCandles);
  const regime = detectMarketRegime(hourlyCandles, atr);

  let score = 0;
  const reasons = [];

  if (lastCandle.close > ichimoku.senkouA) { score += weights.ichimoku; reasons.push('Price > Senkou A'); }
  else { score -= weights.ichimoku; }

  if (rsi < 35) { score += weights.rsi; reasons.push('Oversold RSI'); }
  else if (rsi > 70) { score -= weights.rsi; reasons.push('Overbought RSI'); }

  if (macd.histogram > 0) { score += weights.macd; reasons.push('Bullish MACD'); }
  else { score -= weights.macd; reasons.push('Bearish MACD'); }

  const action = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD';
  const confidence = Math.min(Math.abs(score) / 6, 0.99);

  return {
    action,
    confidence,
    regime,
    reason: reasons.join('. ') || 'Market consolidating.',
    indicators: { rsi, macd, atr, bollinger: bb, ichimoku }
  };
};