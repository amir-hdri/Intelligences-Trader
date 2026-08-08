const EPSILON = 1e-12;

export class BacktestRiskEngine {
  constructor(config) {
    this.config = config;
    this.killSwitchActive = false;
    this.rejections = [];
  }

  evaluateTarget({ instrumentId, targetPosition, price, portfolio, timestamp, signal, pendingDelta = 0 }) {
    if (targetPosition == null) return null;
    const settled = portfolio.positions.find(position => position.instrumentId === instrumentId)?.quantity || 0;
    const current = settled + pendingDelta;
    const reducing = Math.abs(targetPosition) < Math.abs(settled)
      || (Math.sign(targetPosition) !== Math.sign(settled) && Math.abs(settled) > EPSILON);

    if (portfolio.equity <= 0) {
      return this._reject(instrumentId, timestamp, 'NON_POSITIVE_EQUITY', signal);
    }
    if (portfolio.drawdown >= this.config.maxDrawdownPct) this.killSwitchActive = true;
    if (this.killSwitchActive && !reducing && Math.abs(targetPosition) > EPSILON) {
      return this._reject(instrumentId, timestamp, 'DRAWDOWN_KILL_SWITCH', signal);
    }

    const leverageCap = portfolio.equity * this.config.maxLeverage;
    const currentInstrumentNotional = Math.abs(settled * price);
    const otherExposure = Math.max(0, portfolio.grossExposure - currentInstrumentNotional);
    const remainingPortfolioCapacity = Math.max(0, leverageCap - otherExposure);
    const notionalCap = Math.min(this.config.maxPositionNotional, remainingPortfolioCapacity);
    const quantityCap = notionalCap / price;
    const boundedTarget = Math.max(-quantityCap, Math.min(quantityCap, targetPosition));
    const delta = boundedTarget - current;
    if (Math.abs(delta) <= EPSILON) return null;

    return {
      instrumentId,
      side: delta > 0 ? 'BUY' : 'SELL',
      quantity: Math.abs(delta),
      type: 'MARKET',
      submittedAt: timestamp,
      signal,
      reason: signal?.reason || 'STRATEGY_TARGET',
      resized: Math.abs(boundedTarget - targetPosition) > EPSILON,
      requestedTarget: targetPosition,
      acceptedTarget: boundedTarget,
    };
  }

  liquidationIntent(instrumentId, portfolio, timestamp, reason = 'RISK_LIQUIDATION') {
    const current = portfolio.positions.find(position => position.instrumentId === instrumentId)?.quantity || 0;
    if (Math.abs(current) <= EPSILON) return null;
    return {
      instrumentId,
      side: current > 0 ? 'SELL' : 'BUY',
      quantity: Math.abs(current),
      type: 'MARKET',
      submittedAt: timestamp,
      reason,
      forceFill: true,
    };
  }

  _reject(instrumentId, timestamp, reason, signal) {
    const rejection = { instrumentId, timestamp, reason, signal };
    this.rejections.push(rejection);
    return { rejected: true, ...rejection };
  }
}
