/**
 * Backend API Service - Phase 1
 * Connects Frontend to real Backend ledgers, replacing mocks
 */

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
  status: string;
  regime?: string;
  rsi?: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  timestamp: number;
  leverage?: number;
}

export interface PerformanceMetrics {
  sharpe: number;
  sortino: number;
  cagr: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
}

export interface ModelMetrics {
  version: string;
  modelVersion: string;
  inferenceLatency: number;
  modelReady: boolean;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  memoryMB: number;
}

export interface LearningData {
  history: any[];
  currentWeights: Record<string, number>;
  winRate: number;
  totalSignals: number;
  modelVersion: string;
}

export class BackendApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchJson(path: string, options?: RequestInit) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      throw new Error(`API ${path} failed: ${res.status}`);
    }
    return res.json();
  }

  // Positions - /api/positions
  async getPositions(symbol = 'SAF1403'): Promise<Position[]> {
    const data = await this.fetchJson(`/api/positions?symbol=${encodeURIComponent(symbol)}`);
    return data.data || data;
  }

  async getAllPositions(): Promise<Position[]> {
    const data = await this.fetchJson('/api/positions/all');
    return data.data || [];
  }

  // Orders - /api/orders
  async getOrders(symbol = 'SAF1403'): Promise<Order[]> {
    const data = await this.fetchJson(`/api/orders?symbol=${encodeURIComponent(symbol)}`);
    return data.data || [];
  }

  async getAllOrders(): Promise<Order[]> {
    const data = await this.fetchJson('/api/orders/all');
    return data.data || [];
  }

  // Performance - /api/performance
  async getPerformance(symbol = 'SAF1403'): Promise<PerformanceMetrics> {
    const data = await this.fetchJson(`/api/performance?symbol=${encodeURIComponent(symbol)}`);
    return data.data || data;
  }

  async calculatePerformance(trades: { profit: number }[]): Promise<PerformanceMetrics> {
    const data = await this.fetchJson('/api/performance/calculate', {
      method: 'POST',
      body: JSON.stringify({ trades }),
    });
    return data.data;
  }

  // Models - /api/models
  async getModelMetrics(): Promise<ModelMetrics> {
    const data = await this.fetchJson('/api/models');
    return data.data || data;
  }

  async getModelStatus(): Promise<any> {
    return this.fetchJson('/api/status');
  }

  // Learning - /api/learning
  async getLearningData(symbol = 'SAF1403'): Promise<LearningData> {
    const data = await this.fetchJson(`/api/learning?symbol=${encodeURIComponent(symbol)}`);
    return data.data || data;
  }

  async getLearningWeights(): Promise<{ weights: Record<string, number>; history: any[] }> {
    const data = await this.fetchJson('/api/learning/weights');
    return data;
  }

  // Paper Trading - /api/paper-trading
  async executePaperTrade(order: any, forecast: any, marketPrice?: number) {
    const data = await this.fetchJson('/api/paper-trading/execute', {
      method: 'POST',
      body: JSON.stringify({ order, forecast, marketPrice }),
    });
    return data.data;
  }

  async getPaperTrades() {
    const data = await this.fetchJson('/api/paper-trading/trades');
    return data.data;
  }

  async getPaperStats() {
    const data = await this.fetchJson('/api/paper-trading/stats');
    return data.data;
  }
}

export const createBackendApi = (proxyUrl: string) => new BackendApiService(proxyUrl);
