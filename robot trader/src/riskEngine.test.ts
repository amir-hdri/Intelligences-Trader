import test from 'node:test';
import assert from 'node:assert';
import { RiskEngine } from './riskEngine';
import { RiskLimits, ExpertForecast } from './types';

test('RiskEngine holiday detection', async (t) => {
  const limits: RiskLimits = {
    maxDailyDrawdown: 5,
    maxTotalDrawdown: 10,
    maxPositionSize: 100,
    maxOpenTrades: 5,
    stopAllTrading: false
  };

  const forecast = {
    action: 'BUY',
    confidence: 0.8,
    regime: 'HIGH_VOLATILITY',
    indicators: {} as any
  } as ExpertForecast;

  const symbolInfo = {};
  const originalDate = global.Date;

  await t.test('Should block on weekend (Thursday)', () => {
    const engine = new RiskEngine(limits, 10000);
    // 2023-01-05 is a Thursday
    class MockDateThursday extends originalDate {
      constructor() {
        super('2023-01-05T12:00:00Z');
      }
    }
    // @ts-ignore
    global.Date = MockDateThursday;
    let result = engine.validateTrade(forecast, 0, symbolInfo);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Holiday\/Weekend risk high/);
    global.Date = originalDate;
  });

  await t.test('Should block on Nowruz (Farvardin 1)', () => {
    const engine = new RiskEngine(limits, 10000);
    // 2023-03-21 is Farvardin 1, 1402 (Tuesday)
    class MockDateNowruz extends originalDate {
      constructor() {
        super('2023-03-21T12:00:00Z');
      }
    }
    // @ts-ignore
    global.Date = MockDateNowruz;
    let result = engine.validateTrade(forecast, 0, symbolInfo);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Holiday\/Weekend risk high/);
    global.Date = originalDate;
  });

  await t.test('Should allow on regular working day', () => {
    const engine = new RiskEngine(limits, 10000);
    // 2023-01-02 is a Monday (working day, not holiday)
    class MockDateWorkingDay extends originalDate {
      constructor() {
        super('2023-01-02T12:00:00Z');
      }
    }
    // @ts-ignore
    global.Date = MockDateWorkingDay;
    let result = engine.validateTrade(forecast, 0, symbolInfo);
    assert.strictEqual(result.allowed, true);
    global.Date = originalDate;
  });
});
