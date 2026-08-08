/**
 * Tick-by-Tick Processor for high-frequency paper trading
 */
export class TickByTickProcessor {
  constructor() {
    this.ticks = [];
  }

  addTick(tick) {
    this.ticks.push({
      ts: tick.timestamp || Date.now(),
      price: tick.price,
      volume: tick.volume || 0,
      side: tick.side || 'unknown',
    });
    if (this.ticks.length > 10000) this.ticks.shift();
  }

  getRecentTicks(count = 100) {
    return this.ticks.slice(-count);
  }

  getVWAP() {
    if (!this.ticks.length) return 0;
    const totalVol = this.ticks.reduce((s, t) => s + t.volume, 0);
    const weighted = this.ticks.reduce((s, t) => s + t.price * t.volume, 0);
    return totalVol ? weighted / totalVol : this.ticks[this.ticks.length - 1].price;
  }
}
