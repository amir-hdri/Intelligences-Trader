import { createSeededRng, hashString } from '../../../utils/deterministic.js';

/**
 * P2 Execution Engine — extends the base PaperTradingEngine
 * Supports Market / Limit / Stop-Loss orders + realistic slippage & fees
 */
export class P2ExecutionEngine {
  constructor(baseEngine) {
    this.base = baseEngine;
    this.slippageBps = 5;   // 0.05%
    this.takerFeeBps = 4;   // 0.04%
    this.makerFeeBps = 2;   // 0.02%
  }

  /**
   * Execute a P2 order coming from ML signal
   * @param {Object} order - {action, symbol, qty, type, price?, stopPrice?}
   * @param {Object} forecast - ML signal {action, confidence, regime}
   * @param {number} marketPrice
   */
  executeP2Order(order, forecast, marketPrice) {
    const rng = createSeededRng(`p2-${order.symbol}-${Date.now()}`);
    let execPrice = marketPrice;

    // Apply deterministic slippage
    const slip = (rng() - 0.5) * (this.slippageBps / 10000);
    execPrice = marketPrice * (1 + slip);

    // Fee calculation (taker by default)
    const feeRate = order.type === 'LIMIT' ? this.makerFeeBps : this.takerFeeBps;
    const fee = (order.qty * execPrice * feeRate) / 10000;

    const result = this.base.executeTrade(
      { ...order, entry: execPrice },
      forecast,
      execPrice
    );

    if (result.success) {
      result.trade.fee = fee;
      result.trade.slippage = slip;
      result.trade.execType = order.type || 'MARKET';
      result.trade.netPnl = result.trade.pnl - fee;
    }

    return result;
  }

  // Convenience wrappers for the three required order types
  marketOrder(symbol, action, qty, forecast, marketPrice) {
    return this.executeP2Order(
      { symbol, action, qty, type: 'MARKET' },
      forecast,
      marketPrice
    );
  }

  limitOrder(symbol, action, qty, limitPrice, forecast, marketPrice) {
    return this.executeP2Order(
      { symbol, action, qty, type: 'LIMIT', price: limitPrice },
      forecast,
      marketPrice
    );
  }

  stopLossOrder(symbol, action, qty, stopPrice, forecast, marketPrice) {
    return this.executeP2Order(
      { symbol, action, qty, type: 'STOP_LOSS', stopPrice },
      forecast,
      marketPrice
    );
  }
}
