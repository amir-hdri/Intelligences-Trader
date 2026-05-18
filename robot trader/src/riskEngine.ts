import jalaali from 'jalaali-js';
import { RiskLimits, RiskStatus, TradeAction, MarketCandle, ExpertForecast, MarginStatus, SymbolInfo } from './types';

export class RiskEngine {
  private limits: RiskLimits;
  private status: RiskStatus;
  private initialEquity: number;
  private currentEquity: number;
  private dailyStartingEquity: number;
  private winRate: number = 0.55; // Historical base
  private profitFactor: number = 1.8;

  constructor(limits: RiskLimits, initialEquity: number) {
    this.limits = limits;
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
        marginLevel: 1000,
        isCallRisk: false,
        maintenanceRequirement: 0.15 // 15% standard for IME
      }
    };
  }

  updateEquity(newEquity: number, usedMargin: number = 0) {
    this.currentEquity = newEquity;
    this.status.currentTotalDrawdown = ((this.initialEquity - this.currentEquity) / this.initialEquity) * 100;
    this.status.currentDailyDrawdown = ((this.dailyStartingEquity - this.currentEquity) / this.dailyStartingEquity) * 100;
    
    // Update Margin Status
    this.status.margin.usedMargin = usedMargin;
    this.status.margin.freeMargin = this.currentEquity - usedMargin;
    this.status.margin.marginLevel = usedMargin > 0 ? (this.currentEquity / usedMargin) * 100 : 1000;
    this.status.margin.isCallRisk = this.status.margin.marginLevel < 120; // Alert at 120%

    this.checkLimits();
  }

  updatePerformanceMetrics(winRate: number, profitFactor: number) {
    this.winRate = winRate;
    this.profitFactor = profitFactor;
  }

  private checkLimits() {
    const violations: string[] = [];

    if (this.status.currentDailyDrawdown > this.limits.maxDailyDrawdown) {
      violations.push(`Daily drawdown limit exceeded: ${this.status.currentDailyDrawdown.toFixed(2)}%`);
    }
    if (this.status.currentTotalDrawdown > this.limits.maxTotalDrawdown) {
      violations.push(`Total drawdown limit exceeded: ${this.status.currentTotalDrawdown.toFixed(2)}%`);
    }
    if (this.status.margin.isCallRisk) {
      violations.push('Critical Margin Level - Liquidation Risk');
    }
    if (this.limits.stopAllTrading) {
      violations.push('Manual trading halt active');
    }

    this.status.violations = violations;
    if (violations.length > 0) {
      this.status.isKillSwitchActive = true;
    }
  }


  private isIranianHoliday(date: Date): boolean {
    const dayOfWeek = date.getDay();
    // Thursday (4) and Friday (5) are weekends in Iran
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      return true;
    }

    const { jm, jd } = jalaali.toJalaali(date);

    // Fixed solar Hijri holidays
    if (jm === 1 && jd >= 1 && jd <= 4) return true; // Nowruz
    if (jm === 1 && jd === 12) return true; // Islamic Republic Day
    if (jm === 1 && jd === 13) return true; // Sizdah Bedar
    if (jm === 3 && jd === 14) return true; // Khomeini's Death
    if (jm === 3 && jd === 15) return true; // Khordad 15 Revolt
    if (jm === 11 && jd === 22) return true; // Revolution Day
    if (jm === 12 && jd === 29) return true; // Oil Nationalization Day

    return false;
  }

  validateTrade(forecast: ExpertForecast, activeTrades: number, symbolInfo: SymbolInfo, advancedRisk?: any): { allowed: boolean; reason?: string } {
    if (this.status.isKillSwitchActive) {
      return { allowed: false, reason: `Kill Switch Active: ${this.status.violations.join(', ')}` };
    }

    if (activeTrades >= this.limits.maxOpenTrades) {
      return { allowed: false, reason: 'Max open trades reached' };
    }

    if (forecast.confidence < 0.6) {
      return { allowed: false, reason: 'Confidence too low' };
    }

    // Holiday Risk Management (Iranian Calendar)
    if (this.isIranianHoliday(new Date()) && forecast.regime === 'HIGH_VOLATILITY') {
      return { allowed: false, reason: 'Holiday/Weekend risk high. Volatility prevents new positions.' };
    }

    // Expiry Management
    if (symbolInfo.expiryDate) {
      const daysToExpiry = (symbolInfo.expiryDate - Date.now()) / (24 * 60 * 60 * 1000);
      if (daysToExpiry < 5) {
        return { allowed: false, reason: `Contract near expiry (${daysToExpiry.toFixed(1)} days). Rolling required.` };
      }
    }

    // VaR Management (If Value at Risk implies a loss greater than our daily allowed drawdown)
    if (advancedRisk && advancedRisk.var95) {
      // var95 is negative, e.g. -0.05 means 5% loss
      const varLossPct = Math.abs(advancedRisk.var95) * 100;
      if (varLossPct > this.limits.maxDailyDrawdown) {
          return { allowed: false, reason: `Value at Risk (${varLossPct.toFixed(2)}%) exceeds Daily Drawdown Limit (${this.limits.maxDailyDrawdown}%)` };
      }
    }

    // Free Margin Buffer (>30%)
    if (this.status.margin.freeMargin / this.currentEquity < 0.3) {
      return { allowed: false, reason: 'Insufficient Free Margin (maintained >30% requirement)' };
    }

    return { allowed: true };
  }

  calculateKellySize(price: number, atr: number, suggestedRiskCapitalPct?: number): number {
    // Kelly Criterion: f* = (p * b - q) / b
    // p = win rate, b = win/loss ratio (profit factor), q = 1 - p
    const p = this.winRate;
    const b = this.profitFactor;

    // Avoid division by zero and handle non-positive profit factor
    if (b <= 0) return 0;

    const q = 1 - p;
    const kellyF = (p * b - q) / b;
    
    // Fractional Kelly (25% of Kelly for safety)
    const safeKelly = Math.max(0, kellyF * 0.25);

    // Use the backend's suggested risk capital if available, otherwise fallback to Kelly
    const finalRiskPct = suggestedRiskCapitalPct !== undefined ?
                         Math.min(suggestedRiskCapitalPct, safeKelly) :
                         safeKelly;

    const riskAmount = this.currentEquity * finalRiskPct;
    
    const stopLossDistance = 1.5 * atr; 
    if (stopLossDistance === 0) return 0;
    
    return Math.floor(riskAmount / stopLossDistance);
  }

  calculateTrailingStop(currentPrice: number, entryPrice: number, action: TradeAction, atr: number): number {
    const multiplier = 2.0;
    if (action === 'BUY') {
      // Move stop up to (currentPrice - 2*ATR) but never move it down
      return Math.max(entryPrice - 1.5 * atr, currentPrice - multiplier * atr);
    } else {
      return Math.min(entryPrice + 1.5 * atr, currentPrice + multiplier * atr);
    }
  }

  getStatus(): RiskStatus {
    return { ...this.status };
  }

  resetKillSwitch() {
    this.status.isKillSwitchActive = false;
    this.status.violations = [];
    this.dailyStartingEquity = this.currentEquity;
  }
}
