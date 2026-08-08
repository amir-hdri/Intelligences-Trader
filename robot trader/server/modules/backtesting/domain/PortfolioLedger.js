const EPSILON = 1e-12;

function sign(value) {
  return value > EPSILON ? 1 : value < -EPSILON ? -1 : 0;
}

/** Double-entry-like cash/position ledger. Fills are the only mutation input. */
export class PortfolioLedger {
  constructor(initialCash, baseCurrency = 'IRR') {
    if (!Number.isFinite(initialCash) || initialCash <= 0) throw new TypeError('initialCash must be positive');
    this.initialCash = initialCash;
    this.baseCurrency = baseCurrency;
    this.cash = initialCash;
    this.positions = new Map();
    this.marks = new Map();
    this.fills = [];
    this.closedTrades = [];
    this.equityCurve = [];
    this.realizedGrossPnl = 0;
    this.totalFees = 0;
    this.turnover = 0;
    this.peakEquity = initialCash;
    this.currentDrawdown = 0;
    this._tradeSequence = 0;
  }

  position(instrumentId) {
    const value = this.positions.get(instrumentId);
    return value ? { ...value } : { instrumentId, quantity: 0, averagePrice: 0, openFees: 0 };
  }

  applyFill(fill) {
    if (!fill || !['BUY', 'SELL'].includes(fill.side)) throw new TypeError('Fill side must be BUY or SELL');
    if (!Number.isFinite(fill.quantity) || fill.quantity <= 0 || !Number.isFinite(fill.price) || fill.price <= 0) {
      throw new TypeError('Fill quantity and price must be positive');
    }
    const fee = Number(fill.fee || 0);
    if (!Number.isFinite(fee) || fee < 0) throw new TypeError('Fill fee must be non-negative');
    const notional = fill.quantity * fill.price;
    const cashChange = fill.side === 'BUY' ? -notional - fee : notional - fee;
    const nextCash = this.cash + cashChange;
    if (!Number.isFinite(notional) || !Number.isFinite(nextCash)) throw new Error('Fill would make ledger cash non-finite');

    const old = this.position(fill.instrumentId);
    const delta = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    const oldSign = sign(old.quantity);
    const deltaSign = sign(delta);
    const closingQuantity = oldSign !== 0 && oldSign !== deltaSign
      ? Math.min(Math.abs(old.quantity), Math.abs(delta))
      : 0;
    const openingQuantity = Math.max(0, Math.abs(delta) - closingQuantity);
    const newQuantity = old.quantity + delta;

    let realizedGross = 0;
    let allocatedEntryFee = 0;
    let allocatedExitFee = 0;
    let closedTrade = null;
    if (closingQuantity > 0) {
      realizedGross = (fill.price - old.averagePrice) * closingQuantity * oldSign;
      allocatedEntryFee = old.openFees * (closingQuantity / Math.abs(old.quantity));
      allocatedExitFee = fee * (closingQuantity / fill.quantity);
      this.realizedGrossPnl += realizedGross;
      this._tradeSequence += 1;
      closedTrade = {
        id: `trade-${this._tradeSequence}`,
        instrumentId: fill.instrumentId,
        side: oldSign > 0 ? 'LONG' : 'SHORT',
        quantity: closingQuantity,
        entryPrice: old.averagePrice,
        exitPrice: fill.price,
        openedAt: old.openedAt,
        closedAt: fill.timestamp,
        grossPnl: realizedGross,
        fees: allocatedEntryFee + allocatedExitFee,
        netPnl: realizedGross - allocatedEntryFee - allocatedExitFee,
        isWin: realizedGross - allocatedEntryFee - allocatedExitFee > EPSILON,
        regime: fill.regime,
        exitReason: fill.reason || 'SIGNAL',
      };
      this.closedTrades.push(closedTrade);
    }

    const remainingOldFees = Math.max(0, old.openFees - allocatedEntryFee);
    const openingFee = fee * (openingQuantity / fill.quantity);
    let next;
    if (Math.abs(newQuantity) <= EPSILON) {
      next = { instrumentId: fill.instrumentId, quantity: 0, averagePrice: 0, openFees: 0, openedAt: null };
    } else if (oldSign === 0 || oldSign === deltaSign) {
      const oldNotionalUnits = Math.abs(old.quantity);
      const addedUnits = Math.abs(delta);
      next = {
        instrumentId: fill.instrumentId,
        quantity: newQuantity,
        averagePrice: (old.averagePrice * oldNotionalUnits + fill.price * addedUnits) / (oldNotionalUnits + addedUnits),
        openFees: old.openFees + fee,
        openedAt: old.openedAt ?? fill.timestamp,
      };
    } else if (sign(newQuantity) === oldSign) {
      next = {
        instrumentId: fill.instrumentId,
        quantity: newQuantity,
        averagePrice: old.averagePrice,
        openFees: remainingOldFees,
        openedAt: old.openedAt,
      };
    } else {
      next = {
        instrumentId: fill.instrumentId,
        quantity: newQuantity,
        averagePrice: fill.price,
        openFees: openingFee,
        openedAt: fill.timestamp,
      };
    }

    this.cash = nextCash;
    this.totalFees += fee;
    this.turnover += fill.quantity * fill.price;
    this.positions.set(fill.instrumentId, next);
    this.marks.set(fill.instrumentId, fill.price);
    this.fills.push({ ...fill });
    return closedTrade;
  }

  mark(instrumentId, price) {
    if (!Number.isFinite(price) || price <= 0) throw new TypeError('Mark price must be positive');
    this.marks.set(instrumentId, price);
  }

  equity() {
    let positionsValue = 0;
    for (const [instrumentId, position] of this.positions) {
      if (Math.abs(position.quantity) <= EPSILON) continue;
      const mark = this.marks.get(instrumentId);
      if (!Number.isFinite(mark)) throw new Error(`Missing mark for open position ${instrumentId}`);
      const markedValue = position.quantity * mark;
      if (!Number.isFinite(markedValue)) throw new Error(`Non-finite marked position value for ${instrumentId}`);
      positionsValue += markedValue;
    }
    const equity = this.cash + positionsValue;
    if (!Number.isFinite(equity)) throw new Error('Ledger equity is non-finite');
    return equity;
  }

  grossExposure() {
    let exposure = 0;
    for (const [instrumentId, position] of this.positions) {
      const mark = this.marks.get(instrumentId) ?? position.averagePrice;
      const notional = Math.abs(position.quantity * mark);
      if (!Number.isFinite(notional)) throw new Error(`Non-finite exposure for ${instrumentId}`);
      exposure += notional;
    }
    if (!Number.isFinite(exposure)) throw new Error('Portfolio exposure is non-finite');
    return exposure;
  }

  snapshot(timestamp, regime = null) {
    const equity = this.equity();
    this.peakEquity = Math.max(this.peakEquity, equity);
    this.currentDrawdown = this.peakEquity > 0 ? (this.peakEquity - equity) / this.peakEquity : 0;
    const point = {
      timestamp,
      cash: this.cash,
      positionsValue: equity - this.cash,
      equity,
      drawdown: this.currentDrawdown,
      grossExposure: this.grossExposure(),
      regime,
    };
    const previous = this.equityCurve[this.equityCurve.length - 1];
    if (previous && previous.timestamp === timestamp) this.equityCurve[this.equityCurve.length - 1] = point;
    else this.equityCurve.push(point);
    return { ...point };
  }

  portfolioSnapshot() {
    return {
      cash: this.cash,
      equity: this.equity(),
      grossExposure: this.grossExposure(),
      drawdown: this.currentDrawdown,
      positions: [...this.positions.values()].map(position => ({ ...position })),
    };
  }
}
