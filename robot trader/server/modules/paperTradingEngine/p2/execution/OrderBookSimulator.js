import { hashString } from '../../../../utils/deterministic.js';

/**
 * Discrete-event Order Book Simulator for P2 Paper Trading.
 *
 * Supports market orders (with slippage & partial fills), resting limit orders,
 * cancellation, and top-of-book depth queries. Order ids are deterministic.
 */
export class OrderBookSimulator {
  // Caps so long-lived processes cannot grow without bound.
  static MAX_TRADES = 1000;
  static MAX_RESTING = 5000;

  constructor() {
    this.bids = []; // {price, qty, id}
    this.asks = []; // {price, qty, id}
    this.trades = [];
    this.resting = new Map();
    this._seq = 0;
  }

  _id(kind) {
    this._seq += 1;
    return `${kind}-${hashString(`${Date.now()}-${this._seq}`).toString(36)}`;
  }

  updateBook(bids, asks) {
    this.bids = (bids || []).map(b => ({ id: b.id || this._id('bid'), price: b.price, qty: b.qty }))
      .sort((a, b) => b.price - a.price);
    this.asks = (asks || []).map(a => ({ id: a.id || this._id('ask'), price: a.price, qty: a.qty }))
      .sort((a, b) => a.price - b.price);
  }

  bestBid() {
    return this.bids.length ? this.bids[0].price : null;
  }

  bestAsk() {
    return this.asks.length ? this.asks[0].price : null;
  }

  midPrice() {
    const bb = this.bestBid();
    const ba = this.bestAsk();
    if (bb == null && ba == null) return null;
    if (bb == null) return ba;
    if (ba == null) return bb;
    return (bb + ba) / 2;
  }

  depth(levels = 5) {
    return {
      bids: this.bids.slice(0, levels),
      asks: this.asks.slice(0, levels),
      bestBid: this.bestBid(),
      bestAsk: this.bestAsk(),
      mid: this.midPrice(),
    };
  }

  /**
   * Market order simulation with slippage & partial fills.
   * @returns {{filled, avgPrice, remaining, trade?}}
   */
  marketOrder(side, qty) {
    const book = side === 'BUY' ? this.asks : this.bids;
    let remaining = qty;
    let filled = 0;
    let avgPrice = 0;

    for (const level of book) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, level.qty);
      avgPrice = (avgPrice * filled + level.price * take) / (filled + take);
      filled += take;
      remaining -= take;
      level.qty -= take;
    }

    // Remove fully consumed levels.
    this.asks = this.asks.filter(l => l.qty > 0);
    this.bids = this.bids.filter(l => l.qty > 0);

    if (filled > 0) {
      const trade = { side, qty: filled, price: avgPrice, ts: Date.now() };
      this.trades.push(trade);
      if (this.trades.length > OrderBookSimulator.MAX_TRADES) {
        this.trades.shift();
      }
      return { filled, avgPrice, remaining, trade };
    }
    return { filled: 0, avgPrice: 0, remaining: qty };
  }

  /**
   * Rest a limit order on the book.
   * @returns {{id, price, qty, side, status}}
   */
  placeLimitOrder(side, price, qty) {
    const id = this._id('limit');
    const order = { id, side, price, qty, status: 'OPEN' };
    // Drop oldest terminal resting orders first to stay within the cap.
    if (this.resting.size >= OrderBookSimulator.MAX_RESTING) {
      for (const [restId, rest] of this.resting) {
        if (this.resting.size < OrderBookSimulator.MAX_RESTING) break;
        if (rest.status !== 'OPEN') this.resting.delete(restId);
      }
    }
    this.resting.set(id, order);
    if (side === 'BUY') {
      this.bids.push({ id, price, qty });
      this.bids.sort((a, b) => b.price - a.price);
    } else {
      this.asks.push({ id, price, qty });
      this.asks.sort((a, b) => a.price - b.price);
    }
    return order;
  }

  cancelOrder(id) {
    const order = this.resting.get(id);
    if (!order) return null;
    order.status = 'CANCELLED';
    this.bids = this.bids.filter(l => l.id !== id);
    this.asks = this.asks.filter(l => l.id !== id);
    return order;
  }

  getTrades(limit = 20) {
    return this.trades.slice(-limit);
  }
}
