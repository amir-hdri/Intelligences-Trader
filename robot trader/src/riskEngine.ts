import jalaali from 'jalaali-js';
import {
  RiskLimits,
  RiskStatus,
  TradeAction,
  ExpertForecast,
  SymbolInfo,
  BackendRiskMetrics,
} from './types';

export class RiskEngine {
  private limits: RiskLimits;
  private status: RiskStatus;
  private readonly initialEquity: number;
  private currentEquity: number;
  private dailyStartingEquity: number;
  private winRate = 0.55;
  private profitFactor = 1.8;

  constructor(limits: RiskLimits, initialEquity: number) {
    if (!Number.isFinite(initialEquity) || initialEquity <= 0) {
      throw new Error('Initial equity must be a positive finite number');
    }
    this.validateLimits(limits);
    this.limits = { ...limits };
    this.initialEquity = initialEquity;
    this.currentEquity = initialEquity;
    this.dailyStartingEquity = initialEquity;
    this.status = {
      currentDailyDrawdown: 0,
      currentTotalDrawdown: 0,
      isKillSwitchActive: false,
      violations: [],
      margin: {
        usedMargin: 0,
        freeMargin: initialEquity,
        marginLevel: Number.POSITIVE_INFINITY,
        isCallRisk: false,
        maintenanceRequirement: 0.15,
      },
    };
    this.checkLimits();
  }

  private validateLimits(limits: RiskLimits): void {
    const numericLimits = [
      limits.maxDailyDrawdown,
      limits.maxTotalDrawdown,
      limits.maxPositionSize,
      limits.maxOpenTrades,
    ];
    if (numericLimits.some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error('Risk limits must be non-negative finite numbers');
    }
    if (!Number.isInteger(limits.maxOpenTrades)) {
      throw new Error('maxOpenTrades must be an integer');
    }
  }

  setLimits(limits: RiskLimits): void {
    this.validateLimits(limits);
    this.limits = { ...limits };
    this.checkLimits();
  }

  updateEquity(newEquity: number, usedMargin = 0): void {
    if (!Number.isFinite(newEquity) || newEquity < 0) throw new Error('Equity must be a non-negative finite number');
    if (!Number.isFinite(usedMargin) || usedMargin < 0) throw new Error('Used margin must be a non-negative finite number');

    this.currentEquity = newEquity;
    this.status.currentTotalDrawdown = Math.max(0, ((this.initialEquity - newEquity) / this.initialEquity) * 100);
    this.status.currentDailyDrawdown = Math.max(0, ((this.dailyStartingEquity - newEquity) / this.dailyStartingEquity) * 100);

    this.status.margin.usedMargin = usedMargin;
    this.status.margin.freeMargin = Math.max(0, newEquity - usedMargin);
    this.status.margin.marginLevel = usedMargin > 0 ? (newEquity / usedMargin) * 100 : Number.POSITIVE_INFINITY;
    this.status.margin.isCallRisk = usedMargin > 0 && this.status.margin.marginLevel < 120;
    this.checkLimits();
  }

  updatePerformanceMetrics(winRate: number, profitFactor: number): void {
    if (!Number.isFinite(winRate) || winRate < 0 || winRate > 1) throw new Error('Win rate must be between 0 and 1');
    if (!Number.isFinite(profitFactor) || profitFactor < 0) throw new Error('Profit factor must be non-negative');
    this.winRate = winRate;
    this.profitFactor = profitFactor;
  }

  private checkLimits(): void {
    const violations: string[] = [];
    if (this.status.currentDailyDrawdown >= this.limits.maxDailyDrawdown) {
      violations.push(`Daily drawdown limit exceeded: ${this.status.currentDailyDrawdown.toFixed(2)}%`);
    }
    if (this.status.currentTotalDrawdown >= this.limits.maxTotalDrawdown) {
      violations.push(`Total drawdown limit exceeded: ${this.status.currentTotalDrawdown.toFixed(2)}%`);
    }
    if (this.status.margin.isCallRisk) violations.push('Critical Margin Level - Liquidation Risk');
    if (this.limits.stopAllTrading) violations.push('Manual trading halt active');

    this.status.violations = violations;
    // A risk-triggered halt is deliberately sticky until an explicit reset.
    if (violations.length > 0) this.status.isKillSwitchActive = true;
  }

  private isIranianHoliday(date: Date): boolean {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 4 || dayOfWeek === 5) return true;

    const { jm, jd } = jalaali.toJalaali(date);
    if (jm === 1 && jd >= 1 && jd <= 4) return true;
    if (jm === 1 && (jd === 12 || jd === 13)) return true;
    if (jm === 3 && (jd === 14 || jd === 15)) return true;
    if (jm === 11 && jd === 22) return true;
    if (jm === 12 && jd === 29) return true;
    return false;
  }

  validateTrade(
    forecast: ExpertForecast,
    activeTrades: number,
    symbolInfo: SymbolInfo,
    advancedRisk?: BackendRiskMetrics,
  ): { allowed: boolean; reason?: string } {
    if (this.status.isKillSwitchActive) {
      return { allowed: false, reason: `Kill Switch Active: ${this.status.violations.join(', ')}` };
    }
    if (forecast.action === 'HOLD') return { allowed: false, reason: 'No executable trade signal' };
    if (!Number.isInteger(activeTrades) || activeTrades < 0) return { allowed: false, reason: 'Invalid open trade count' };
    if (activeTrades >= this.limits.maxOpenTrades) return { allowed: false, reason: 'Max open trades reached' };
    if (!Number.isFinite(forecast.entryPrice) || forecast.entryPrice <= 0) return { allowed: false, reason: 'Invalid entry price' };
    if (!Number.isFinite(forecast.confidence) || forecast.confidence < 0.6) {
      return { allowed: false, reason: 'Confidence too low' };
    }

    if (this.isIranianHoliday(new Date()) && forecast.regime === 'HIGH_VOLATILITY') {
      return { allowed: false, reason: 'Holiday/Weekend risk high. Volatility prevents new positions.' };
    }

    if (symbolInfo.expiryDate) {
      const daysToExpiry = (symbolInfo.expiryDate - Date.now()) / 86_400_000;
      if (daysToExpiry < 5) {
        return { allowed: false, reason: `Contract near expiry (${daysToExpiry.toFixed(1)} days). Rolling required.` };
      }
    }

    const valueAtRisk95 = advancedRisk?.valueAtRisk95;
    if (Number.isFinite(valueAtRisk95)) {
      const varLossPct = Math.max(0, -Number(valueAtRisk95)) * 100;
      if (varLossPct > this.limits.maxDailyDrawdown) {
        return {
          allowed: false,
          reason: `Value at Risk (${varLossPct.toFixed(2)}%) exceeds Daily Drawdown Limit (${this.limits.maxDailyDrawdown}%)`,
        };
      }
    }

    if (this.currentEquity <= 0 || this.status.margin.freeMargin / this.currentEquity < 0.3) {
      return { allowed: false, reason: 'Insufficient Free Margin (maintained >30% requirement)' };
    }
    return { allowed: true };
  }

  calculateKellySize(price: number, atr: number, suggestedRiskCapitalPct?: number): number {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atr) || atr <= 0 || this.profitFactor <= 0) return 0;

    const lossProbability = 1 - this.winRate;
    const fullKelly = (this.winRate * this.profitFactor - lossProbability) / this.profitFactor;
    const fractionalKelly = Math.max(0, fullKelly * 0.25);
    const modelFraction = suggestedRiskCapitalPct === undefined
      ? fractionalKelly
      : Math.max(0, Math.min(1, suggestedRiskCapitalPct));
    const riskFraction = Math.min(fractionalKelly, modelFraction, this.limits.maxPositionSize / 100);

    const riskBasedQuantity = Math.floor((this.currentEquity * riskFraction) / (1.5 * atr));
    const notionalCapQuantity = Math.floor((this.currentEquity * (this.limits.maxPositionSize / 100)) / price);
    return Math.max(0, Math.min(riskBasedQuantity, notionalCapQuantity));
  }

  calculateTrailingStop(currentPrice: number, entryPrice: number, action: TradeAction, atr: number): number {
    if (![currentPrice, entryPrice, atr].every(Number.isFinite) || currentPrice <= 0 || entryPrice <= 0 || atr < 0) return 0;
    if (action === 'HOLD') return entryPrice;
    if (action === 'BUY') return Math.max(entryPrice - 1.5 * atr, currentPrice - 2 * atr);
    return Math.min(entryPrice + 1.5 * atr, currentPrice + 2 * atr);
  }

  getStatus(): RiskStatus {
    return {
      ...this.status,
      violations: [...this.status.violations],
      margin: { ...this.status.margin },
    };
  }

  resetKillSwitch(): void {
    if (this.limits.stopAllTrading) return;
    this.status.isKillSwitchActive = false;
    this.status.violations = [];
    this.dailyStartingEquity = this.currentEquity;
    this.checkLimits();
  }
}
