/**
 * In-memory paper-position ledger.
 *
 * This boundary intentionally returns only positions explicitly recorded by an
 * execution workflow.  It never invents sample positions when the ledger is
 * empty.  Production deployments should replace this process-local adapter
 * with a durable, transactional repository before enabling multi-replica
 * paper trading.
 */
class PositionLedger {
  constructor() {
    this.positions = new Map();
  }

  getPositions(symbolId = 'SAF1403') {
    return [...this.positions.values()]
      .filter(position => position.symbol === symbolId && position.status === 'OPEN')
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(position => ({ ...position }));
  }

  getAllPositions() {
    return [...this.positions.values()]
      .filter(position => position.status === 'OPEN')
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(position => ({ ...position }));
  }

  upsertPosition(position) {
    if (!position || typeof position.id !== 'string' || !position.id) {
      throw new TypeError('position requires a non-empty id');
    }
    if (typeof position.symbol !== 'string' || !/^[A-Z0-9-]{1,64}$/.test(position.symbol)) {
      throw new TypeError('position requires a valid symbol');
    }
    if (!['BUY', 'SELL'].includes(position.side)) {
      throw new TypeError('position side must be BUY or SELL');
    }
    for (const field of ['quantity', 'entryPrice', 'currentPrice']) {
      if (!Number.isFinite(position[field]) || position[field] <= 0) {
        throw new TypeError(`position ${field} must be a positive finite number`);
      }
    }
    const normalized = {
      ...position,
      timestamp: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
      status: position.status || 'OPEN',
    };
    this.positions.set(normalized.id, normalized);
    return { ...normalized };
  }

  closePosition(id, currentPrice) {
    const position = this.positions.get(id);
    if (!position) return null;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new TypeError('currentPrice must be a positive finite number');
    }
    const direction = position.side === 'BUY' ? 1 : -1;
    const pnl = direction * (currentPrice - position.entryPrice) * position.quantity;
    const closed = {
      ...position,
      currentPrice,
      pnl,
      pnlPercent: (pnl / (position.entryPrice * position.quantity)) * 100,
      status: 'CLOSED',
      closedAt: Date.now(),
    };
    this.positions.set(id, closed);
    return { ...closed };
  }

  clear() {
    this.positions.clear();
  }
}

export const positionLedger = new PositionLedger();
