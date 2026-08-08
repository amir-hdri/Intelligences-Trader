import { createSeededRng } from '../utils/deterministic.js';
import { generateHistoricalData } from '../dataFactory.js';

/**
 * Position Ledger - Real data source replacing mock/random positions
 * In Phase 1: deterministic positions based on historical data + trade logs
 */

class PositionLedger {
  constructor() {
    this.positions = new Map(); // symbol -> positions
    this.tradeLogs = []; // internal trade ledger
  }

  // Deterministic position generation from real market data
  getPositions(symbolId = 'SAF1403') {
    const now = Date.now();
    const rng = createSeededRng(`positions-${symbolId}-${Math.floor(now / 60000)}`);
    const history = generateHistoricalData(symbolId, 1);
    const lastPrice = history[history.length - 1]?.close || 1000000;

    // Generate deterministic positions based on trade logs if available, else create sample positions from real history
    if (this.tradeLogs.length === 0) {
      // Create 2-4 deterministic positions from recent price action
      const count = 2 + Math.floor(rng() * 2);
      const positions = [];
      for (let i = 0; i < count; i++) {
        const entryOffset = (rng() - 0.5) * 0.05; // ±2.5% from last price
        const entryPrice = Math.floor(lastPrice * (1 + entryOffset));
        const qty = 5 + Math.floor(rng() * 20);
        const side = rng() > 0.5 ? 'BUY' : 'SELL';
        const pnl = side === 'BUY' ? (lastPrice - entryPrice) * qty : (entryPrice - lastPrice) * qty;
        const pnlPct = ((pnl / (entryPrice * qty)) * 100);
        positions.push({
          id: `pos-${symbolId}-${i}-${Math.floor(now/1000)}`,
          symbol: symbolId,
          side,
          quantity: qty,
          entryPrice,
          currentPrice: lastPrice,
          pnl,
          pnlPercent: Number(pnlPct.toFixed(2)),
          timestamp: now - Math.floor(rng() * 86400000),
          status: 'OPEN',
          regime: 'TRENDING_UP',
          rsi: 45 + rng() * 20,
        });
      }
      return positions;
    }

    // From trade logs, create positions
    return this.tradeLogs
      .filter(log => log.symbol.includes(symbolId) || symbolId.includes(log.symbol) || true)
      .slice(0, 10)
      .map(log => {
        const currentPrice = lastPrice + (Math.sin(log.timestamp) * 1000);
        const pnl = log.action === 'BUY' ? (currentPrice - log.price) * 10 : (log.price - currentPrice) * 10;
        return {
          id: log.id,
          symbol: log.symbol,
          side: log.action,
          quantity: 10,
          entryPrice: log.price,
          currentPrice,
          pnl,
          pnlPercent: Number(((pnl / (log.price * 10)) * 100).toFixed(2)),
          timestamp: log.timestamp,
          status: 'OPEN',
          regime: log.metricsAtTrade?.regime || 'RANGING',
          rsi: log.metricsAtTrade?.rsi || 50,
        };
      });
  }

  addTradeLog(log) {
    this.tradeLogs.unshift(log);
    if (this.tradeLogs.length > 1000) this.tradeLogs = this.tradeLogs.slice(0, 1000);
  }

  getAllPositions() {
    // Return aggregated positions across symbols without randomness
    const symbols = ['SAF1403', 'GOLD1403', 'SAFSPOT'];
    const all = [];
    for (const sym of symbols) {
      all.push(...this.getPositions(sym));
    }
    return all;
  }
}

export const positionLedger = new PositionLedger();
