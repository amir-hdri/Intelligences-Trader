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

export interface OrderBookItem {
  price: number;
  quantity: number;
  count: number;
}

export interface QueueDynamics {
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  buyRatio: number; // buyVolume / totalVolume
  isHerdingDetected: boolean; // buyRatio > 0.5
  momentumMultiplier: number;
}

export interface OrderBook {
  bids: OrderBookItem[];
  asks: OrderBookItem[];
  timestamp: number;
  isSpoofingDetected: boolean;
  pressure: number; // -1 to 1
  queueDynamics: QueueDynamics;
  source?: string;
  simulated?: boolean;
}

export interface CorrelationMetrics {
  simulated?: boolean;
  usdFree: number;
  usdNima: number;
  globalGold: number; // Ounce
  globalCopper: number; // LME Copper
  globalBrent: number;
  correlations: { [key: string]: number };
}

export interface PoliticalRiskNews {
  id: string;
  title: string;
  nerTags: string[];
  sentimentScore: number; // -1 to 1
  impactEffect: 'DOLLAR_BULLISH' | 'DOLLAR_BEARISH' | 'NEUTRAL';
  source: string;
  timestamp: number;
}

export interface SentimentData {
  simulated?: boolean;
  politicalRiskIndex: number; // 0 to 100
  score: number; // -1 to 1
  label: 'FEAR' | 'GREED' | 'NEUTRAL';
  news: PoliticalRiskNews[];
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

export interface BackendRiskMetrics {
  valueAtRisk95: number;
  suggestedRiskCapital?: number;
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
  bubbleGap?: number; // Gap = (P_Market - P_Fair) / P_Fair
  arbitrage?: ArbitrageOpportunity;
  orderBookPressure: number;
  politicalRiskIndex: number;
  queueDynamicsRatio: number;
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
  backendRisk?: BackendRiskMetrics;
}

export interface BackendAnalysisResponse {
  prediction: TradeAction;
  confidence: number;
  volatility: MarketRegime | 'UNKNOWN';
  reasoning?: string;
  risk: BackendRiskMetrics;
  indicators?: {
    sma20?: number;
    rsi?: number;
    atr?: number;
  };
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
  pnl?: number;
  isWin?: boolean;
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
  status: 'OPERATIONAL' | 'WARNING' | 'CRITICAL' | 'KILL_SWITCH_ACTIVE';
  marketCorrelation: CorrelationMetrics;
  sentiment: SentimentData;
  balance: number;
  lastPrice?: number;
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

export interface WalkForwardResult {
  period: string;
  winRate: number;
  profitFactor: number | null;
  profit: number;
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
