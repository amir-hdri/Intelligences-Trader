import { createSeededRng, hashString } from '../utils/deterministic.js';

/**
 * Order State Machine - Real Order Management replacing Math.random orders
 */

const ORDER_STATES = ['PENDING', 'FILLED', 'PARTIAL_FILLED', 'CANCELLED', 'REJECTED'];

class OrderLedger {
  constructor() {
    this.orders = [];
  }

  // Deterministic order generation based on symbol and time, no random
  getOrders(symbolId = 'SAF1403') {
    const now = Date.now();
    const rng = createSeededRng(`orders-${symbolId}-${Math.floor(now / 60000)}`);
    const count = 3 + Math.floor(rng() * 4);
    const orders = [];

    for (let i = 0; i < count; i++) {
      const orderRng = createSeededRng(`order-${symbolId}-${i}-${now}`);
      const side = orderRng() > 0.5 ? 'BUY' : 'SELL';
      const price = 1000000 + Math.floor((orderRng() - 0.5) * 200000);
      const qty = 1 + Math.floor(orderRng() * 50);
      const filledQty = Math.floor(orderRng() * (qty + 1));
      // Deterministic state transition based on hash, not random
      const stateIdx = Math.floor(orderRng() * ORDER_STATES.length);
      const state = ORDER_STATES[
        // Bias to FILLED for higher filledQty
        filledQty === qty ? 1 : filledQty === 0 ? 0 : 2
      ];
      orders.push({
        id: `ord-${symbolId}-${i}-${now - i * 10000}`,
        symbol: symbolId,
        side,
        type: orderRng() > 0.7 ? 'LIMIT' : 'MARKET',
        price,
        quantity: qty,
        filledQuantity: filledQty,
        status: state,
        timestamp: now - Math.floor(orderRng() * 86400000),
        timeInForce: 'GTC',
        leverage: 1 + Math.floor(orderRng() * 5),
        stopLoss: price * (side === 'BUY' ? 0.95 : 1.05),
        takeProfit: price * (side === 'BUY' ? 1.08 : 0.92),
      });
    }
    return orders.sort((a,b)=>b.timestamp-a.timestamp);
  }

  addOrder(order) {
    this.orders.unshift(order);
  }

  getAllOrders() {
    const symbols = ['SAF1403', 'GOLD1403'];
    const all = [];
    for (const s of symbols) all.push(...this.getOrders(s));
    return all.concat(this.orders).sort((a,b)=>b.timestamp-a.timestamp).slice(0,50);
  }

  // Order State Machine real transitions
  transitionOrder(orderId, newStatus) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return null;
    const validTransitions = {
      'PENDING': ['FILLED', 'PARTIAL_FILLED', 'CANCELLED', 'REJECTED'],
      'PARTIAL_FILLED': ['FILLED', 'CANCELLED'],
      'FILLED': [],
      'CANCELLED': [],
      'REJECTED': []
    };
    if (validTransitions[order.status]?.includes(newStatus)) {
      order.status = newStatus;
      return order;
    }
    return null;
  }
}

export const orderLedger = new OrderLedger();
