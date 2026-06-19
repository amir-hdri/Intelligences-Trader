"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionService = exports.PredictionHistoryService = void 0;
class PredictionHistoryService {
    STORAGE_KEY = 'ime_prediction_history_v1';
    history = [];
    // Optimization: Map to quickly find pending predictions by symbol
    pendingBySymbol = new Map();
    constructor() {
        this.loadHistory();
    }
    loadHistory() {
        try {
            if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) {
                    this.history = JSON.parse(saved);
                    this.rebuildPendingMap();
                }
            }
        }
        catch (e) {
            console.error('Failed to load prediction history', e);
            this.history = [];
            this.pendingBySymbol.clear();
        }
    }
    saveHistory() {
        try {
            if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history));
            }
        }
        catch (e) {
            console.error('Failed to save prediction history', e);
        }
    }
    rebuildPendingMap() {
        this.pendingBySymbol.clear();
        for (const prediction of this.history) {
            if (prediction.status === 'PENDING') {
                let pendingList = this.pendingBySymbol.get(prediction.symbol);
                if (pendingList) {
                    pendingList.push(prediction);
                }
                else {
                    this.pendingBySymbol.set(prediction.symbol, [prediction]);
                }
            }
        }
    }
    savePrediction(forecast, symbol, weights) {
        if (forecast.action === 'HOLD')
            return;
        // Check if we already have a pending prediction for this symbol to avoid spam
        const pendingList = this.pendingBySymbol.get(symbol);
        let existingPending;
        if (pendingList) {
            for (const p of pendingList) {
                if (p.action === forecast.action && Math.abs(p.entryPrice - forecast.entryPrice) / p.entryPrice < 0.005) {
                    existingPending = p;
                    break;
                }
            }
        }
        if (existingPending) {
            // Update timestamp to keep it fresh, but don't duplicate
            existingPending.timestamp = Date.now();
            return;
        }
        const prediction = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            symbol,
            action: forecast.action,
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
        if (pendingList) {
            pendingList.push(prediction);
        }
        else {
            this.pendingBySymbol.set(symbol, [prediction]);
        }
        // Limit history size to 1000 entries
        if (this.history.length > 1000) {
            const removedItems = this.history.slice(1000);
            this.history = this.history.slice(0, 1000);
            let rebuildNeeded = false;
            for (const item of removedItems) {
                if (item.status === 'PENDING') {
                    rebuildNeeded = true;
                    break;
                }
            }
            if (rebuildNeeded) {
                this.rebuildPendingMap();
            }
        }
        this.saveHistory();
    }
    getHistory() {
        return this.history;
    }
    evaluatePredictions(currentPrice, symbol) {
        let updated = false;
        const pendingList = this.pendingBySymbol.get(symbol);
        if (!pendingList || pendingList.length === 0)
            return;
        for (let i = pendingList.length - 1; i >= 0; i--) {
            const prediction = pendingList[i];
            let predictionUpdated = false;
            if (prediction.action === 'BUY') {
                if (currentPrice >= prediction.targetPrice) {
                    prediction.status = 'WIN';
                    prediction.actualOutcome = currentPrice;
                    predictionUpdated = true;
                }
                else if (currentPrice <= prediction.stopLoss) {
                    prediction.status = 'LOSS';
                    prediction.actualOutcome = currentPrice;
                    predictionUpdated = true;
                }
            }
            else if (prediction.action === 'SELL') {
                if (currentPrice <= prediction.targetPrice) {
                    prediction.status = 'WIN';
                    prediction.actualOutcome = currentPrice;
                    predictionUpdated = true;
                }
                else if (currentPrice >= prediction.stopLoss) {
                    prediction.status = 'LOSS';
                    prediction.actualOutcome = currentPrice;
                    predictionUpdated = true;
                }
            }
            if (predictionUpdated) {
                updated = true;
                pendingList.splice(i, 1);
            }
        }
        if (updated) {
            this.saveHistory();
        }
    }
    clearHistory() {
        this.history = [];
        this.pendingBySymbol.clear();
        this.saveHistory();
    }
}
exports.PredictionHistoryService = PredictionHistoryService;
exports.predictionService = new PredictionHistoryService();
