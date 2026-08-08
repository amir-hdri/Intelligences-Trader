import type {
  MarketCandle,
  ExpertForecast,
  ApiConfig,
  TradeAction,
  TimeFrame,
  MarketRegime,
  OrderBook,
  OrderBookItem,
  CorrelationMetrics,
  PoliticalRiskNews,
  SentimentData,
  ArbitrageOpportunity,
  WalkForwardResult,
} from "./types";
import { INDICATOR_PARAMS } from "./constants";
import Sentiment from "sentiment";
import { createSeededRng, hashString, seededGaussian } from "./utils/deterministic";

const sentiment = new Sentiment();

// Module-level storage for simulation state to ensure continuity
const SIMULATION_STATE: Record<string, Record<string, MarketCandle[]>> = {};

export class TseApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private apiUrl(path: string): string {
    const apiUrl = this.config.proxyUrl?.trim().replace(/\/$/, "");
    if (!apiUrl) throw new Error("API proxy URL is not configured");
    return `${apiUrl}${path}`;
  }

  private requestHeaders(includeJson = false): HeadersInit {
    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
    };
  }

  async fetchMarketData(symbolId: string): Promise<MarketCandle[]> {
    const url = this.apiUrl(`/api/tse/${encodeURIComponent(symbolId)}`);

    try {
      const response = await fetch(url, { headers: this.requestHeaders() });
      if (!response.ok) throw new Error(`Market API returned HTTP ${response.status}`);
      const json: unknown = await response.json();
      const data = (json as { data?: unknown })?.data;
      if (Array.isArray(data)) return data as MarketCandle[];
      throw new Error("Invalid real market data format");
    } catch (error) {
      console.error("Failed to fetch from real market API", error);
      if (!this.config.useDigitalTwin) return [];
      return this.generateDigitalTwinData(symbolId);
    }
  }

  async fetchAdvancedMetrics(historyData: MarketCandle[]): Promise<unknown | null> {
    const url = this.apiUrl('/api/analyze');

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.requestHeaders(true),
        body: JSON.stringify({ historyData }),
      });
      if (!response.ok) throw new Error("Network response was not ok");
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch advanced metrics from API:", error);
      return null;
    }
  }

  private orderBookCache = new Map<
    string,
    { timestamp: number; data: OrderBook }
  >();

  async fetchOrderBook(symbolId: string): Promise<OrderBook> {
    const now = Date.now();
    const cached = this.orderBookCache.get(symbolId);
    if (cached && now - cached.timestamp < 5000) {
      return cached.data;
    }

    const apiUrl = this.config.proxyUrl;
    if (apiUrl && this.config.isConnected) {
      try {
        const response = await fetch(
          this.apiUrl(`/api/orderbook/${encodeURIComponent(symbolId)}`),
          { headers: this.requestHeaders() },
        );
        if (response.ok) {
          const json = await response.json();
          if (json.bids && json.asks) {
            const buyVolume = json.bids.reduce((sum: number, item: OrderBookItem) => sum + item.quantity, 0);
            const sellVolume = json.asks.reduce((sum: number, item: OrderBookItem) => sum + item.quantity, 0);
            const totalVolume = buyVolume + sellVolume;
            const pressure = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;
            const buyRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;

            const result: OrderBook = {
              bids: json.bids,
              asks: json.asks,
              timestamp: json.timestamp || now,
              isSpoofingDetected: json.isSpoofing || false,
              pressure,
              queueDynamics: {
                buyVolume,
                sellVolume,
                totalVolume,
                buyRatio,
                isHerdingDetected: buyRatio > 0.5,
                momentumMultiplier: buyRatio > 0.5 ? 1.5 : 1.0
              }
            };
            this.orderBookCache.set(symbolId, { timestamp: now, data: result });
            return result;
          }
        }
      } catch (error) {
        console.warn("Failed to fetch real order book, falling back to digital twin", error);
      }
    }

    // Deterministic Order Book simulation - no Math.random
    let lastPrice: number;
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      } else {
        lastPrice = await this.getLastPrice(symbolId);
      }
    } catch (error) {
      console.warn(
        "Failed to fetch real market data for order book, falling back to digital twin:",
        error,
      );
      lastPrice = await this.getLastPrice(symbolId);
    }

    const LEVELS = 50;
    const bidPrices = new Int32Array(LEVELS);
    const bidQuantities = new Int32Array(LEVELS);
    const bidCounts = new Int32Array(LEVELS);
    const askPrices = new Int32Array(LEVELS);
    const askQuantities = new Int32Array(LEVELS);
    const askCounts = new Int32Array(LEVELS);
    const spread = lastPrice * 0.0005;
    const centerPrice = lastPrice;
    const orderMap = new Map<number, number>();

    // Deterministic RNG seeded by symbol + timestamp rounded to 5 sec
    const rng = createSeededRng(`${symbolId}-${Math.floor(now / 5000)}`);

    for (let i = 0; i < LEVELS; i++) {
      bidPrices[i] = Math.floor(centerPrice - spread / 2 - (i * spread) / 2);
      // Deterministic quantity based on rng, but seeded
      bidQuantities[i] = Math.floor(rng() * 50000) + 1000;
      bidCounts[i] = Math.floor(bidQuantities[i] / 1000) + 1;

      askPrices[i] = Math.floor(centerPrice + spread / 2 + (i * spread) / 2);
      askQuantities[i] = Math.floor(rng() * 50000) + 1000;
      askCounts[i] = Math.floor(askQuantities[i] / 1000) + 1;

      orderMap.set(bidPrices[i], bidQuantities[i]);
      orderMap.set(askPrices[i], askQuantities[i]);
    }

    // Deterministic whale detection based on hash, not random
    const whaleTrigger = (hashString(symbolId + String(Math.floor(now / 60000))) % 10);
    if (whaleTrigger > 7) {
      const side = (hashString(symbolId) % 2) === 0;
      if (side) {
        bidQuantities[0] += 100000;
        orderMap.set(bidPrices[0], bidQuantities[0]);
      } else {
        askQuantities[0] += 100000;
        orderMap.set(askPrices[0], askQuantities[0]);
      }
    }

    const buyVolume = bidQuantities.reduce((sum, qty) => sum + qty, 0);
    const sellVolume = askQuantities.reduce((sum, qty) => sum + qty, 0);
    const allQuantities = new Int32Array(orderMap.values());
    allQuantities.sort();
    const spoofingThreshold = 200000;
    let isSpoofingDetected = false;
    let left = 0;
    let right = allQuantities.length - 1;
    let resultIdx = -1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (allQuantities[mid] > spoofingThreshold) {
        resultIdx = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    if (resultIdx !== -1) isSpoofingDetected = true;

    const totalVolume = buyVolume + sellVolume;
    const pressure = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;
    const buyRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;
    const isHerdingDetected = buyRatio > 0.5;
    const momentumMultiplier = isHerdingDetected ? 1.5 : 1.0;

    const bids: OrderBookItem[] = new Array(LEVELS);
    const asks: OrderBookItem[] = new Array(LEVELS);
    for (let i = 0; i < LEVELS; i++) {
      bids[i] = { price: bidPrices[i], quantity: bidQuantities[i], count: bidCounts[i] };
      asks[i] = { price: askPrices[i], quantity: askQuantities[i], count: askCounts[i] };
    }

    const result: OrderBook = {
      bids,
      asks,
      timestamp: now,
      isSpoofingDetected,
      pressure,
      queueDynamics: { buyVolume, sellVolume, totalVolume, buyRatio, isHerdingDetected, momentumMultiplier },
    };

    this.orderBookCache.set(symbolId, { timestamp: now, data: result });
    return result;
  }

  async fetchMarketCorrelation(): Promise<CorrelationMetrics> {
    // Deterministic macro data from real TSETMC API if available, else deterministic fixed values with date-based variation
    try {
      const url = this.apiUrl('/api/market/history?symbol=GOLD9999&years=1');
      const res = await fetch(url, { headers: this.requestHeaders() });
      if (res.ok) {
        // If backend provides correlation, use it
        const json = await res.json();
        if (json.correlation) return json.correlation;
      }
    } catch { /* fallback */ }

    const daySeed = Math.floor(Date.now() / 86400000);
    const baseRng = createSeededRng(`correlation-${daySeed}`);
    // Deterministic jitter derived from seeded rng, not Math.random, bounded small
    const jitter = (mul: number) => (baseRng() - 0.5) * mul;

    return {
      usdFree: 650000 + jitter(5000),
      usdNima: 420000 + jitter(500),
      globalGold: 2350 + jitter(10),
      globalCopper: 8500 + jitter(100),
      globalBrent: 85 + jitter(2),
      correlations: {
        USD_IME: 0.88 + jitter(0.02),
        GOLD_IME: 0.92 + jitter(0.01),
        COPPER_IME: 0.85 + jitter(0.03),
        BRENT_PETRO: 0.75 + jitter(0.03),
      },
    };
  }

  async fetchSentiment(): Promise<SentimentData> {
    try {
      const response = await fetch(this.apiUrl('/api/news'), { headers: this.requestHeaders() });
      if (response.ok) {
        const data = await response.json();
        return data.sentiment;
      }
    } catch (error) {
      console.warn("Failed to fetch NLP news from server, falling back to simulation.");
    }

    const news: PoliticalRiskNews[] = [
      { id: "1", title: "Central Bank announces new strict limits on currency allocation", nerTags: ["Central Bank", "Currency Allocation"], sentimentScore: 0, impactEffect: "DOLLAR_BULLISH", source: "Fars News", timestamp: Date.now() - 3600000 },
      { id: "2", title: "Talks stall regarding international trade agreements", nerTags: ["Sanctions", "Trade", "International"], sentimentScore: 0, impactEffect: "DOLLAR_BULLISH", source: "Bloomberg Persian", timestamp: Date.now() - 7200000 },
      { id: "3", title: "Ministry of Industry increases export duties on metals", nerTags: ["Ministry", "Export", "Metals"], sentimentScore: 0, impactEffect: "NEUTRAL", source: "ISNA", timestamp: Date.now() - 12000000 },
    ];

    news.forEach((item) => {
      const result = sentiment.analyze(item.title);
      item.sentimentScore = result.comparative;
    });

    const score = news.reduce((acc, curr) => acc + curr.sentimentScore, 0) / (news.length || 1);
    const label = score > 0.1 ? "GREED" : score < -0.1 ? "FEAR" : "NEUTRAL";

    let bullishCount = news.filter((n) => n.impactEffect === "DOLLAR_BULLISH").length;
    let bearishCount = news.filter((n) => n.impactEffect === "DOLLAR_BEARISH").length;

    // Deterministic political risk without Math.random - based purely on news impact with time decay already applied elsewhere
    let politicalRiskIndex = 50 + bullishCount * 15 - bearishCount * 15;
    politicalRiskIndex = Math.max(0, Math.min(100, politicalRiskIndex));

    return { politicalRiskIndex, score, label, news };
  }

  async fetchMultiTimeframeData(symbolId: string): Promise<Record<TimeFrame, MarketCandle[]>> {
    const timeframes: TimeFrame[] = ["1m", "15m", "1h", "1d"];
    const result: Partial<Record<TimeFrame, MarketCandle[]>> = {};
    if (this.config.proxyUrl && this.config.isConnected) {
      try {
        const daily = await this.fetchMarketData(symbolId);
        result["1d"] = daily;
        result["1h"] = this.generateDigitalTwinData(symbolId, "1h");
        result["15m"] = this.generateDigitalTwinData(symbolId, "15m");
        result["1m"] = this.generateDigitalTwinData(symbolId, "1m");
        return result as Record<TimeFrame, MarketCandle[]>;
      } catch (e) {
        console.warn("API fetch failed, using full simulation for all timeframes");
      }
    }
    for (const tf of timeframes) {
      result[tf] = this.generateDigitalTwinData(symbolId, tf);
    }
    return result as Record<TimeFrame, MarketCandle[]>;
  }

  private async getLastPrice(symbolId: string): Promise<number> {
    const data = this.generateDigitalTwinData(symbolId, "1m");
    return data[data.length - 1].close;
  }

  private generateDigitalTwinData(symbolId: string, timeframe: TimeFrame = "1d"): MarketCandle[] {
    if (!SIMULATION_STATE[symbolId]) SIMULATION_STATE[symbolId] = {};
    const tfMs: Record<TimeFrame, number> = { "1m": 60 * 1000, "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000 };
    const count = timeframe === "1m" ? 300 : 100;
    const now = Date.now();
    const currentSlot = Math.floor(now / tfMs[timeframe]) * tfMs[timeframe];
    let candles = SIMULATION_STATE[symbolId][timeframe] || [];
    if (candles.length === 0) {
      let lastClose = symbolId.includes("SAF") ? 850000 : 150000;
      const startTime = currentSlot - count * tfMs[timeframe];
      for (let i = 0; i < count; i++) {
        const timestamp = startTime + i * tfMs[timeframe];
        const candle = this.generateSingleCandle(lastClose, timestamp, timeframe, symbolId);
        candles.push(candle);
        lastClose = candle.close;
      }
    } else {
      const lastCandle = candles[candles.length - 1];
      let nextTimestamp = lastCandle.timestamp + tfMs[timeframe];
      let lastClose = lastCandle.close;
      while (nextTimestamp <= currentSlot) {
        const candle = this.generateSingleCandle(lastClose, nextTimestamp, timeframe, symbolId);
        candles.push(candle);
        lastClose = candle.close;
        nextTimestamp += tfMs[timeframe];
      }
      if (candles.length > count * 2) candles = candles.slice(-count);
    }
    SIMULATION_STATE[symbolId][timeframe] = candles;
    return candles.slice(-count);
  }

  private generateSingleCandle(prevClose: number, timestamp: number, timeframe: TimeFrame, symbolId: string = "UNKNOWN"): MarketCandle {
    const tfMs: Record<TimeFrame, number> = { "1m": 60 * 1000, "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000 };
    const mu = 0.00005;
    const sigma = timeframe === "1m" ? 0.005 : timeframe === "15m" ? 0.01 : timeframe === "1h" ? 0.015 : 0.025;
    const dt = 1;
    const trendComponent = Math.sin(timestamp / (1000 * 60 * 60 * 24 * 7)) * 0.001;

    // Deterministic RNG per candle based on symbol + timestamp
    const rng = createSeededRng(`${symbolId}-${timeframe}-${timestamp}-${Math.floor(prevClose)}`);

    const epsilon = seededGaussian(rng);

    const jumpIntensity = timeframe === "1m" ? 0.01 : 0.05;
    const jumpMean = 0;
    const jumpStd = sigma * 3;
    let jump = 0;
    if (rng() < jumpIntensity) {
      const j_eps = seededGaussian(rng);
      jump = jumpMean + jumpStd * j_eps;
    }

    const change = prevClose * (mu * dt + trendComponent + sigma * epsilon * Math.sqrt(dt) + jump);
    const close = prevClose + change;

    // Deterministic high/low using rng
    const highFactor = rng() * (sigma / 2);
    const lowFactor = rng() * (sigma / 2);
    const high = Math.max(prevClose, close) * (1 + highFactor);
    const low = Math.min(prevClose, close) * (1 - lowFactor);
    const open = prevClose;

    const volume = Math.floor(rng() * 1000000 * (tfMs[timeframe] / tfMs["1m"]));
    const openInterest = 5000 + Math.floor(rng() * 10000);
    const basis = close * (0.02 + rng() * 0.08);
    const warehouseVolume = 10000 + Math.floor(rng() * 50000);

    return { timestamp, open, high, low, close, volume, openInterest, basis, warehouseVolume };
  }
}

// Technical Indicators
export const calculateRSI = (prices: number[], period: number = 14): number => {
  if (!Number.isInteger(period) || period < 1 || prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (!Number.isFinite(change)) return 50;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (gains === 0 && losses === 0) return 50;
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const calculateEMASeries = (prices: number[], period: number): number[] => {
  if (prices.length === 0 || !Number.isFinite(period) || period <= 0) return [];
  const k = 2 / (period + 1);
  const values = new Array<number>(prices.length);
  values[0] = prices[0];
  for (let i = 1; i < prices.length; i++) values[i] = prices[i] * k + values[i - 1] * (1 - k);
  return values;
};

export const calculateEMA = (prices: number[], period: number): number => {
  const values = calculateEMASeries(prices, period);
  return values.length > 0 ? values[values.length - 1] : 0;
};

export const calculateMACD = (prices: number[]) => {
  if (prices.length === 0) return { value: 0, signal: 0, histogram: 0 };
  const fast = calculateEMASeries(prices, INDICATOR_PARAMS.EMA_SHORT);
  const slow = calculateEMASeries(prices, INDICATOR_PARAMS.EMA_LONG);
  const macdSeries = fast.map((value, index) => value - slow[index]);
  const macdValue = macdSeries[macdSeries.length - 1];
  const signal = calculateEMA(macdSeries, INDICATOR_PARAMS.SIGNAL_PERIOD);
  return { value: macdValue, signal, histogram: macdValue - signal };
};

export const calculateATR = (candles: MarketCandle[], period: number = 14): number => {
  if (candles.length < 2 || !Number.isInteger(period) || period < 1) return 0;
  const start = Math.max(0, candles.length - period);
  const trs: number[] = [];
  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    const previousClose = i > 0 ? candles[i - 1].close : candle.open;
    const trueRange = Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
    if (Number.isFinite(trueRange) && trueRange >= 0) trs.push(trueRange);
  }
  return trs.length > 0 ? trs.reduce((a, b) => a + b, 0) / trs.length : 0;
};

export const calculateIchimoku = (candles: MarketCandle[]) => {
  if (candles.length === 0) return { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0 };
  const getHighLowMid = (slice: MarketCandle[]) => {
    if (slice.length === 0) return 0;
    const highs = slice.map((c) => c.high);
    const lows = slice.map((c) => c.low);
    return (Math.max(...highs) + Math.min(...lows)) / 2;
  };
  const tenkan = candles.length >= 9 ? getHighLowMid(candles.slice(-9)) : candles[candles.length - 1].close;
  const kijun = candles.length >= 26 ? getHighLowMid(candles.slice(-26)) : candles[candles.length - 1].close;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = candles.length >= 52 ? getHighLowMid(candles.slice(-52)) : candles[candles.length - 1].close;
  return { tenkan, kijun, senkouA, senkouB };
};

export const calculateBollingerBands = (prices: number[], period: number = 20, stdDev: number = 2) => {
  if (!Number.isInteger(period) || period < 1 || prices.length === 0) return { upper: 0, middle: 0, lower: 0 };
  const slice = prices.slice(-period).filter(Number.isFinite);
  if (slice.length === 0) return { upper: 0, middle: 0, lower: 0 };
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  const squareDiffs = slice.map((price) => (price - avg) ** 2);
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(variance);
  return { upper: avg + stdDev * std, middle: avg, lower: avg - stdDev * std };
};

export const calculateFairValue = (symbolId: string, currentPrice: number, correlation: CorrelationMetrics): number => {
  if (symbolId.includes("GOLD")) {
    return ((correlation.globalGold * correlation.usdFree) / 31.1035) * 0.976 * 1.05;
  }
  return currentPrice;
};

export const detectArbitrageOpportunity = (symbolId: string, lastCandle: MarketCandle): ArbitrageOpportunity | undefined => {
  if (!lastCandle.basis) return undefined;
  const basisPct = lastCandle.basis / lastCandle.close;
  const monthlyInterest = 0.025;
  if (basisPct > monthlyInterest * 2) {
    return { type: "CASH_AND_CARRY", profitPercentage: (basisPct - monthlyInterest) * 100, details: "Risk-free arbitrage: Buy Spot, Sell Future. Basis exceeds cost of carry." };
  }
  if (basisPct < -0.01) {
    return { type: "BASIS", profitPercentage: Math.abs(basisPct) * 100, details: "Backwardation: Spot > Future. Bullish signal or shortage." };
  }
  return undefined;
};

export const calculateSeasonalityFactor = (symbolId: string): number => {
  const month = new Date().getMonth();
  if (symbolId.includes("SAF")) {
    if (month === 9 || month === 10) return 1.25;
    if (month === 2 || month === 3) return 0.85;
  }
  return 1.0;
};

export const detectMarketRegime = (candles: MarketCandle[], atr: number): MarketRegime => {
  if (candles.length < 50) return "RANGING";
  const prices = candles.map((c) => c.close);
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const lastPrice = prices[prices.length - 1];
  if (!Number.isFinite(lastPrice) || lastPrice <= 0 || !Number.isFinite(atr) || atr < 0) return "RANGING";
  const volatility = atr / lastPrice;
  if (volatility > 0.03) return "HIGH_VOLATILITY";
  if (lastPrice > ema20 && ema20 > ema50) return "TRENDING_UP";
  if (lastPrice < ema20 && ema20 < ema50) return "TRENDING_DOWN";
  return "RANGING";
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
  openInterest: 2.5,
};

let optimizedWeights: StrategyWeights = { ...DEFAULT_WEIGHTS };

export interface PrecalculatedIndicators {
  dIchimoku: { tenkan: number; kijun: number; senkouA: number; senkouB: number; chikou?: number };
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  atr: number;
  bb: { upper: number; middle: number; lower: number; bandwidth?: number };
  ichimoku: { tenkan: number; kijun: number; senkouA: number; senkouB: number; chikou?: number };
  regime: MarketRegime;
}

export const analyzeMarketMTF = (
  mtfData: Record<TimeFrame, MarketCandle[]>,
  symbolId: string = "",
  externalMetrics?: { orderBook: OrderBook | null; correlation: CorrelationMetrics | null; sentiment: SentimentData | null },
  weights: StrategyWeights = optimizedWeights,
  precalc?: PrecalculatedIndicators,
): ExpertForecast => {
  const dailyCandles = mtfData["1d"] || [];
  const hourlyCandles = mtfData["1h"] || dailyCandles;

  if (dailyCandles.length < 30) {
    return {
      action: "HOLD", entryPrice: 0, targetPrice: 0, stopLoss: 0, confidence: 0, regime: "RANGING",
      sentimentScore: 0, basisOpportunity: 0, orderBookPressure: 0, politicalRiskIndex: 50, queueDynamicsRatio: 0.5,
      timeframeAnalysis: {},
      indicators: { rsi: 50, macd: { value: 0, signal: 0, histogram: 0 }, atr: 0, bollinger: { upper: 0, middle: 0, lower: 0 }, ichimoku: { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0 } },
      reason: "Insufficient Data",
    };
  }

  const lastCandle = hourlyCandles[hourlyCandles.length - 1];
  const sentimentScore = externalMetrics?.sentiment?.score ?? 0;
  const dIchimoku = calculateIchimoku(dailyCandles);
  const dailyTrend = lastCandle.close > dIchimoku.senkouA && lastCandle.close > dIchimoku.senkouB ? "BULLISH" : lastCandle.close < dIchimoku.senkouA && lastCandle.close < dIchimoku.senkouB ? "BEARISH" : "NEUTRAL";
  const hPrices = hourlyCandles.map((c) => c.close);
  const rsi = precalc?.rsi ?? calculateRSI(hPrices);
  const macd = precalc?.macd ?? calculateMACD(hPrices);
  const atr = precalc?.atr ?? calculateATR(hourlyCandles);
  const bb = precalc?.bb ?? calculateBollingerBands(hPrices);
  const ichimoku = precalc?.ichimoku ?? calculateIchimoku(hourlyCandles);
  const regime = precalc?.regime ?? detectMarketRegime(hourlyCandles, atr);

  let score = 0;
  const reasons: string[] = [];

  if (dailyTrend === "BULLISH") score += 1;
  if (dailyTrend === "BEARISH") score -= 1;

  if (lastCandle.openInterest && dailyCandles.length > 1) {
    const prevOI = dailyCandles[dailyCandles.length - 2].openInterest || 0;
    const oiChange = lastCandle.openInterest - prevOI;
    const priceChange = lastCandle.close - dailyCandles[dailyCandles.length - 2].close;
    if (priceChange > 0 && oiChange > 0) { score += weights.openInterest; reasons.push("Bullish: Price rising with increasing Open Interest (New Money)"); }
    else if (priceChange > 0 && oiChange < 0) { reasons.push("Weak Bullish: Short Covering detected"); }
    else if (priceChange < 0 && oiChange > 0) { score -= weights.openInterest; reasons.push("Bearish: Price falling with increasing Open Interest (Aggressive Shorting)"); }
  }

  if (lastCandle.basis) {
    const basisPct = lastCandle.basis / lastCandle.close;
    if (basisPct < -0.01) { score += weights.basis; reasons.push("Backwardation (Bullish Supply Shortage)"); }
  }

  if (externalMetrics?.orderBook) {
    if (externalMetrics.orderBook.pressure > 0.25) { score += weights.orderBook; reasons.push("Order Book Imbalance: Buyers Dominating"); }
    else if (externalMetrics.orderBook.pressure < -0.25) { score -= weights.orderBook; reasons.push("Order Book Imbalance: Sellers Dominating"); }
  }

  if (lastCandle.close > ichimoku.senkouA) score += weights.ichimoku;
  if (rsi < 30) { score += weights.rsi; reasons.push("RSI Oversold"); }
  if (rsi > 70) { score -= weights.rsi; reasons.push("RSI Overbought"); }
  if (macd.histogram > 0 && macd.histogram > macd.signal * 0.1) score += weights.macd;

  const arbitrage = detectArbitrageOpportunity(symbolId, lastCandle);
  if (arbitrage) {
    score += arbitrage.type === "CASH_AND_CARRY" ? weights.basis : -weights.basis;
    reasons.push(`Arbitrage Opportunity: ${arbitrage.details}`);
  }

  let bubbleGap = 0;
  let politicalRiskIndex = 50;
  const now = Date.now();

  if (externalMetrics?.sentiment?.news) {
    const newsWeightSum = externalMetrics.sentiment.news.reduce((sum, n) => {
      const hoursAgo = (now - n.timestamp) / 3600000;
      const timeDecay = Math.exp(-hoursAgo / 24);
      let impact = n.impactEffect === "DOLLAR_BULLISH" ? 15 : n.impactEffect === "DOLLAR_BEARISH" ? -15 : 0;
      return sum + (impact * timeDecay);
    }, 0);
    politicalRiskIndex = Math.max(0, Math.min(100, 50 + newsWeightSum));
  } else {
    politicalRiskIndex = externalMetrics?.sentiment?.politicalRiskIndex || 50;
  }

  const tfMs: Record<TimeFrame, number> = { "1m": 60 * 1000, "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000 };
  const logReturns = [];
  for (let i = 1; i < hPrices.length; i++) {
    if (hPrices[i - 1] > 0) logReturns.push(Math.log(hPrices[i] / hPrices[i - 1]));
  }
  const variance = logReturns.length > 0 ? logReturns.reduce((s, r) => s + r * r, 0) / logReturns.length : 0;
  const localVix = Math.sqrt(variance * 252 * (tfMs["1h"] / tfMs["1d"])) * 100;

  const queueDynamicsRatio = externalMetrics?.orderBook?.queueDynamics?.buyRatio ?? 0.5;

  if (externalMetrics?.correlation) {
    let pGlobal = 1;
    let usdRate = externalMetrics.correlation.usdNima;
    if (symbolId.includes("SAF") || symbolId.includes("GOLD")) {
      pGlobal = externalMetrics.correlation.globalGold / 31.1035;
      usdRate = externalMetrics.correlation.usdFree;
    } else if (symbolId.includes("COPPER")) {
      pGlobal = externalMetrics.correlation.globalCopper / 1000;
      usdRate = externalMetrics.correlation.usdNima;
    }
    const pFair = pGlobal * usdRate;
    bubbleGap = (lastCandle.close - pFair) / pFair;
    if (bubbleGap > 0.2) { score -= 3; reasons.push(`Bubble Detected: Market price is ${(bubbleGap * 100).toFixed(1)}% above Macro Fair Value.`); }
    else if (bubbleGap < -0.1) { score += 2; reasons.push("Undervalued relative to Global/USD Covariates."); }
  }

  if (politicalRiskIndex > 70) {
    score += 4;
    reasons.push(`High Political Risk Index (${politicalRiskIndex.toFixed(0)}) -> Expecting USD/Commodity inflation leap.`);
  } else if (politicalRiskIndex < 30) {
    score -= 3;
    reasons.push(`Low Political Risk Index (${politicalRiskIndex.toFixed(0)}) -> Bearish for USD-pegged assets.`);
  }

  if (localVix > 40) {
    score *= 0.5;
    reasons.push(`Extreme Market Volatility (VIX: ${localVix.toFixed(1)}%). Reducing position size/confidence.`);
  }

  if (externalMetrics?.orderBook?.queueDynamics?.isHerdingDetected) {
    score *= externalMetrics.orderBook.queueDynamics.momentumMultiplier;
    reasons.push("Queue Dynamics: Herding behavior detected. Momentum multiplier applied.");
  }

  const action: TradeAction = score >= 5 ? "BUY" : score <= -5 ? "SELL" : "HOLD";
  const confidence = Math.min(Math.abs(score) / 15, 0.99);

  return {
    action,
    entryPrice: lastCandle.close,
    targetPrice: action === "BUY" ? lastCandle.close + 3 * atr : action === "SELL" ? lastCandle.close - 3 * atr : lastCandle.close,
    stopLoss: action === "BUY" ? lastCandle.close - 1.5 * atr : action === "SELL" ? lastCandle.close + 1.5 * atr : lastCandle.close,
    confidence,
    regime,
    sentimentScore,
    basisOpportunity: lastCandle.basis || 0,
    fairValue: externalMetrics?.correlation ? calculateFairValue(symbolId, lastCandle.close, externalMetrics.correlation) : undefined,
    bubbleGap,
    arbitrage,
    orderBookPressure: externalMetrics?.orderBook?.pressure || 0,
    politicalRiskIndex,
    queueDynamicsRatio,
    timeframeAnalysis: { "1d": { trend: dailyTrend, signal: "Trend Context" }, "1h": { trend: score > 0 ? "BULLISH" : "BEARISH", signal: action } },
    indicators: { rsi, macd, atr, bollinger: { upper: bb.upper, lower: bb.lower, middle: bb.middle }, ichimoku: { tenkan: ichimoku.tenkan, kijun: ichimoku.kijun, senkouA: ichimoku.senkouA, senkouB: ichimoku.senkouB } },
    reason: reasons.join(". ") || "Market consolidating.",
  };
};

export const analyzeMarket = (candles: MarketCandle[]): ExpertForecast => {
  return analyzeMarketMTF({ "1h": candles, "1d": candles, "1m": [], "15m": [] }, "UNKNOWN");
};

export const calculateStrategyMetrics = (trades: { profit: number }[]) => {
  const wins = trades.filter((t) => t.profit > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalGain = wins.reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(trades.filter((t) => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : 10;
  return { winRate, profitFactor };
};

const simulateForwardStep = (
  candles: MarketCandle[],
  startIndex: number,
  stepSize: number,
  currentWindow: MarketCandle[],
): { windowProfit: number; trades: { profit: number }[] } => {
  let windowProfit = 0;
  const trades: { profit: number }[] = [];
  for (let j = 0; j < stepSize; j++) {
    const forecast = analyzeMarket(currentWindow);
    const testCandle = candles[startIndex + j];
    if (forecast.action !== "HOLD") {
      const entryPrice = testCandle.close;
      const exitIndex = startIndex + Math.min(j + 1, stepSize - 1);
      const exitPrice = candles[exitIndex].close;
      const profit = forecast.action === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
      windowProfit += profit;
      trades.push({ profit });
    }
    currentWindow.push(testCandle);
  }
  return { windowProfit, trades };
};

export const performWalkForwardBacktest = (candles: MarketCandle[]): WalkForwardResult[] => {
  if (candles.length < 50) return [];
  const windowSize = 50;
  const stepSize = 10;
  const results = [];
  const currentWindow = candles.slice(0, windowSize);
  for (let i = windowSize; i < candles.length - stepSize; i += stepSize) {
    const { windowProfit, trades } = simulateForwardStep(candles, i, stepSize, currentWindow);
    const { winRate, profitFactor } = calculateStrategyMetrics(trades);
    results.push({ period: new Date(candles[i].timestamp).toLocaleDateString(), winRate, profitFactor, profit: windowProfit });
    currentWindow.splice(0, stepSize);
  }
  return results;
};

export const optimizeStrategyWeights = (candles: MarketCandle[]): { weights: StrategyWeights; accuracy: number } => {
  let bestWeights = { ...DEFAULT_WEIGHTS };
  let maxWinRate = 0;

  // Deterministic candidate generation using seeded RNG, no Math.random
  const baseRng = createSeededRng(`optimize-${candles.length}-${candles[0]?.timestamp ?? 0}`);
  const candidates: StrategyWeights[] = [];
  const tradesList: { profit: number }[][] = [];
  for (let i = 0; i < 15; i++) {
    const r = createSeededRng(`candidate-${i}-${baseRng()}`);
    candidates.push({
      ichimoku: r() * 4,
      rsi: r() * 4,
      macd: r() * 4,
      basis: r() * 4,
      sentiment: r() * 4,
      orderBook: r() * 4,
      correlation: r() * 4,
      openInterest: r() * 4,
    });
    tradesList.push([]);
  }

  const currentSlice = candles.slice(0, 50);
  for (let j = 50; j < candles.length - 1; j++) {
    const mtfData: Record<TimeFrame, MarketCandle[]> = { "1h": currentSlice, "1d": currentSlice, "1m": [], "15m": [] };
    const hPrices = currentSlice.map((c) => c.close);
    const atrVal = calculateATR(currentSlice);
    const precalc: PrecalculatedIndicators = {
      dIchimoku: calculateIchimoku(currentSlice),
      rsi: calculateRSI(hPrices),
      macd: calculateMACD(hPrices),
      atr: atrVal,
      bb: calculateBollingerBands(hPrices),
      ichimoku: calculateIchimoku(currentSlice),
      regime: detectMarketRegime(currentSlice, atrVal),
    };
    for (let i = 0; i < 15; i++) {
      const forecast = analyzeMarketMTF(mtfData, "", undefined, candidates[i], precalc);
      if (forecast.action !== "HOLD") {
        const profit = forecast.action === "BUY" ? candles[j + 1].close - candles[j].close : candles[j].close - candles[j + 1].close;
        tradesList[i].push({ profit });
      }
    }
    currentSlice.push(candles[j]);
  }

  for (let i = 0; i < 15; i++) {
    const { winRate } = calculateStrategyMetrics(tradesList[i]);
    if (winRate > maxWinRate) {
      maxWinRate = winRate;
      bestWeights = candidates[i];
    }
  }

  optimizedWeights = bestWeights;
  return { weights: bestWeights, accuracy: maxWinRate };
};

export const trainModelEpoch = async (candles: MarketCandle[], symbolId: string): Promise<number> => {
  try {
    const response = await fetch("/api/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbolId, historyData: candles }),
    });
    if (response.ok) {
      const result = await response.json();
      console.log("Deep Learning Result:", result);
      return result.performance.winRate;
    }
  } catch (error) {
    console.error("Deep training failed, falling back to local optimization", error);
  }
  const { accuracy } = optimizeStrategyWeights(candles);
  return accuracy;
};
