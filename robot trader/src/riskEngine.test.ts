import { describe, it, mock, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { RiskEngine } from './riskEngine';
import { HISTORICAL_SAFFRON_DATA } from './historicalData';
import { ExpertForecast, SymbolInfo, TradeAction, MarketRegime } from './types';

describe('RiskEngine Integration Tests', () => {
  let engine: RiskEngine;

  // Standard Risk Limits for testing
  const limits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxPositionSize: 1000,
    maxOpenTrades: 5,
    stopAllTrading: false
  };

  // Helper to create a valid forecast
  const createForecast = (overrides: Partial<ExpertForecast> = {}): ExpertForecast => ({
    action: 'BUY',
    entryPrice: 100,
    targetPrice: 110,
    stopLoss: 95,
    confidence: 0.8,
    regime: 'RANGING',
    sentimentScore: 0.5,
    basisOpportunity: 0,
    orderBookPressure: 0,
    timeframeAnalysis: {},
    indicators: {
      rsi: 50,
      macd: { value: 0, signal: 0, histogram: 0 },
      atr: 1,
      bollinger: { upper: 102, middle: 100, lower: 98 },
      ichimoku: { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0 }
    },
    reason: 'Test Signal',
    ...overrides
  });

  // Helper to create valid symbol info
  const createSymbolInfo = (overrides: Partial<SymbolInfo> = {}): SymbolInfo => ({
    id: 'SAF1404',
    name: 'Saffron 1404',
    fullName: 'Saffron Futures March 2025',
    type: 'FUTURES',
    priceLimit: { up: 1000, down: 0 },
    ...overrides
  });

  beforeEach(() => {
    engine = new RiskEngine(limits, 10000); // 10,000 Initial Equity
  });

  it('should allow valid trades under normal conditions', () => {
    const result = engine.validateTrade(createForecast(), 0, createSymbolInfo());
    assert.strictEqual(result.allowed, true, `Trade should be allowed: ${result.reason}`);
  });

  it('should reject trades when Kill Switch is active', () => {
    // Force Kill Switch
    engine['status'].isKillSwitchActive = true;
    engine['status'].violations = ['Manual Trigger'];

    const result = engine.validateTrade(createForecast(), 0, createSymbolInfo());
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Kill Switch Active/);

    // Reset
    engine.resetKillSwitch();
  });

  it('should reject trades exceeding max open trades', () => {
    const result = engine.validateTrade(createForecast(), 5, createSymbolInfo());
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'Max open trades reached');
  });

  it('should reject low confidence forecasts', () => {
    const forecast = createForecast({ confidence: 0.5 });
    const result = engine.validateTrade(forecast, 0, createSymbolInfo());
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'Confidence too low');
  });

  // "Real Data" Integration Test
  it('should process a sequence of historical data and validate trades realistically', () => {
    // We simulate a strategy running over historical data
    // We pick 10 random points from history to test diverse market conditions

    // Reset engine
    engine = new RiskEngine(limits, 10000000); // 10M Toman Equity

    // Use first 50 candles
    const sampleData = HISTORICAL_SAFFRON_DATA.slice(0, 50);

    let tradesAttempted = 0;
    let tradesAllowed = 0;

    for (const candle of sampleData) {
        // Simulate Strategy Signal Logic based on "Real Data"
        // Simple strategy: If Close > Open, BUY. If Close < Open, SELL.
        const action: TradeAction = candle.close > candle.open ? 'BUY' : 'SELL';

        // Calculate dynamic confidence based on volume (simulated realism)
        // Higher volume -> Higher confidence
        const volumeFactor = Math.min(1, candle.volume / 500000);
        const confidence = 0.5 + (volumeFactor * 0.4); // Range 0.5 to 0.9

        const forecast = createForecast({
            action,
            entryPrice: candle.close,
            confidence: confidence,
            // If high volatility in history, set regime accordingly
            regime: (candle.high - candle.low) / candle.close > 0.02 ? 'HIGH_VOLATILITY' : 'RANGING'
        });

        // We also update the engine equity to simulate PnL fluctuations
        // (Just random fluctuation for this test to stress margin checks)
        const randomPnL = (Math.random() - 0.5) * 100000;
        engine.updateEquity(engine['currentEquity'] + randomPnL, 100000); // Assume 100k margin used

        const result = engine.validateTrade(forecast, 0, createSymbolInfo());

        tradesAttempted++;
        if (result.allowed) tradesAllowed++;

        // Assert logic based on our known constraints
        if (confidence < 0.6) {
            assert.strictEqual(result.allowed, false, 'Should reject low confidence from historical simulation');
        }
    }

    // Ensure we processed data
    assert.ok(tradesAttempted > 0, 'Should have attempted trades based on historical data');
    console.log(`Historical Simulation: ${tradesAllowed}/${tradesAttempted} trades allowed`);
  });

  it('should reject trades on weekends during high volatility', (t) => {
    // Mock Date to be a Friday (5)
    // We use a specific timestamp: Friday, March 14, 2025
    const mockTimestamp = new Date('2025-03-14T12:00:00Z').getTime();

    // Mock the global Date constructor
    const originalDate = global.Date;

    // @ts-ignore
    global.Date = class extends Date {
        constructor(date?: any) {
            if (date) {
                super(date);
            } else {
                super(mockTimestamp);
            }
        }
        static now() {
            return mockTimestamp;
        }
    };

    const forecast = createForecast({ regime: 'HIGH_VOLATILITY' });
    const result = engine.validateTrade(forecast, 0, createSymbolInfo());

    // Restore Date
    global.Date = originalDate;

    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Weekend risk high/);
  });

  it('should reject trades near contract expiry', () => {
    // Expiry in 3 days
    const expiryDate = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const symbolInfo = createSymbolInfo({ expiryDate });

    const result = engine.validateTrade(createForecast(), 0, symbolInfo);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Contract near expiry/);
  });

  it('should reject trades when free margin is insufficient', () => {
    // Force high margin usage without triggering Kill Switch (Drawdown or Margin Call)
    // Initial Equity 10000.
    // New Equity 9600 (4% drawdown, safe vs 5% limit).
    // Used Margin 7500.
    // Free Margin = 2100. Ratio = 2100/9600 = 0.218 < 0.3.
    // Margin Level = (9600/7500)*100 = 128% > 120% (safe vs Call Risk).
    engine.updateEquity(9600, 7500);

    const result = engine.validateTrade(createForecast(), 0, createSymbolInfo());
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Insufficient Free Margin/);
  });
});
