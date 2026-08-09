/**
 * Process-local order ledger for explicitly submitted paper orders.
 *
 * Empty ledgers stay empty; this module does not generate synthetic orders.
 * The richer P2 OrderStateMachine remains the preferred execution boundary.
 */
const VALID_STATES = new Set(['PENDING', 'FILLED', 'PARTIAL_FILLED', 'CANCELLED', 'REJECTED']);
const VALID_TRANSITIONS = Object.freeze({
  PENDING: new Set(['FILLED', 'PARTIAL_FILLED', 'CANCELLED', 'REJECTED']),
  PARTIAL_FILLED: new Set(['FILLED', 'CANCELLED']),
  FILLED: new Set(),
  CANCELLED: new Set(),
  REJECTED: new Set(),
});

class OrderLedger {
  constructor() {
    this.orders = [];
  }

  getOrders(symbolId = 'SAF1403') {
    return this.orders
      .filter(order => order.symbol === symbolId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(order => ({ ...order }));
  }

  getAllOrders() {
    return this.orders
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(order => ({ ...order }));
  }

  addOrder(order) {
    if (!order || typeof order.id !== 'string' || !order.id) throw new TypeError('order requires a non-empty id');
    if (this.orders.some(existing => existing.id === order.id)) return { ...this.orders.find(existing => existing.id === order.id) };
    if (typeof order.symbol !== 'string' || !/^[A-Z0-9-]{1,64}$/.test(order.symbol)) throw new TypeError('order requires a valid symbol');
    if (!['BUY', 'SELL'].includes(order.side)) throw new TypeError('order side must be BUY or SELL');
    if (!['MARKET', 'LIMIT'].includes(order.type)) throw new TypeError('order type must be MARKET or LIMIT');
    if (!Number.isFinite(order.quantity) || order.quantity <= 0) throw new TypeError('order quantity must be positive');
    if (order.type === 'LIMIT' && (!Number.isFinite(order.price) || order.price <= 0)) throw new TypeError('limit order price must be positive');
    const normalized = {
      ...order,
      filledQuantity: Number.isFinite(order.filledQuantity) ? order.filledQuantity : 0,
      status: order.status || 'PENDING',
      timestamp: Number.isFinite(order.timestamp) ? order.timestamp : Date.now(),
    };
    if (!VALID_STATES.has(normalized.status)) throw new TypeError('order status is invalid');
    this.orders.unshift(normalized);
    return { ...normalized };
  }

  transitionOrder(orderId, newStatus) {
    const order = this.orders.find(candidate => candidate.id === orderId);
    if (!order || !VALID_STATES.has(newStatus) || !VALID_TRANSITIONS[order.status]?.has(newStatus)) return null;
    order.status = newStatus;
    order.updatedAt = Date.now();
    return { ...order };
  }

  clear() {
    this.orders = [];
  }
}

export const orderLedger = new OrderLedger();
