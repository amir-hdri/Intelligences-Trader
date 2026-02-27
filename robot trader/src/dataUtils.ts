import { 
  MarketCandle, ExpertForecast, ApiConfig, TradeAction, TimeFrame, MarketRegime, 
  OrderBook, OrderBookItem, CorrelationMetrics, SentimentData, ArbitrageOpportunity 
} from './types';
import { INDICATOR_PARAMS } from './constants';

// Module-level storage for simulation state to ensure continuity
const SIMULATION_STATE: Record<string, Record<string, MarketCandle[]>> = {};

export class TseApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  async fetchMarketData(symbolId: string): Promise<MarketCandle[]> {
    // If proxy is configured and connected, try to fetch real data
    if (this.config.proxyUrl && this.config.isConnected) {
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await fetch(`${this.config.proxyUrl}/api/tse/history/${symbolId}`);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const json = await response.json();
          if (Array.isArray(json)) return json;
          if (json.data && Array.isArray(json.data)) return json.data;
          return [];
        } catch (error) {
          console.warn(`Fetch failed for ${symbolId}. Retries left: ${retries - 1}`, error);
          retries--;
          if (retries === 0) {
            console.error('Final fetch failure. Falling back to Digital Twin.');
            return this.generateDigitalTwinData(symbolId);
          }
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, 3 - retries)));
        }
      }
      return this.generateDigitalTwinData(symbolId);
    } else {
      // No proxy or not connected - use Digital Twin
      if (!this.config.proxyUrl) {
        console.warn('No Proxy URL configured. Using Digital Twin.');
      }
      return this.generateDigitalTwinData(symbolId);
    }
  }

  async fetchOrderBook(symbolId: string): Promise<OrderBook | null> {
    // Try to fetch from API first
    if (this.config.proxyUrl && this.config.isConnected) {
      try {
        const response = await fetch(`${this.config.proxyUrl}/api/tse/info/${symbolId}`);
        if (response.ok) {
          const data = await response.json();
          const bids = data.orderBook?.bids || [];
          const asks = data.orderBook?.asks || [];

          let buyVolume = bids.reduce((acc: number, b: any) => acc + b.quantity, 0);
          let sellVolume = asks.reduce((acc: number, a: any) => acc + a.quantity, 0);
          const pressure = (buyVolume - sellVolume) / (buyVolume + sellVolume || 1);

          return {
            bids,
            asks,
            timestamp: data.timestamp || Date.now(),
            isSpoofingDetected: false,
            pressure
          };
        }
      } catch (e) {
        console.warn('Orderbook fetch failed, using simulation', e);
      }
    }

    // Simulated Order Book (Fallback)
    if (!this.config.proxyUrl) {
      console.warn('No Proxy URL configured. Using simulated order book.');
    }

    const lastPrice = await this.getLastPrice(symbolId);
    const bids: OrderBookItem[] = [];
    const asks: OrderBookItem[] = [];

    let buyVolume = 0;
    let sellVolume = 0;

    const spread = lastPrice * 0.0005;
    const centerPrice = lastPrice;

    for (let i = 0; i < 5; i++) {
      const bidPrice = Math.floor(centerPrice - spread/2 - (i * spread/2));
      const askPrice = Math.floor(centerPrice + spread/2 + (i * spread/2));
      
      const bidQty = Math.floor(Math.random() * 50000) + 1000;
      const askQty = Math.floor(Math.random() * 50000) + 1000;
      
      bids.push({ price: bidPrice, quantity: bidQty, count: Math.floor(bidQty / 1000) + 1 });
      asks.push({ price: askPrice, quantity: askQty, count: Math.floor(askQty / 1000) + 1 });
      
      buyVolume += bidQty;
      sellVolume += askQty;
    }

    // Simulate occasional large orders ("Whales")
    if (Math.random() > 0.8) {
      if (Math.random() > 0.5) bids[0].quantity += 100000;
      else asks[0].quantity += 100000;
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
    // In a real app, this would fetch from a dedicated macro-economic API endpoint
    return {
      usdFree: 650000 + Math.random() * 2000 - 1000,
      usdNima: 420000 + Math.random() * 500 - 250,
      globalGold: 2350 + Math.random() * 10 - 5,
      globalBrent: 85 + Math.random() * 2 - 1,
      correlations: {
        'USD_IME': 0.88 + Math.random() * 0.02,
        'GOLD_IME': 0.92 + Math.random() * 0.01,
        'BRENT_PETRO': 0.75 + Math.random() * 0.03
      }
    };
  }

  async fetchSentiment(): Promise<SentimentData> {
    // Try to fetch from API first
    if (this.config.proxyUrl && this.config.isConnected) {
      try {
        const response = await fetch(`${this.config.proxyUrl}/api/news`);
        if (response.ok) {
          const data = await response.json();
          if (data.sentiment) return data.sentiment;
        }
      } catch (error) {
        console.warn('Failed to fetch NLP news from server, falling back to simulation.');
      }
    }

    // Simulated sentiment (fallback)
    const news = [
      { id: '1', title: 'IME Gold Futures volume spikes amid currency fluctuation', impact: 'HIGH' as const, source: 'TSETMC News', timestamp: Date.now() - 3600000 },
      { id: '2', title: 'Central Bank announces new Nima rate policy', impact: 'MEDIUM' as const, source: 'Sena', timestamp: Date.now() - 7200000 },
    ];
    
    // Slowly varying sentiment
    const timeFactor = Math.sin(Date.now() / (1000 * 60 * 60));
    const score = 0.2 + (timeFactor * 0.3);
    const label = score > 0.3 ? 'GREED' : score < -0.1 ? 'FEAR' : 'NEUTRAL';

    return {
      score,
      label,
      news
    };
  }

  async fetchMultiTimeframeData(symbolId: string): Promise<Record<TimeFrame, MarketCandle[]>> {
    const timeframes: TimeFrame[] = ['1m', '15m', '1h', '1d'];
    const result: Partial<Record<TimeFrame, MarketCandle[]>> = {};

    // If API is connected, fetch daily from API and simulate intraday frames
    if (this.config.proxyUrl && this.config.isConnected) {
      try {
        const daily = await this.fetchMarketData(symbolId);
        result['1d'] = daily;
        result['1h'] = this.generateDigitalTwinData(symbolId, '1h');
        result['15m'] = this.generateDigitalTwinData(symbolId, '15m');
        result['1m'] = this.generateDigitalTwinData(symbolId, '1m');
        return result as Record<TimeFrame, MarketCandle[]>;
      } catch(e) {
        console.warn('API fetch failed, using full simulation for all timeframes');
      }
    }

    // Full simulation fallback
    for (const tf of timeframes) {
      result[tf] = this.generateDigitalTwinData(symbolId, tf);
    }

    return result as Record<TimeFrame, MarketCandle[]>;
  }

  private async getLastPrice(symbolId: string): Promise<number> {
    const data = this.generateDigitalTwinData(symbolId, '1m');
    return data[data.length - 1].close;
  }

  private generateDigitalTwinData(symbolId: string, timeframe: TimeFrame = '1d'): MarketCandle[] {
    // Initialize storage for this symbol if needed
    if (!SIMULATION_STATE[symbolId]) {
      SIMULATION_STATE[symbolId] = {};
    }

    const tfMs: Record<TimeFrame, number> = {
      '1m': 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const count = timeframe === '1m' ? 300 : 100;
    const now = Date.now();
    const currentSlot = Math.floor(now / tfMs[timeframe]) * tfMs[timeframe];

    let candles = SIMULATION_STATE[symbolId][timeframe] || [];

    // If no history, generate initial history
    if (candles.length === 0) {
      let lastClose = symbolId.includes('SAF') ? 850000 : 150000;
      const startTime = currentSlot - (count * tfMs[timeframe]);

      for (let i = 0; i < count; i++) {
        const timestamp = startTime + (i * tfMs[timeframe]);
        const candle = this.generateSingleCandle(lastClose, timestamp, timeframe);
        candles.push(candle);
        lastClose = candle.close;
      }
    } else {
      // Append new candles if time has passed
      const lastCandle = candles[candles.length - 1];
      let nextTimestamp = lastCandle.timestamp + tfMs[timeframe];
      let lastClose = lastCandle.close;

      while (nextTimestamp <= currentSlot) {
        const candle = this.generateSingleCandle(lastClose, nextTimestamp, timeframe);
        candles.push(candle);
        lastClose = candle.close;
        nextTimestamp += tfMs[timeframe];
      }

      // Prune old candles to keep memory usage in check
      if (candles.length > count * 2) {
        candles = candles.slice(-count);
      }
    }

    // Update the simulation state
    SIMULATION_STATE[symbolId][timeframe] = candles;

    // Return the last 'count' candles
    return candles.slice(-count);
  }

  private generateSingleCandle(prevClose: number, timestamp: number, timeframe: TimeFrame): MarketCandle {
    const tfMs: Record<TimeFrame, number> = {
      '1m': 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const mu = 0.00005;
    const sigma = timeframe === '1m' ? 0.005 : timeframe === '15m' ? 0.01 : timeframe === '1h' ? 0.015 : 0.025;
    const dt = 1;

    // Add a simple trend component based on sine wave to simulate market cycles
    const trendComponent = Math.sin(timestamp / (1000 * 60 * 60 * 24 * 7)) * 0.001;

    const epsilon = Math.random() * 2 - 1;
    const change = prevClose * (mu * dt + trendComponent + sigma * epsilon * Math.sqrt(dt));
    const close = prevClose + change;
    
    const high = Math.max(prevClose, close) * (1 + Math.random() * (sigma / 2));
    const low = Math.min(prevClose, close) * (1 - Math.random() * (sigma / 2));
    const open = prevClose;

    const volume = Math.floor(Math.random() * 1000000 * (tfMs[timeframe] / tfMs['1m']));
    const openInterest = 5000 + Math.floor(Math.random() * 10000);
    const basis = close * (0.02 + Math.random() * 0.08); 
    const warehouseVolume = 10000 + Math.floor(Math.random() * 50000);

    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      openInterest,
      basis,
      warehouseVolume,
    };
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
    if (slice.length === 0) return 0;
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

// Intelligence Core Functions
export const calculateFairValue = (symbolId: string, currentPrice: number, correlation: CorrelationMetrics): number => {
  if (symbolId.includes('GOLD')) {
    return (correlation.globalGold * correlation.usdFree / 31.1035) * 0.976 * 1.05;
  }
  return currentPrice;
};

export const detectArbitrageOpportunity = (symbolId: string, lastCandle: MarketCandle): ArbitrageOpportunity | undefined => {
  if (!lastCandle.basis) return undefined;

  const basisPct = lastCandle.basis / lastCandle.close;
  const monthlyInterest = 0.025;
  if (basisPct > monthlyInterest * 2) {
    return {
      type: 'CASH_AND_CARRY',
      profitPercentage: (basisPct - monthlyInterest) * 100,
      details: 'Risk-free arbitrage: Buy Spot, Sell Future. Basis exceeds cost of carry.'
    };
  }

  if (basisPct < -0.01) {
    return {
      type: 'BASIS',
      profitPercentage: Math.abs(basisPct) * 100,
      details: 'Backwardation: Spot > Future. Bullish signal or shortage.'
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
  if (candles.length < 50) return 'RANGING';
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
  openInterest: number;
}

export const DEFAULT_WEIGHTS: StrategyWeights = {
  ichimoku: 2,
  rsi: 1.5,
  macd: 1,
  basis: 3,
  sentiment: 1,
  orderBook: 2,
  correlation: 2,
  openInterest: 2.5
};

let optimizedWeights: StrategyWeights = { ...DEFAULT_WEIGHTS };

export const analyzeMarketMTF = (
  mtfData: Record<TimeFrame, MarketCandle[]>, 
  symbolId: string = '',
  externalMetrics?: {
    orderBook: OrderBook | null;
    correlation: CorrelationMetrics | null;
    sentiment: SentimentData | null;
  },
  weights: StrategyWeights = optimizedWeights
): ExpertForecast => {
  const dailyCandles = mtfData['1d'] || [];
  const hourlyCandles = mtfData['1h'] || dailyCandles;
  
  if (dailyCandles.length < 30) {
    return {
      action: 'HOLD',
      entryPrice: 0, targetPrice: 0, stopLoss: 0, confidence: 0, regime: 'RANGING',
      sentimentScore: 0, basisOpportunity: 0, orderBookPressure: 0,
      timeframeAnalysis: {}, indicators: { rsi: 50, macd: {value:0,signal:0,histogram:0}, atr: 0, bollinger: {upper:0,mid:0,lower:0}, ichimoku: {tenkan:0,kijun:0,senkouA:0,senkouB:0} },
      reason: 'Insufficient Data'
    } as any;
  }

  const lastCandle = hourlyCandles[hourlyCandles.length - 1];
  const sentimentScore = externalMetrics?.sentiment?.score || 0;

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

  // 1. Trend Analysis
  if (dailyTrend === 'BULLISH') score += 1;
  if (dailyTrend === 'BEARISH') score -= 1;

  // 2. Open Interest Analysis
  if (lastCandle.openInterest && dailyCandles.length > 1) {
    const prevOI = dailyCandles[dailyCandles.length - 2].openInterest || 0;
    const oiChange = lastCandle.openInterest - prevOI;
    const priceChange = lastCandle.close - dailyCandles[dailyCandles.length - 2].close;

    if (priceChange > 0 && oiChange > 0) {
      score += weights.openInterest;
      reasons.push('Bullish: Price rising with increasing Open Interest (New Money)');
    } else if (priceChange > 0 && oiChange < 0) {
      reasons.push('Weak Bullish: Short Covering detected');
    } else if (priceChange < 0 && oiChange > 0) {
      score -= weights.openInterest;
      reasons.push('Bearish: Price falling with increasing Open Interest (Aggressive Shorting)');
    }
  }

  // 3. Basis Analysis
  if (lastCandle.basis) {
    const basisPct = lastCandle.basis / lastCandle.close;
    if (basisPct < -0.01) {
      score += weights.basis;
      reasons.push('Backwardation (Bullish Supply Shortage)');
    }
  }

  // 4. Order Book Analysis
  if (externalMetrics?.orderBook) {
    if (externalMetrics.orderBook.pressure > 0.25) { 
      score += weights.orderBook; 
      reasons.push('Order Book Imbalance: Buyers Dominating'); 
    }
    else if (externalMetrics.orderBook.pressure < -0.25) { 
      score -= weights.orderBook; 
      reasons.push('Order Book Imbalance: Sellers Dominating'); 
    }
  }

  // 5. Technicals
  if (lastCandle.close > ichimoku.senkouA) score += weights.ichimoku;
  if (rsi < 30) { score += weights.rsi; reasons.push('RSI Oversold'); }
  if (rsi > 70) { score -= weights.rsi; reasons.push('RSI Overbought'); }
  if (macd.histogram > 0 && macd.histogram > (macd.signal * 0.1)) score += weights.macd;

  const arbitrage = detectArbitrageOpportunity(symbolId, lastCandle);
  if (arbitrage) {
    score += arbitrage.type === 'CASH_AND_CARRY' ? weights.basis : -weights.basis;
    reasons.push(`Arbitrage Opportunity: ${arbitrage.details}`);
  }

  // Scoring Logic
  const action: TradeAction = score >= 4 ? 'BUY' : score <= -4 ? 'SELL' : 'HOLD';
  const confidence = Math.min(Math.abs(score) / 12, 0.99);

  return {
    action,
    entryPrice: lastCandle.close,
    targetPrice: action === 'BUY' ? lastCandle.close + 3 * atr : lastCandle.close - 3 * atr,
    stopLoss: action === 'BUY' ? lastCandle.close - 1.5 * atr : lastCandle.close + 1.5 * atr,
    confidence,
    regime,
    sentimentScore,
    basisOpportunity: lastCandle.basis || 0,
    fairValue: externalMetrics?.correlation ? calculateFairValue(symbolId, lastCandle.close, externalMetrics.correlation) : undefined,
    arbitrage,
    orderBookPressure: externalMetrics?.orderBook?.pressure || 0,
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

// Professional Walk-Forward Backtesting Engine
export const performWalkForwardBacktest = (candles: MarketCandle[]) => {
  if (candles.length < 50) return [];
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
      correlation: Math.random() * 4,
      openInterest: Math.random() * 4
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

export const trainModelEpoch = async (candles: MarketCandle[], symbolId: string = 'SAF1403'): Promise<number> => {
  try {
    const response = await fetch('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbolId })
    });
    if (response.ok) {
      const result = await response.json();
      console.log('Deep Learning Result:', result);
      return result.performance?.winRate || 0.5;
    }
  } catch (e) {
    console.warn('Deep training failed, using local optimization', e);
  }
  const { accuracy } = optimizeStrategyWeights(candles);
  return accuracy;
};