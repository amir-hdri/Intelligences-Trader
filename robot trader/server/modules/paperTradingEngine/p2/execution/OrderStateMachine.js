import { hashString } from '../../../../utils/deterministic.js';

/**
 * Full Order State Machine for P2.
 *
 * OPEN → PARTIAL_FILLED → FILLED / CANCELLED / REJECTED
 * Supports idempotent create, transition validation, cancel, and lookup.
 */
export const ORDER_STATES = {
  OPEN: 'OPEN',
  PARTIAL_FILLED: 'PARTIAL_FILLED',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

const VALID_TRANSITIONS = {
  [ORDER_STATES.OPEN]: [ORDER_STATES.PARTIAL_FILLED, ORDER_STATES.FILLED, ORDER_STATES.CANCELLED, ORDER_STATES.REJECTED],
  [ORDER_STATES.PARTIAL_FILLED]: [ORDER_STATES.FILLED, ORDER_STATES.CANCELLED],
  [ORDER_STATES.FILLED]: [],
  [ORDER_STATES.CANCELLED]: [],
  [ORDER_STATES.REJECTED]: [],
};

export class OrderStateMachine {
  constructor() {
    this.orders = new Map();
    this._seq = 0;
  }

  /**
   * Deterministic order id built from clientOrderId (or symbol/time), never Math.random.
   */
  _buildId(order) {
    if (order.clientOrderId) return `ord-${order.clientOrderId}`;
    this._seq += 1;
    const raw = `${order.symbol || 'sym'}|${order.action || ''}|${order.qty || ''}|${Date.now()}|${this._seq}`;
    return `ord-${hashString(raw).toString(36)}`;
  }

  /**
   * Create a new order. If clientOrderId is supplied and already exists, the
   * existing order is returned (idempotent create).
   */
  createOrder(order) {
    const id = this._buildId(order);
    const existing = this.orders.get(id);
    if (existing) return existing;

    const fullOrder = {
      id,
      ...order,
      status: ORDER_STATES.OPEN,
      filledQty: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.orders.set(id, fullOrder);
    return fullOrder;
  }

  /**
   * Transition an order to a new status, enforcing valid transitions.
   */
  updateStatus(orderId, newStatus) {
    const order = this.orders.get(orderId);
    if (!order) return null;
    if (!VALID_TRANSITIONS[order.status] || !VALID_TRANSITIONS[order.status].includes(newStatus)) {
      return null;
    }
    order.status = newStatus;
    order.updatedAt = Date.now();
    return order;
  }

  /**
   * Record a partial fill on an order (only valid while open/partial).
   */
  recordFill(orderId, filledQty, fillPrice) {
    const order = this.orders.get(orderId);
    if (!order) return null;
    if (![ORDER_STATES.OPEN, ORDER_STATES.PARTIAL_FILLED].includes(order.status)) return null;
    if (!Number.isFinite(filledQty) || filledQty < 0) return null;

    order.filledQty = Math.min((order.filledQty || 0) + filledQty, order.qty || 0);
    order.lastFillPrice = fillPrice;
    order.updatedAt = Date.now();

    const remaining = (order.qty || 0) - order.filledQty;
    const nextStatus = remaining <= 0 ? ORDER_STATES.FILLED : ORDER_STATES.PARTIAL_FILLED;
    return this.updateStatus(orderId, nextStatus) || order;
  }

  /**
   * Cancel an open or partially-filled order.
   */
  cancelOrder(orderId) {
    return this.updateStatus(orderId, ORDER_STATES.CANCELLED);
  }

  getOrder(orderId) {
    return this.orders.get(orderId) || null;
  }

  getAllOrders() {
    return Array.from(this.orders.values());
  }

  reset() {
    this.orders.clear();
    this._seq = 0;
  }
}
