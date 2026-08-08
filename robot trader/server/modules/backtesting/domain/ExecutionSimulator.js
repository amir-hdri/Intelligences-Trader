const EPSILON = 1e-12;

function copyBook(book) {
  if (!book) return null;
  return {
    bids: book.bids.map(level => ({ ...level })),
    asks: book.asks.map(level => ({ ...level })),
  };
}

/** Deterministic bar/order-book execution model with partial fills and costs. */
export class ExecutionSimulator {
  constructor(config, scenarioModifiers = {}) {
    this.config = {
      ...config,
      makerFeeBps: config.makerFeeBps ?? config.commissionBps ?? 0,
      takerFeeBps: config.takerFeeBps ?? config.commissionBps ?? 0,
      volumeImpactCoefficient: config.volumeImpactCoefficient ?? 0,
    };
    this.scenarioModifiers = scenarioModifiers;
    this.orders = [];
    this.orderEvents = [];
    this.fills = [];
    this.pending = [];
    this._orderSequence = 0;
    this._fillSequence = 0;
    this._eventSequence = 0;
  }

  submit(intent) {
    if (!intent || !['BUY', 'SELL'].includes(intent.side)) throw new TypeError('Order side must be BUY or SELL');
    if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) throw new TypeError('Order quantity must be positive');
    const type = intent.type || 'MARKET';
    if (!['MARKET', 'LIMIT', 'STOP'].includes(type)) throw new TypeError(`Unsupported order type: ${type}`);
    if (type === 'LIMIT' && (!Number.isFinite(intent.limitPrice) || intent.limitPrice <= 0)) throw new TypeError('LIMIT order requires limitPrice');
    if (type === 'STOP' && (!Number.isFinite(intent.stopPrice) || intent.stopPrice <= 0)) throw new TypeError('STOP order requires stopPrice');

    this._orderSequence += 1;
    const order = {
      id: `order-${this._orderSequence}`,
      instrumentId: intent.instrumentId,
      side: intent.side,
      type,
      quantity: intent.quantity,
      filledQuantity: 0,
      remainingQuantity: intent.quantity,
      averageFillPrice: null,
      limitPrice: intent.limitPrice ?? null,
      stopPrice: intent.stopPrice ?? null,
      submittedAt: intent.submittedAt,
      eligibleAt: intent.submittedAt + this.config.latencyMs,
      status: 'OPEN',
      reason: intent.reason || 'STRATEGY',
      signal: intent.signal || null,
      resized: intent.resized === true,
      forceFill: intent.forceFill === true,
    };
    this.orders.push(order);
    this.pending.push(order);
    this._recordOrderEvent(order, 'OPEN', intent.submittedAt);
    return order;
  }

  _recordOrderEvent(order, status, timestamp, details = {}) {
    this._eventSequence += 1;
    this.orderEvents.push({ sequence: this._eventSequence, orderId: order.id, status, timestamp, ...details });
  }

  _barTriggerAndPrice(order, bar) {
    if (order.type === 'MARKET') return { triggered: true, price: bar.open, maker: false };
    if (order.type === 'LIMIT') {
      const triggered = order.side === 'BUY' ? bar.low <= order.limitPrice : bar.high >= order.limitPrice;
      if (!triggered) return { triggered: false };
      return {
        triggered: true,
        price: order.side === 'BUY' ? Math.min(bar.open, order.limitPrice) : Math.max(bar.open, order.limitPrice),
        maker: true,
      };
    }
    const triggered = order.side === 'BUY' ? bar.high >= order.stopPrice : bar.low <= order.stopPrice;
    if (!triggered) return { triggered: false };
    return {
      triggered: true,
      price: order.side === 'BUY' ? Math.max(bar.open, order.stopPrice) : Math.min(bar.open, order.stopPrice),
      maker: false,
    };
  }

  _slippageBps(order, quantity, barAvailableQuantity) {
    if (order.type === 'LIMIT') return 0;
    const spreadMultiplier = this.scenarioModifiers.spreadMultiplier || 1;
    if (this.config.slippageModel === 'BOOK_WALK') return 0;
    if (this.config.slippageModel === 'VOLUME_IMPACT') {
      const participation = barAvailableQuantity > 0 ? quantity / barAvailableQuantity : 1;
      return (this.config.slippageBps + this.config.volumeImpactCoefficient * participation ** 2) * spreadMultiplier;
    }
    return this.config.slippageBps * spreadMultiplier;
  }

  _walkBook(order, book) {
    const levels = order.side === 'BUY' ? book?.asks : book?.bids;
    if (!levels?.length) return { quantity: 0, price: null };
    let remaining = order.remainingQuantity;
    let quantity = 0;
    let notional = 0;
    for (const level of levels) {
      if (remaining <= EPSILON) break;
      if (order.type === 'LIMIT') {
        const crosses = order.side === 'BUY' ? level.price <= order.limitPrice : level.price >= order.limitPrice;
        if (!crosses) break;
      }
      const take = Math.min(remaining, level.quantity);
      if (take <= EPSILON) continue;
      quantity += take;
      notional += take * level.price;
      remaining -= take;
      level.quantity -= take;
    }
    return { quantity, price: quantity > 0 ? notional / quantity : null };
  }

  processBar(bar) {
    const fills = [];
    let availableQuantity = Math.max(0, bar.volume * this.config.participationRate);
    const book = copyBook(bar.book);
    for (const order of [...this.pending]) {
      if (order.instrumentId !== bar.instrumentId || order.eligibleAt > bar.availableAt) continue;

      let quantity = 0;
      let rawPrice = null;
      let maker = false;
      if (this.config.fillModel === 'ORDER_BOOK') {
        if (!book) throw new Error(`ORDER_BOOK fill model requires book data for ${bar.instrumentId} at ${bar.eventTime}`);
        if (order.type === 'STOP' && !this._barTriggerAndPrice(order, bar).triggered) continue;
        const result = this._walkBook(order, book);
        quantity = result.quantity;
        rawPrice = result.price;
        maker = order.type === 'LIMIT';
      } else {
        const trigger = this._barTriggerAndPrice(order, bar);
        if (!trigger.triggered) continue;
        quantity = order.forceFill ? order.remainingQuantity : Math.min(order.remainingQuantity, availableQuantity);
        rawPrice = trigger.price;
        maker = trigger.maker;
        availableQuantity = Math.max(0, availableQuantity - quantity);
      }
      if (quantity <= EPSILON || rawPrice == null) continue;
      fills.push(this._createFill(order, quantity, rawPrice, bar, maker, bar.volume * this.config.participationRate));
    }
    return fills;
  }

  executeImmediate(intent, bar, referencePrice, reason = intent.reason) {
    const order = this.submit({ ...intent, submittedAt: bar.availableAt, forceFill: true, reason });
    return this._createFill(order, order.remainingQuantity, referencePrice, bar, false, Math.max(order.quantity, bar.volume));
  }

  _createFill(order, quantity, rawPrice, bar, maker, availableQuantity) {
    const slippageBps = this._slippageBps(order, quantity, availableQuantity);
    const direction = order.side === 'BUY' ? 1 : -1;
    let price = rawPrice * (1 + direction * slippageBps / 10_000);
    if (order.type === 'LIMIT') {
      price = order.side === 'BUY' ? Math.min(price, order.limitPrice) : Math.max(price, order.limitPrice);
    }
    if (!Number.isFinite(price) || price <= 0) throw new Error('Execution model generated an invalid fill price');
    const feeRateBps = maker ? this.config.makerFeeBps : this.config.takerFeeBps;
    const fee = quantity * price * feeRateBps / 10_000;
    this._fillSequence += 1;
    const fill = {
      id: `fill-${this._fillSequence}`,
      orderId: order.id,
      instrumentId: order.instrumentId,
      side: order.side,
      quantity,
      price,
      rawPrice,
      timestamp: Math.max(bar.eventTime, order.eligibleAt),
      availableAt: bar.availableAt,
      fee,
      feeRateBps,
      slippageBps,
      slippageCost: Math.abs(price - rawPrice) * quantity,
      liquidity: maker ? 'MAKER' : 'TAKER',
      regime: bar.regime,
      reason: order.reason,
    };
    const previousFilled = order.filledQuantity;
    order.filledQuantity += quantity;
    order.remainingQuantity = Math.max(0, order.quantity - order.filledQuantity);
    order.averageFillPrice = previousFilled > 0
      ? (order.averageFillPrice * previousFilled + price * quantity) / order.filledQuantity
      : price;
    order.status = order.remainingQuantity <= EPSILON ? 'FILLED' : 'PARTIAL_FILLED';
    if (order.status === 'FILLED') this.pending = this.pending.filter(candidate => candidate.id !== order.id);
    this.fills.push(fill);
    this._recordOrderEvent(order, order.status, bar.availableAt, { fillId: fill.id, filledQuantity: quantity, fillPrice: price });
    return fill;
  }

  pendingDelta(instrumentId) {
    return this.pending
      .filter(order => order.instrumentId === instrumentId)
      .reduce((sum, order) => sum + (order.side === 'BUY' ? order.remainingQuantity : -order.remainingQuantity), 0);
  }

  cancelInstrument(instrumentId, timestamp, reason = 'REPLACED') {
    const keep = [];
    for (const order of this.pending) {
      if (order.instrumentId !== instrumentId) {
        keep.push(order);
        continue;
      }
      order.status = 'CANCELLED';
      order.cancelReason = reason;
      this._recordOrderEvent(order, 'CANCELLED', timestamp, { reason });
    }
    this.pending = keep;
  }

  cancelAll(timestamp, reason = 'END_OF_RUN') {
    for (const order of [...this.pending]) {
      order.status = 'CANCELLED';
      order.cancelReason = reason;
      this._recordOrderEvent(order, 'CANCELLED', timestamp, { reason });
    }
    this.pending = [];
  }
}
