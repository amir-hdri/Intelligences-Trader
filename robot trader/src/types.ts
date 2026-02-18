export interface MarketCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number; // Added for IME Futures
  basis?: number;        // Futures - Spot
  warehouseVolume?: number; // For physical commodities
}

export type TradeAction = 'BUY' | 'SELL' | 'HOLD';
export type TimeFrame = '1m' | '15m' | '1h' | '1d';
export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'HIGH_VOLATILITY';
export type SystemStatusCode = 'OPERATIONAL' | 'WARNING' | 'CRITICAL' | 'KILL_SWITCH_ACTIVE';

export interface OrderBookItem {
  price: number;
  quantity: number;
  count: number;
}

export interface OrderBook {
  bids: OrderBookItem[];
  asks: OrderBookItem[];
  timestamp: number;
  isSpoofingDetected: boolean;
  pressure: number; // -1 to 1
}

export interface CorrelationMetrics {
  usdFree: number;
  usdNima: number;
  globalGold: number;
  globalBrent: number;
  correlations: { [key: string]: number };
}

export interface SentimentData {
  score: number; // -1 to 1
  label: 'FEAR' | 'GREED' | 'NEUTRAL';
  news: {
    id: string;
    title: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    source: string;
    timestamp: number;
  }[];
}

export interface ArbitrageOpportunity {
  type: 'CASH_AND_CARRY' | 'INTER_MARKET' | 'BASIS' | 'BUBBLE';
  profitPercentage: number;
  details: string;
}

export interface MarginStatus {
  usedMargin: number;
  freeMargin: number;
  marginLevel: number; // Percentage
  isCallRisk: boolean;
  maintenanceRequirement: number;
}

export interface ExpertForecast {
  action: TradeAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  regime: MarketRegime;
  sentimentScore: number;
  basisOpportunity: number;
  fairValue?: number;
  arbitrage?: ArbitrageOpportunity;
  orderBookPressure: number;
  timeframeAnalysis: {
    [key in TimeFrame]?: {
      trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      signal: string;
    };
  };
  indicators: {
    rsi: number;
    macd: {
      value: number;
      signal: number;
      histogram: number;
    };
    atr: number;
    bollinger: {
      upper: number;
      middle: number;
      lower: number;
    };
    ichimoku: {
      tenkan: number;
      kijun: number;
      senkouA: number;
      senkouB: number;
    };
  };
  reason: string;
}

export interface RiskLimits {
  maxDailyDrawdown: number;
  maxTotalDrawdown: number;
  maxPositionSize: number;
  maxOpenTrades: number;
  stopAllTrading: boolean;
}

export interface RiskStatus {
  currentDailyDrawdown: number;
  currentTotalDrawdown: number;
  isKillSwitchActive: boolean;
  violations: string[];
  margin: MarginStatus;
}

export interface TradeLogEntry {
  id: string;
  timestamp: number;
  symbol: string;
  action: TradeAction;
  price: number;
  reason: string;
  metricsAtTrade: {
    rsi: number;
    regime: MarketRegime;
    sentiment: number;
  };
}

export interface ApiConfig {
  proxyUrl: string;
  apiKey: string;
  isConnected: boolean;
  useDigitalTwin: boolean;
}

export interface SystemMetrics {
  uptime: string;
  latency: number;
  accuracy: number;
  activeOrders: number;
  profitFactor: number;
  maxDrawdown: number;
  winRate: number;
  status: SystemStatusCode;
  marketCorrelation: CorrelationMetrics;
  sentiment: SentimentData;
}

export interface Order {
  id: string;
  symbol: string;
  type: TradeAction;
  price: number;
  amount: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  timestamp: number;
}

export interface SymbolInfo {
  id: string;
  name: string;
  fullName: string;
  type: 'FUTURES' | 'SPOT' | 'CERTIFICATE' | 'FUND';
  expiryDate?: number;
  storageCost?: number;
  priceLimit: {
    up: number;
    down: number;
  };
}
