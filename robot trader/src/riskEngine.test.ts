// @ts-ignore
import { describe, it, test, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { RiskEngine } from './riskEngine';
import { ExpertForecast, MarketRegime, RiskLimits, TradeAction } from './types';

// Helper to mock global Date
let originalDate: typeof Date;

function mockDate(isoDateString: string) {
  originalDate = globalThis.Date;
  const fixedDate = new originalDate(isoDateString);

  // Create a mock Date class
  class MockDate extends originalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedDate.getTime());
      } else {
        // @ts-ignore
        super(...args);
      }
    }

    static now() {
      return fixedDate.getTime();
    }
  }

  // @ts-ignore
  globalThis.Date = MockDate;
}

function restoreDate() {
  if (originalDate) {
    globalThis.Date = originalDate;
  }
}

describe('RiskEngine - validateTrade (Weekend Risk)', () => {
  let riskEngine: RiskEngine;
  let defaultLimits: RiskLimits;
  let defaultForecast: ExpertForecast;

  before(() => {
    defaultLimits = {
      maxDailyDrawdown: 5,
      maxTotalDrawdown: 10,
      maxPositionSize: 1000,
      maxOpenTrades: 5,
      stopAllTrading: false
    };

    defaultForecast = {
      action: 'BUY' as TradeAction,
      entryPrice: 100,
      targetPrice: 110,
      stopLoss: 90,
      confidence: 0.8, // High confidence to pass initial check
      regime: 'TRENDING_UP' as MarketRegime,
      sentimentScore: 0.5,
      basisOpportunity: 0,
      orderBookPressure: 0.1,
      politicalRiskIndex: 50,
      queueDynamicsRatio: 0.6,
      timeframeAnalysis: {},
      indicators: {
        rsi: 50,
        macd: { value: 0, signal: 0, histogram: 0 },
        atr: 2,
        bollinger: { upper: 110, middle: 100, lower: 90 },
        ichimoku: { tenkan: 100, kijun: 100, senkouA: 100, senkouB: 100 }
      },
      reason: 'Test forecast'
    };
  });

  after(() => {
    restoreDate();
  });

  test('allows trade on Thursday with normal regime', () => {
    mockDate('2023-10-12T12:00:00Z'); // Thursday
    riskEngine = new RiskEngine(defaultLimits, 10000);

    const forecast = { ...defaultForecast, regime: 'TRENDING_UP' as MarketRegime };
    const result = riskEngine.validateTrade(forecast, 0, {});

    assert.strictEqual(result.allowed, true);
    restoreDate();
  });

  test('blocks trade on Thursday with HIGH_VOLATILITY regime', () => {
    mockDate('2023-10-12T12:00:00Z'); // Thursday
    riskEngine = new RiskEngine(defaultLimits, 10000);

    const forecast = { ...defaultForecast, regime: 'HIGH_VOLATILITY' as MarketRegime };
    const result = riskEngine.validateTrade(forecast, 0, {});

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'Weekend risk high. Volatility prevents new positions.');
    restoreDate();
  });

  test('blocks trade on Friday with HIGH_VOLATILITY regime', () => {
    mockDate('2023-10-13T12:00:00Z'); // Friday
    riskEngine = new RiskEngine(defaultLimits, 10000);

    const forecast = { ...defaultForecast, regime: 'HIGH_VOLATILITY' as MarketRegime };
    const result = riskEngine.validateTrade(forecast, 0, {});

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'Weekend risk high. Volatility prevents new positions.');
    restoreDate();
  });

  test('allows trade on Monday with HIGH_VOLATILITY regime', () => {
    mockDate('2023-10-16T12:00:00Z'); // Monday
    riskEngine = new RiskEngine(defaultLimits, 10000);

    const forecast = { ...defaultForecast, regime: 'HIGH_VOLATILITY' as MarketRegime };
    const result = riskEngine.validateTrade(forecast, 0, {});

    assert.strictEqual(result.allowed, true);
    restoreDate();
  });
});
