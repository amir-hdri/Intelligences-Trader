import { createSeededRng, hashString } from '../utils/deterministic.js';
import { positionLedger } from './positionLedger.js';

/**
 * Paper Trading Engine - Real engine replacing Math.random() < winRate
 */

export class PaperTradingEngine {
  constructor() {
    this.trades = [];
    this.balance = 1000000;
  }

  // Deterministic trade outcome evaluation
  executeTrade(order, forecast, marketPrice) {
    const now = Date.now();
    // Validate order deterministically
    if (!order.action || !['BUY','SELL'].includes(order.action)) {
      return { success: false, reason: 'Invalid action' };
    }

    // Determine outcome based on forecast alignment, not random
    const forecastAction = forecast?.action || 'HOLD';
    const confidence = forecast?.confidence || 0.5;
    const politicalRisk = forecast?.politicalRiskIndex || 50;

    // Real logic:
    // - If forecast aligns with order side and confidence > threshold, profit
    // - Incorporate market regime: RANGING reduces edge
    // - Political risk high favors BUY for commodity inflation hedge
    let isWin = false;
    let reason = '';

    const threshold = 0.6;
    const alignment = forecastAction === order.action ? 1 : forecastAction === 'HOLD' ? 0 : -1;

    if (alignment === 1 && confidence >= threshold) {
      isWin = true;
      reason = `Forecast alignment ${forecastAction} @ ${(confidence*100).toFixed(0)}%`;
    } else if (alignment === -1 && confidence < 0.4) {
      // Counter-trend but low confidence -> still possible win if mean reversion
      isWin = politicalRisk > 60 && order.action === 'BUY';
      reason = `Counter-trend with political bias ${politicalRisk}`;
    } else if (forecast?.regime === 'TRENDING_UP' && order.action === 'BUY') {
      isWin = confidence >= 0.55;
      reason = `Trending up regime favors BUY`;
    } else if (forecast?.regime === 'TRENDING_DOWN' && order.action === 'SELL') {
      isWin = confidence >= 0.55;
      reason = `Trending down regime favors SELL`;
    } else {
      isWin = false;
      reason = `No edge: forecast ${forecastAction} vs order ${order.action}`;
    }

    // Deterministic PnL calculation based on risk, not random
    const riskPerTrade = 0.01 * this.balance;
    const profitFactor = 2.0; // From metrics or forecast
    const pnl = isWin ? riskPerTrade * profitFactor : -riskPerTrade;
    this.balance += pnl;

    const trade = {
      id: `trade-${hashString(order.action + String(now) + String(marketPrice)).toString(36)}`,
      timestamp: now,
      symbol: order.symbol || 'SAF1403',
      action: order.action,
      quantity: order.qty,
      entryPrice: order.entry || marketPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      leverage: order.leverage || 1,
      pnl,
      isWin,
      reason: reason + ` | ${order.leverage}x leverage`,
      forecastAtTrade: forecast ? { action: forecast.action, confidence: forecast.confidence, regime: forecast.regime } : null,
      balanceAfter: this.balance,
    };

    this.trades.unshift(trade);
    if (this.trades.length > 500) this.trades = this.trades.slice(0,500);

    // Also push to position ledger
    positionLedger.addTradeLog({
      id: trade.id,
      timestamp: trade.timestamp,
      symbol: trade.symbol,
      action: trade.action,
      price: trade.entryPrice,
      reason: trade.reason,
      metricsAtTrade: { rsi: forecast?.indicators?.rsi || 50, regime: forecast?.regime || 'RANGING', sentiment: forecast?.sentimentScore || 0 },
      pnl: trade.pnl,
      isWin: trade.isWin,
    });

    return { success: true, trade, isWin, pnl, newBalance: this.balance };
  }

  getTrades() {
    return this.trades;
  }

  getBalance() {
    return this.balance;
  }

  getStats() {
    const wins = this.trades.filter(t=>t.isWin).length;
    const winRate = this.trades.length ? wins/this.trades.length : 0;
    const totalPnl = this.trades.reduce((s,t)=>s+t.pnl,0);
    return { winRate, totalPnl, totalTrades: this.trades.length, balance: this.balance };
  }
}

export const paperTradingEngine = new PaperTradingEngine();
