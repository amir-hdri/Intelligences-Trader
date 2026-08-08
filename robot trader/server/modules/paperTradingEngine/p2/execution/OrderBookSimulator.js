/**
 * Simple discrete-event Order Book Simulator for P2 Paper Trading
 */
export class OrderBookSimulator {
  constructor() {
    this.bids = []; // {price, qty}
    this.asks = [];
    this.trades = [];
  }

  updateBook(bids, asks) {
    this.bids = bids.sort((a, b) => b.price - a.price);
    this.asks = asks.sort((a, b) => a.price - b.price);
  }

  // Market order simulation with slippage & partial fills
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

    if (filled > 0) {
      this.trades.push({ side, qty: filled, price: avgPrice, ts: Date.now() });
    }

    return { filled, avgPrice, remaining };
  }
}
