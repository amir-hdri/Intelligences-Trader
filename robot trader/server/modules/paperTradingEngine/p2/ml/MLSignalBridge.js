/**
 * ML Signal Bridge — converts PPO/TCN signals into executable orders
 */
export class MLSignalBridge {
  constructor(executionEngine) {
    this.exec = executionEngine;
  }

  /**
   * Convert a model prediction into a trade order
   * @param {Object} signal - {action:'BUY'|'SELL', confidence, regime}
   * @param {string} symbol
   * @param {number} marketPrice
   * @param {number} [size=1]
   */
  signalToOrder(signal, symbol, marketPrice, size = 1) {
    if (!signal || !['BUY', 'SELL'].includes(signal.action)) {
      return { success: false, reason: 'Invalid ML signal' };
    }

    const order = {
      symbol,
      action: signal.action,
      qty: size,
      type: 'MARKET',
    };

    return this.exec.marketOrder(
      order.symbol,
      order.action,
      order.qty,
      signal,
      marketPrice
    );
  }
}
