import { P2ExecutionEngine } from '../execution/P2ExecutionEngine.js';

/**
 * ML Signal Bridge — converts PPO/TCN signals into executable orders.
 *
 * Supports Buy / Sell / Hold signals with a confidence score, and can emit
 * MARKET, LIMIT, or STOP_LOSS orders depending on the model output.
 */
export class MLSignalBridge {
  constructor(executionEngine) {
    if (!executionEngine || typeof executionEngine.executeP2Order !== 'function') {
      throw new TypeError('MLSignalBridge requires a P2ExecutionEngine instance');
    }
    this.exec = executionEngine;
    this.defaultConfidenceThreshold = 0.6;
  }

  /**
   * Convert a model prediction into a trade order.
   * @param {Object} signal - {action:'BUY'|'SELL'|'HOLD', confidence, regime, type?, price?, stopPrice?}
   * @param {string} symbol
   * @param {number} marketPrice
   * @param {Object} [opts] - {size, confidenceThreshold}
   */
  signalToOrder(signal, symbol, marketPrice, opts = {}) {
    if (!signal || !signal.action) {
      return { success: false, reason: 'Invalid ML signal' };
    }

    const action = signal.action.toUpperCase();
    if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
      return { success: false, reason: `Unknown ML signal action: ${signal.action}` };
    }

    const confidence = Number.isFinite(signal.confidence) ? signal.confidence : 0;
    if (confidence < 0 || confidence > 1) {
      return { success: false, reason: 'Confidence must be between 0 and 1' };
    }

    const threshold = opts.confidenceThreshold ?? this.defaultConfidenceThreshold;
    if (confidence < threshold) {
      return {
        success: false,
        reason: `Signal confidence ${confidence.toFixed(2)} below threshold ${threshold}`,
        action,
        confidence,
      };
    }

    if (action === 'HOLD') {
      return {
        success: false,
        reason: 'HOLD signal — no order generated',
        action,
        confidence,
      };
    }

    const size = opts.size ?? 1;
    if (!Number.isFinite(size) || size <= 0) {
      return { success: false, reason: 'size must be a positive number' };
    }

    const type = signal.type || 'MARKET';
    const order = {
      symbol,
      action,
      qty: size,
      type,
      price: signal.price,
      stopPrice: signal.stopPrice,
    };

    return this.exec.executeP2Order(order, signal, marketPrice);
  }
}
