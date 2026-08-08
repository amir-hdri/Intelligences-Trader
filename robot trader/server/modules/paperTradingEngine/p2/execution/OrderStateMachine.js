/**
 * Full Order State Machine for P2 (Open → Filled → Cancelled)
 */
export const ORDER_STATES = {
  OPEN: 'OPEN',
  PARTIAL_FILLED: 'PARTIAL_FILLED',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

export class OrderStateMachine {
  constructor() {
    this.orders = new Map();
  }

  createOrder(order) {
    const id = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  updateStatus(orderId, newStatus) {
    const order = this.orders.get(orderId);
    if (!order) return null;

    const valid = {
      [ORDER_STATES.OPEN]: [ORDER_STATES.PARTIAL_FILLED, ORDER_STATES.FILLED, ORDER_STATES.CANCELLED, ORDER_STATES.REJECTED],
      [ORDER_STATES.PARTIAL_FILLED]: [ORDER_STATES.FILLED, ORDER_STATES.CANCELLED],
      [ORDER_STATES.FILLED]: [],
      [ORDER_STATES.CANCELLED]: [],
      [ORDER_STATES.REJECTED]: [],
    };

    if (valid[order.status].includes(newStatus)) {
      order.status = newStatus;
      order.updatedAt = Date.now();
      return order;
    }
    return null;
  }

  getOrder(orderId) {
    return this.orders.get(orderId) || null;
  }

  getAllOrders() {
    return Array.from(this.orders.values());
  }
}
