import { createSeededRng } from '../utils/deterministic.js';

export class PositionSizingEnv {
  constructor(config = {}) {
    this.initialBalance = config.initialBalance || 10000;
    this.transactionFee = config.transactionFee || 0.001;
    this.maxDrawdownPenalty = config.maxDrawdownPenalty || 10;
    this.historyLength = config.historyLength || 5;
    this.reset();
  }

  reset(marketData = null) {
    this.balance = this.initialBalance;
    this.peakBalance = this.initialBalance;
    this.currentStep = 0;
    this.done = false;
    this.marketData = marketData || this.generateDefaultMarketData(100);
    this.totalSteps = this.marketData.length - 1;
    this.position = 0;
    return this.getState();
  }

  generateDefaultMarketData(length) {
    const data = [];
    let price = 100;
    const rng = createSeededRng(`pos-env-${length}-${this.initialBalance}`);
    for (let i = 0; i < length; i++) {
      const isShock = rng() < 0.05;
      const volatility = isShock ? 0.05 : 0.01;
      const change = 1 + (rng() * 2 - 1) * volatility;
      price *= change;
      data.push({
        price: price,
        volatilityRegime: isShock ? 1 : 0,
        marketDirection: change > 1 ? 1 : -1,
        timeToExpiry: 1 - (i / length),
        correlation: rng() * 2 - 1
      });
    }
    return data;
  }

  getState() {
    const dataPoint = this.marketData[this.currentStep];
    const drawdown = (this.peakBalance - this.balance) / this.peakBalance;
    return [
      dataPoint.volatilityRegime,
      drawdown,
      dataPoint.marketDirection,
      dataPoint.timeToExpiry,
      dataPoint.correlation
    ];
  }

  step(action) {
    let positionSize = Math.max(0, Math.min(1, action[0] || action));
    const currentPrice = this.marketData[this.currentStep].price;
    const nextPrice = this.marketData[this.currentStep + 1].price;
    const priceReturn = (nextPrice - currentPrice) / currentPrice;
    const capitalInvested = this.balance * positionSize;
    const grossPnL = capitalInvested * priceReturn;
    const positionChange = Math.abs(positionSize - this.position);
    const transactionCost = this.balance * positionChange * this.transactionFee;
    const netPnL = grossPnL - transactionCost;
    this.balance += netPnL;
    this.peakBalance = Math.max(this.peakBalance, this.balance);
    const drawdown = (this.peakBalance - this.balance) / this.peakBalance;
    const volatility = Math.abs(priceReturn);
    const stepReturn = netPnL / this.initialBalance;
    const adjustedReturn = stepReturn > 0 ? stepReturn : stepReturn * 2.0;
    const riskAdjustment = volatility > 0 ? adjustedReturn / (volatility + 0.001) : 0;
    const drawdownPenalty = Math.pow(drawdown, 2) * this.maxDrawdownPenalty * 10;
    const survivalBonus = 0.001;
    const reward = riskAdjustment - drawdownPenalty - (transactionCost / this.initialBalance) + survivalBonus;
    this.position = positionSize;
    this.currentStep++;
    if (this.currentStep >= this.totalSteps || this.balance <= 0) {
      this.done = true;
    }
    return {
      state: this.getState(),
      reward: reward,
      done: this.done,
      info: { balance: this.balance, drawdown: drawdown, positionSize: positionSize }
    };
  }
}
