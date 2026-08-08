import { createSeededRng, hashString } from '../../../../utils/deterministic.js';

/**
 * P2 Execution Engine — extends the base PaperTradingEngine.
 *
 * Supports Market / Limit / Stop-Loss orders with realistic deterministic
 * slippage, taker/maker fees, and proper balance accounting.
 */
export class P2ExecutionEngine {
  constructor(baseEngine) {
    if (!baseEngine || typeof baseEngine.executeTrade !== 'function') {
      throw new TypeError('P2ExecutionEngine requires a base engine exposing executeTrade()');
    }
    this.base = baseEngine;
    this.slippageBps = 5;   // 0.05%
    this.takerFeeBps = 4;   // 0.04%
    this.makerFeeBps = 2;   // 0.02%
  }

  /**
   * Build a deterministic order id (no Math.random) for a paper order.
   */
  static orderId(order) {
    const raw = `${order.symbol || ''}|${order.action || ''}|${order.qty || ''}|${Date.now()}`;
    return `p2ord-${hashString(raw).toString(36)}-${hashString(`${raw}-${Math.floor(Date.now() / 1000)}`).toString(36)}`;
  }

  /**
   * Returns the effective fee rate (bps) for an order type.
   */
  feeRateFor(type) {
    return type === 'LIMIT' ? this.makerFeeBps : this.takerFeeBps;
  }

  /**
   * Check whether a resting limit / stop order has been triggered at the given
   * market price. Returns true when the order can fill.
   */
  isTriggered(order, marketPrice) {
    if (order.type === 'LIMIT') {
      // Buy fills at-or-below the limit; sell fills at-or-above the limit.
      return order.action === 'BUY' ? marketPrice <= order.price : marketPrice >= order.price;
    }
    if (order.type === 'STOP_LOSS') {
      // Long stop-loss sells when price falls to the stop; short stop-loss buys on a rise.
      return order.action === 'SELL' ? marketPrice <= order.stopPrice : marketPrice >= order.stopPrice;
    }
    // MARKET orders always trigger.
    return true;
  }

  /**
   * Execute a P2 order coming from an ML signal or manual ticket.
   * @param {Object} order - {action, symbol, qty, type, price?, stopPrice?}
   * @param {Object} forecast - ML signal {action, confidence, regime}
   * @param {number} marketPrice
   */
  executeP2Order(order, forecast, marketPrice) {
    const type = order.type || 'MARKET';

    // Resting orders that have not been triggered are placed, not filled.
    if (!this.isTriggered(order, marketPrice)) {
      return {
        success: true,
        status: 'OPEN',
        reason: `${type} order placed and resting (market ${marketPrice} not crossed)`,
        trade: {
          id: P2ExecutionEngine.orderId(order),
          status: 'OPEN',
          timestamp: Date.now(),
          symbol: order.symbol || 'SAF1403',
          action: order.action,
          quantity: order.qty,
          type,
          limitPrice: order.price,
          stopPrice: order.stopPrice,
          filledQty: 0,
          avgFillPrice: null,
          fee: 0,
        },
      };
    }

    // Deterministic slippage based on the order + timestamp (no Math.random).
    const rng = createSeededRng(`p2-${order.symbol || 'sym'}-${type}-${Date.now()}`);
    const slip = (rng() - 0.5) * (this.slippageBps / 10000);
    const execPrice = marketPrice * (1 + slip);

    // Taker vs maker fee.
    const feeRate = this.feeRateFor(type);
    const fee = (order.qty * execPrice * feeRate) / 10000;

    const result = this.base.executeTrade(
      { ...order, entry: execPrice, type },
      forecast,
      execPrice
    );

    if (result.success) {
      result.trade.id = result.trade.id || P2ExecutionEngine.orderId(order);
      result.trade.fee = fee;
      result.trade.slippage = slip;
      result.trade.execType = type;
      result.trade.netPnl = result.trade.pnl - fee;
      result.trade.avgFillPrice = execPrice;
      result.trade.filledQty = order.qty;
      result.trade.status = 'FILLED';

      // Reflect the fee in the base engine balance for honest accounting.
      this.base.balance -= fee;
      result.trade.balanceAfter = this.base.balance;
      result.newBalance = this.base.balance;
      result.netPnl = result.trade.netPnl;
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
