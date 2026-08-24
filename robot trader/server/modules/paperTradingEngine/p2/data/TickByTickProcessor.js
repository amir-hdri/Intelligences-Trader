/**
 * Tick-by-Tick Processor for high-frequency paper trading
 */
export class TickByTickProcessor {
  constructor() {
    this.ticks = [];
  }

  addTick(tick) {
    // Fault tolerance: reject malformed ticks outright — a single NaN price or
    // negative volume would poison every downstream VWAP computation.
    if (!tick || !Number.isFinite(tick.price) || tick.price <= 0) return;
    const volume = Number.isFinite(tick.volume) && tick.volume >= 0 ? tick.volume : 0;
    this.ticks.push({
      ts: Number.isFinite(tick.timestamp) ? tick.timestamp : Date.now(),
      price: tick.price,
      volume,
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
