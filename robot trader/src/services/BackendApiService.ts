/** Typed client for the analysis/paper-trading API boundary. */
import type { ExpertForecast } from '../types';
import { apiJson } from './apiFetch';

export interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
  status: 'OPEN' | 'CLOSED';
  regime?: string;
  rsi?: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  price: number;
  quantity: number;
  filledQuantity: number;
  status: 'PENDING' | 'FILLED' | 'PARTIAL_FILLED' | 'CANCELLED' | 'REJECTED';
  timestamp: number;
  leverage?: number;
}

export interface PerformanceMetrics {
  sharpe: number;
  sortino: number;
  cagr: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number | null;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  totalPnl: number;
  finalEquity: number;
}

export interface ModelMetrics {
  version: string;
  modelVersion?: string;
  inferenceLatency: number;
  modelReady: boolean;
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1Score?: number | null;
  memoryMB?: number;
}

export interface LearningRecord {
  id: string;
  timestamp: number;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  status: 'WIN' | 'LOSS' | 'PENDING';
  confidence: number;
}

export interface LearningData {
  history: LearningRecord[];
  currentWeights: Record<string, number>;
  winRate: number;
  totalSignals: number;
  modelVersion: string;
}

export interface LegacyPaperOrder {
  action: 'BUY' | 'SELL';
  qty: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  symbol: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface PaperTradeResult {
  success: boolean;
  simulated: true;
  isWin: boolean;
  pnl: number;
  newBalance: number;
  trade: {
    id: string;
    timestamp: number;
    reason: string;
  };
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  source?: string;
  simulated?: boolean;
}

export class BackendApiService {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(baseUrl: string, accessToken = '') {
    this.baseUrl = baseUrl.trim().replace(/\/$/, '');
    this.accessToken = accessToken;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    return apiJson<T>(this.url(path), this.accessToken, options);
  }

  async testConnection(): Promise<ModelMetrics> {
    return this.getModelStatus();
  }

  login(username: string, password: string): Promise<AuthSession> {
    return apiJson<AuthSession>(this.url('/api/auth/login'), '', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  refresh(refreshToken: string): Promise<Omit<AuthSession, 'refreshToken'>> {
    return apiJson(this.url('/api/auth/refresh'), '', {
      method: 'POST',
      body: JSON.stringify({ token: refreshToken }),
    });
  }

  async getPositions(symbol = 'SAF1403'): Promise<Position[]> {
    const response = await this.fetchJson<ApiEnvelope<Position[]>>(`/api/positions?symbol=${encodeURIComponent(symbol)}`);
    return response.data;
  }

  async getAllPositions(): Promise<Position[]> {
    const response = await this.fetchJson<ApiEnvelope<Position[]>>('/api/positions/all');
    return response.data;
  }

  async getOrders(symbol = 'SAF1403'): Promise<Order[]> {
    const response = await this.fetchJson<ApiEnvelope<Order[]>>(`/api/orders?symbol=${encodeURIComponent(symbol)}`);
    return response.data;
  }

  async getAllOrders(): Promise<Order[]> {
    const response = await this.fetchJson<ApiEnvelope<Order[]>>('/api/orders/all');
    return response.data;
  }

  async getPerformance(symbol = 'SAF1403'): Promise<PerformanceMetrics> {
    const response = await this.fetchJson<ApiEnvelope<PerformanceMetrics>>(`/api/performance?symbol=${encodeURIComponent(symbol)}`);
    return response.data;
  }

  async calculatePerformance(trades: Array<{ profit: number; timestamp?: number }>): Promise<PerformanceMetrics> {
    const response = await this.fetchJson<ApiEnvelope<PerformanceMetrics>>('/api/performance/calculate', {
      method: 'POST',
      body: JSON.stringify({ trades }),
    });
    return response.data;
  }

  async getModelMetrics(): Promise<ModelMetrics> {
    const response = await this.fetchJson<ApiEnvelope<ModelMetrics>>('/api/models');
    return response.data;
  }

  getModelStatus(): Promise<ModelMetrics> {
    return this.fetchJson<ModelMetrics>('/api/status');
  }

  async getLearningData(symbol = 'SAF1403'): Promise<LearningData> {
    const response = await this.fetchJson<ApiEnvelope<LearningData>>(`/api/learning?symbol=${encodeURIComponent(symbol)}`);
    return response.data;
  }

  async getLearningWeights(): Promise<{ weights: Record<string, number>; history: LearningRecord[] }> {
    return this.fetchJson('/api/learning/weights');
  }

  async executePaperTrade(
    order: LegacyPaperOrder,
    forecast: ExpertForecast,
    marketPrice?: number,
  ): Promise<PaperTradeResult> {
    const response = await this.fetchJson<ApiEnvelope<PaperTradeResult>>('/api/paper-trading/execute', {
      method: 'POST',
      body: JSON.stringify({ order, forecast, marketPrice }),
    });
    return response.data;
  }

  async getPaperTrades(): Promise<unknown[]> {
    const response = await this.fetchJson<ApiEnvelope<{ trades: unknown[] }>>('/api/paper-trading/trades');
    return response.data.trades;
  }

  async getPaperStats(): Promise<{ winRate: number; totalPnl: number; totalTrades: number; balance: number }> {
    const response = await this.fetchJson<ApiEnvelope<{ winRate: number; totalPnl: number; totalTrades: number; balance: number }>>('/api/paper-trading/stats');
    return response.data;
  }
}

export const createBackendApi = (proxyUrl: string, accessToken = '') => new BackendApiService(proxyUrl, accessToken);
