import { ExpertForecast } from '../types';
import { StrategyWeights } from '../dataUtils';

export interface StoredPrediction {
  id: string;
  timestamp: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  status: 'PENDING' | 'WIN' | 'LOSS';
  actualOutcome?: number; // Price at closure
  indicators: {
    rsi: number;
    macdHistogram: number;
    atr: number;
    regime: string;
  };
  reason: string;
  weightsAtTime: StrategyWeights;
}

export class PredictionHistoryService {
  private STORAGE_KEY = 'ime_prediction_history_v1';
  private history: StoredPrediction[] = [];

  constructor() {
    this.loadHistory();
  }

  private loadHistory() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.history = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load prediction history', e);
      this.history = [];
    }
  }

  private saveHistory() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save prediction history', e);
    }
  }

  savePrediction(forecast: ExpertForecast, symbol: string, weights: StrategyWeights) {
    if (forecast.action === 'HOLD') return;

    // Check if we already have a pending prediction for this symbol to avoid spam
    const existingPending = this.history.find(p =>
      p.symbol === symbol &&
      p.status === 'PENDING' &&
      p.action === forecast.action &&
      Math.abs(p.entryPrice - forecast.entryPrice) / p.entryPrice < 0.005 // Within 0.5% price difference
    );

    if (existingPending) {
      // Update timestamp to keep it fresh, but don't duplicate
      existingPending.timestamp = Date.now();
      return;
    }

    const prediction: StoredPrediction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol,
      action: forecast.action as 'BUY' | 'SELL',
      entryPrice: forecast.entryPrice,
      targetPrice: forecast.targetPrice,
      stopLoss: forecast.stopLoss,
      confidence: forecast.confidence,
      status: 'PENDING',
      indicators: {
        rsi: forecast.indicators.rsi,
        macdHistogram: forecast.indicators.macd.histogram,
        atr: forecast.indicators.atr,
        regime: forecast.regime
      },
      reason: forecast.reason,
      weightsAtTime: weights
    };

    this.history.unshift(prediction);
    // Limit history size to 1000 entries
    if (this.history.length > 1000) {
      this.history = this.history.slice(0, 1000);
    }
    this.saveHistory();
    console.log('Prediction saved:', prediction);
  }

  getHistory(): StoredPrediction[] {
    return this.history;
  }

  evaluatePredictions(currentPrice: number, symbol: string) {
    let updated = false;

    this.history.forEach(prediction => {
      if (prediction.status !== 'PENDING' || prediction.symbol !== symbol) return;

      if (prediction.action === 'BUY') {
        if (currentPrice >= prediction.targetPrice) {
          prediction.status = 'WIN';
          prediction.actualOutcome = currentPrice;
          updated = true;
        } else if (currentPrice <= prediction.stopLoss) {
          prediction.status = 'LOSS';
          prediction.actualOutcome = currentPrice;
          updated = true;
        }
      } else if (prediction.action === 'SELL') {
        if (currentPrice <= prediction.targetPrice) {
          prediction.status = 'WIN';
          prediction.actualOutcome = currentPrice;
          updated = true;
        } else if (currentPrice >= prediction.stopLoss) {
          prediction.status = 'LOSS';
          prediction.actualOutcome = currentPrice;
          updated = true;
        }
      }
    });

    if (updated) {
      this.saveHistory();
      console.log('Evaluated predictions for', symbol, '- Updated status');
    }
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }
}

export const predictionService = new PredictionHistoryService();
