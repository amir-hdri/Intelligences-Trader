import { 
  MarketCandle, ExpertForecast, ApiConfig, TradeAction, TimeFrame, MarketRegime, 
  OrderBook, OrderBookItem, CorrelationMetrics, SentimentData, ArbitrageOpportunity 
} from './types';
import { INDICATOR_PARAMS } from './constants';

export class TseApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  async fetchMarketData(symbolId: string): Promise<MarketCandle[]> {
    if (this.config.proxyUrl && this.config.isConnected) {
      try {
        const response = await fetch(`${this.config.proxyUrl}/api/tse/${symbolId}`);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
      } catch (error) {
        console.error('Failed to fetch from proxy, falling back to Digital Twin', error);
        return this.generateDigitalTwinData(symbolId);
      }
    } else {
      return this.generateDigitalTwinData(symbolId);
    }
  }

  async fetchOrderBook(symbolId: string): Promise<OrderBook> {
    // Simulated Order Book with Spoofing detection logic
    const lastPrice = 150000; // Mock base price
    const bids: OrderBookItem[] = [];
    const asks: OrderBookItem[] = [];

    let buyVolume = 0;
    let sellVolume = 0;

    for (let i = 0; i < 5; i++) {
      const bidPrice = lastPrice - (i + 1) * 10;
      const askPrice = lastPrice + (i + 1) * 10;
      
      const bidQty = (i === 4 && Math.random() > 0.7) ? 500000 : Math.floor(Math.random() * 50000);
      const askQty = Math.floor(Math.random() * 50000);
      
      bids.push({ price: bidPrice, quantity: bidQty, count: Math.floor(bidQty / 1000) });
      asks.push({ price: askPrice, quantity: askQty, count: Math.floor(askQty / 1000) });
      
      buyVolume += bidQty;
      sellVolume += askQty;
    }

    const isSpoofingDetected = bids[4].quantity > 200000 || asks[4].quantity > 200000;
    const pressure = (buyVolume - sellVolume) / (buyVolume + sellVolume);

    return {
      bids,
      asks,
      timestamp: Date.now(),
      isSpoofingDetected,
      pressure
    };
  }

  async fetchMarketCorrelation(): Promise<CorrelationMetrics> {
    return {
      usdFree: 650000 + Math.random() * 10000,
      usdNima: 420000 + Math.random() * 5000,
      globalGold: 2350 + Math.random() * 50,
      globalBrent: 85 + Math.random() * 5,
      correlations: {
        'USD_IME': 0.88,
        'GOLD_IME': 0.92,
        'BRENT_PETRO': 0.75
      }
    };
  }

  async fetchSentiment(): Promise<SentimentData> {
    try {
      const response = await fetch('/api/news');
      if (response.ok) {
        const data = await response.json();
        return data.sentiment;
      }
    } catch (error) {
      console.warn('Failed to fetch NLP news from server, falling back to simulation.');
    }

    const news = [
      { id: '1', title: 'Central Bank announces new Nima rate policy', impact: 'HIGH' as const, source: 'Sena', timestamp: Date.now() - 3600000 },
      { id: '2', title: 'Global gold prices stabilize amid inflation data', impact: 'MEDIUM' as const, source: 'Reuters', timestamp: Date.now() - 7200000 },
      { id: '3', title: 'IME Saffron futures see record open interest', impact: 'LOW' as const, source: 'BourseNews', timestamp: Date.now() - 10800000 },
    ];
    
    const score = 0.45; // Simulated NLP score
    return {
      score,
      label: score > 0.2 ? 'GREED' : score < -0.2 ? 'FEAR' : 'NEUTRAL',
      news
    };
  }

  async fetchMultiTimeframeData(symbolId: string): Promise<Record<TimeFrame, MarketCandle[]>> {
    const timeframes: TimeFrame[] = ['1m', '15m', '1h', '1d'];
    const result: Partial<Record<TimeFrame, MarketCandle[]>> = {};

    for (const tf of timeframes) {
      result[tf] = this.generateDigitalTwinData(symbolId, tf);
    }

    return result as Record<TimeFrame, MarketCandle[]>;
  }

  private generateDigitalTwinData(symbolId: string, timeframe: TimeFrame = '1d'): MarketCandle[] {
    const candles: MarketCandle[] = [];
    let lastClose = symbolId.includes('SAF') ? 850000 : 150000;
    const mu = 0.00005; 
    const sigma = timeframe === '1m' ? 0.005 : timeframe === '15m' ? 0.01 : timeframe === '1h' ? 0.015 : 0.025;
    const dt = 1;

    const tfMs: Record<TimeFrame, number> = {
      '1m': 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const count = timeframe === '1m' ? 300 : 100;
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const epsilon = Math.random() * 2 - 1;
      const change = lastClose * (mu * dt + sigma * epsilon * Math.sqrt(dt));
      const close = lastClose + change;
      const high = Math.max(lastClose, close) * (1 + Math.random() * (sigma / 2));
      const low = Math.min(lastClose, close) * (1 - Math.random() * (sigma / 2));
      const open = lastClose;
      const volume = Math.floor(Math.random() * 1000000 * (tfMs[timeframe] / tfMs['1m']));
      
      const openInterest = 5000 + Math.floor(Math.random() * 10000);
      const basis = close * (0.02 + Math.random() * 0.08); 
      const warehouseVolume = 10000 + Math.floor(Math.random() * 50000);

      candles.push({
        timestamp: now - (count - i) * tfMs[timeframe],
        open,
        high,
        low,
        close,
        volume,
        openInterest,
        basis,
        warehouseVolume,
      });
      lastClose = close;
    }
    return candles;
  }
}

// Technical Indicators
export const calculateRSI = (prices: number[], period: number = 14): number => {
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

export const calculateEMA = (prices: number[], period: number): number => {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

export const calculateMACD = (prices: number[]) => {
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

export const calculateATR = (candles: MarketCandle[], period: number = 14): number => {
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

export const calculateIchimoku = (candles: MarketCandle[]) => {
  const getHighLowMid = (slice: MarketCandle[]) => {
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

export const calculateBollingerBands = (prices: number[], period: number = 20, stdDev: number = 2) => {
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

export const calculatePivots = (candle: MarketCandle) => {
  const { high, low, close } = candle;
  const p = (high + low + close) / 3;
  return {
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + (high - low),
    s2: p - (high - low),
  };
};

// Intelligence Core Functions
export const calculateFairValue = (symbolId: string, currentPrice: number, correlation: CorrelationMetrics): number => {
  if (symbolId.includes('GOLD')) {
    return (correlation.globalGold * correlation.usdFree / 31.1) * 1.1; 
  }
  return currentPrice * 0.95; 
};

export const detectArbitrageOpportunity = (symbolId: string, lastCandle: MarketCandle): ArbitrageOpportunity | undefined => {
  const basisPct = (lastCandle.basis || 0) / lastCandle.close;
  if (basisPct > 0.12) {
    return {
      type: 'CASH_AND_CARRY',
      profitPercentage: basisPct * 100,
      details: 'Futures significantly higher than spot. Sell Futures, Buy Spot.'
    };
  }
  if (basisPct < -0.05) {
    return {
      type: 'BASIS',
      profitPercentage: Math.abs(basisPct) * 100,
      details: 'Backwardation detected. Potential for long convergence.'
    };
  }
  return undefined;
};

export const calculateSeasonalityFactor = (symbolId: string): number => {
  const month = new Date().getMonth();
  if (symbolId.includes('SAF')) {
    if (month === 9 || month === 10) return 1.25; 
    if (month === 2 || month === 3) return 0.85; 
  }
  return 1.0;
};

export const detectMarketRegime = (candles: MarketCandle[], atr: number): MarketRegime => {
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

export interface StrategyWeights {
  ichimoku: number;
  rsi: number;
  macd: number;
  basis: number;
  sentiment: number;
  orderBook: number;
  correlation: number;
}

export const DEFAULT_WEIGHTS: StrategyWeights = {
  ichimoku: 2,
  rsi: 2,
  macd: 1,
  basis: 3,
  sentiment: 2,
  orderBook: 2,
  correlation: 2
};

let optimizedWeights: StrategyWeights = { ...DEFAULT_WEIGHTS };

export const analyzeMarketMTF = (
  mtfData: Record<TimeFrame, MarketCandle[]>, 
  symbolId: string = '',
  externalMetrics?: {
    orderBook: OrderBook;
    correlation: CorrelationMetrics;
    sentiment: SentimentData;
  },
  weights: StrategyWeights = optimizedWeights
): ExpertForecast => {
  const dailyCandles = mtfData['1d'];
  const hourlyCandles = mtfData['1h'];
  const lastCandle = hourlyCandles[hourlyCandles.length - 1];
  
  const seasonality = calculateSeasonalityFactor(symbolId);
  const sentimentScore = externalMetrics?.sentiment.score || 0;

  const dPrices = dailyCandles.map(c => c.close);
  const dIchimoku = calculateIchimoku(dailyCandles);
  const dailyTrend = lastCandle.close > dIchimoku.senkouA && lastCandle.close > dIchimoku.senkouB ? 'BULLISH' : 
                     lastCandle.close < dIchimoku.senkouA && lastCandle.close < dIchimoku.senkouB ? 'BEARISH' : 'NEUTRAL';

  const hPrices = hourlyCandles.map(c => c.close);
  const rsi = calculateRSI(hPrices);
  const macd = calculateMACD(hPrices);
  const atr = calculateATR(hourlyCandles);
  const bb = calculateBollingerBands(hPrices);
  const ichimoku = calculateIchimoku(hourlyCandles);
  const regime = detectMarketRegime(hourlyCandles, atr);

  let score = 0;
  const reasons: string[] = [];

  if (dailyTrend === 'BULLISH') score += 1;
  if (dailyTrend === 'BEARISH') score -= 1;

  if (externalMetrics?.correlation) {
    const fairValue = calculateFairValue(symbolId, lastCandle.close, externalMetrics.correlation);
    const bubblePct = (lastCandle.close - fairValue) / fairValue;
    if (bubblePct < -0.05) { score += weights.correlation; reasons.push('Price below Fair Value (NAV)'); }
    else if (bubblePct > 0.1) { score -= weights.correlation; reasons.push('Caution: Asset Bubble detected'); }
  }

  if (externalMetrics?.orderBook) {
    if (externalMetrics.orderBook.pressure > 0.3) { score += weights.orderBook; reasons.push('Strong Buy pressure in Order Book'); }
    else if (externalMetrics.orderBook.pressure < -0.3) { score -= weights.orderBook; reasons.push('Strong Sell pressure in Order Book'); }
    if (externalMetrics.orderBook.isSpoofingDetected) reasons.push('Warning: Market Manipulation detected');
  }

  if (sentimentScore > 0.4) { score += weights.sentiment; reasons.push('NLP: Highly Positive News Sentiment'); }
  else if (sentimentScore < -0.4) { score -= weights.sentiment; reasons.push('NLP: Negative News Sentiment'); }

  if (lastCandle.close > ichimoku.senkouA) score += weights.ichimoku;
  if (rsi < 35) score += weights.rsi;
  if (macd.histogram > 0) score += weights.macd;

  const arbitrage = detectArbitrageOpportunity(symbolId, lastCandle);
  if (arbitrage) {
    score += arbitrage.type === 'CASH_AND_CARRY' ? weights.basis : -weights.basis;
    reasons.push(`Arbitrage: ${arbitrage.details}`);
  }

  const action: TradeAction = score >= 5 ? 'BUY' : score <= -5 ? 'SELL' : 'HOLD';
  const confidence = Math.min(Math.abs(score) / 15, 0.99);

  return {
    action,
    entryPrice: lastCandle.close,
    targetPrice: action === 'BUY' ? lastCandle.close + 3 * atr : lastCandle.close - 3 * atr,
    stopLoss: action === 'BUY' ? lastCandle.close - 1.5 * atr : lastCandle.close + 1.5 * atr,
    confidence,
    regime,
    sentimentScore,
    basisOpportunity: lastCandle.basis || 0,
    fairValue: externalMetrics ? calculateFairValue(symbolId, lastCandle.close, externalMetrics.correlation) : undefined,
    arbitrage,
    orderBookPressure: externalMetrics?.orderBook.pressure || 0,
    timeframeAnalysis: {
      '1d': { trend: dailyTrend, signal: 'Trend Context' },
      '1h': { trend: score > 0 ? 'BULLISH' : 'BEARISH', signal: action },
    },
    indicators: { rsi, macd, atr, bollinger: bb, ichimoku },
    reason: reasons.join('. ') || 'Market consolidating.',
  };
};

export const analyzeMarket = (candles: MarketCandle[]): ExpertForecast => {
  return analyzeMarketMTF({ '1h': candles, '1d': candles, '1m': [], '15m': [] }, 'UNKNOWN');
};

export const calculateStrategyMetrics = (trades: { profit: number }[]) => {
  const wins = trades.filter(t => t.profit > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalGain = wins.reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(trades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : 10;
  return { winRate, profitFactor };
};

export const performWalkForwardBacktest = (candles: MarketCandle[]) => {
  const windowSize = 50;
  const stepSize = 10;
  const results = [];

  for (let i = windowSize; i < candles.length - stepSize; i += stepSize) {
    const trainData = candles.slice(i - windowSize, i);
    const testData = candles.slice(i, i + stepSize);
    
    let windowProfit = 0;
    const trades = [];

    for (let j = 0; j < testData.length; j++) {
      const forecast = analyzeMarket(trainData.concat(testData.slice(0, j)));
      if (forecast.action !== 'HOLD') {
        const entryPrice = testData[j].close;
        const exitPrice = testData[Math.min(j + 1, testData.length - 1)].close;
        const profit = forecast.action === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice;
        windowProfit += profit;
        trades.push({ profit });
      }
    }

    const { winRate, profitFactor } = calculateStrategyMetrics(trades);
    results.push({
      period: new Date(testData[0].timestamp).toLocaleDateString(),
      winRate,
      profitFactor,
      profit: windowProfit
    });
  }

  return results;
};

export const optimizeStrategyWeights = (candles: MarketCandle[]): { weights: StrategyWeights; accuracy: number } => {
  let bestWeights = { ...DEFAULT_WEIGHTS };
  let maxWinRate = 0;

  for (let i = 0; i < 15; i++) {
    const candidate: StrategyWeights = {
      ichimoku: Math.random() * 4,
      rsi: Math.random() * 4,
      macd: Math.random() * 4,
      basis: Math.random() * 4,
      sentiment: Math.random() * 4,
      orderBook: Math.random() * 4,
      correlation: Math.random() * 4
    };

    const trades = [];
    for (let j = 50; j < candles.length - 1; j++) {
      const forecast = analyzeMarketMTF({ '1h': candles.slice(0, j), '1d': candles.slice(0, j), '1m': [], '15m': [] }, '', undefined, candidate);
      if (forecast.action !== 'HOLD') {
        const profit = forecast.action === 'BUY' ? candles[j + 1].close - candles[j].close : candles[j].close - candles[j + 1].close;
        trades.push({ profit });
      }
    }

    const { winRate } = calculateStrategyMetrics(trades);
    if (winRate > maxWinRate) {
      maxWinRate = winRate;
      bestWeights = candidate;
    }
  }

  optimizedWeights = bestWeights;
  return { weights: bestWeights, accuracy: maxWinRate };
};

export const trainModelEpoch = async (candles: MarketCandle[], symbolId: string): Promise<number> => {
  try {
    const response = await fetch('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbolId })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Deep Learning Result:', result);
      // Update local weights with server-optimized ones if necessary
      // optimizedWeights = result.optimizedWeights;
      return result.performance.winRate;
    }
  } catch (error) {
    console.error('Deep training failed, falling back to local optimization', error);
  }

  const { accuracy } = optimizeStrategyWeights(candles);
  return accuracy;
};
