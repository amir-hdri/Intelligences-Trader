import { describe, test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../index.js';

import { P2ExecutionEngine } from '../modules/paperTradingEngine/p2/execution/P2ExecutionEngine.js';
import { OrderBookSimulator } from '../modules/paperTradingEngine/p2/execution/OrderBookSimulator.js';
import { OrderStateMachine, ORDER_STATES } from '../modules/paperTradingEngine/p2/execution/OrderStateMachine.js';
import { MLSignalBridge } from '../modules/paperTradingEngine/p2/ml/MLSignalBridge.js';
import { PerformanceAnalytics } from '../modules/paperTradingEngine/p2/analytics/PerformanceAnalytics.js';
import { ReportGenerator } from '../modules/paperTradingEngine/p2/analytics/ReportGenerator.js';
import { BacktestHarness } from '../modules/paperTradingEngine/p2/backtest/BacktestHarness.js';
import { DataNormalizer } from '../modules/paperTradingEngine/p2/data/DataNormalizer.js';
import { TickByTickProcessor } from '../modules/paperTradingEngine/p2/data/TickByTickProcessor.js';
import { RedisCache } from '../modules/paperTradingEngine/p2/data/RedisCache.js';
import { TradeRepository } from '../modules/paperTradingEngine/p2/storage/TradeRepository.js';
import { PaperTradingEngine } from '../modules/paperTradingEngine.js';

// A lightweight base engine with a real (deterministic) executeTrade, so we can
// test P2 slippage/fees without the full production engine.
class StubEngine {
  constructor() {
    this.balance = 1000000;
    this.trades = [];
  }
  executeTrade(order, forecast, marketPrice) {
    const isWin = (forecast?.action || 'HOLD') === order.action;
    const risk = 1000;
    const pnl = isWin ? risk : -risk;
    this.balance += pnl;
    const trade = {
      id: `t-${this.trades.length}`,
      timestamp: Date.now(),
      symbol: order.symbol,
      action: order.action,
      quantity: order.qty,
      entryPrice: order.entry || marketPrice,
      pnl,
      isWin,
      reason: 'stub',
    };
    this.trades.push(trade);
    return { success: true, trade, pnl, isWin, newBalance: this.balance };
  }
}

const candleSeries = () => Array.from({ length: 40 }, (_, i) => ({
  timestamp: i,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 1000 + i,
}));

describe('P2 DataNormalizer', () => {
  test('normalizes OHLCV into ML-ready features', () => {
    const out = DataNormalizer.normalize(candleSeries());
    assert.ok(out.length === 40);
    assert.ok(out.every(c => c.normClose >= 0 && c.normClose <= 1));
    assert.ok(out.every(c => Number.isFinite(c.normVolume)));
    assert.strictEqual(DataNormalizer.normalize([]).length, 0);
  });

  test('does not change past normalized rows when future prices change', () => {
    const baseline = candleSeries();
    const changed = candleSeries();
    changed[changed.length - 1] = {
      ...changed[changed.length - 1],
      high: changed[changed.length - 1].high * 10,
      close: changed[changed.length - 1].close * 9,
    };
    const before = DataNormalizer.normalize(baseline).slice(0, -1);
    const after = DataNormalizer.normalize(changed).slice(0, -1);
    assert.deepStrictEqual(after, before);
  });
});

describe('P2 TickByTickProcessor', () => {
  test('computes VWAP and keeps recent ticks', () => {
    const t = new TickByTickProcessor();
    t.addTick({ price: 100, volume: 2 });
    t.addTick({ price: 200, volume: 2 });
    // VWAP = (100*2 + 200*2)/4 = 150
    assert.strictEqual(t.getVWAP(), 150);
    assert.strictEqual(t.getRecentTicks().length, 2);
    assert.strictEqual(t.getVWAP(), 150);
  });

  test('returns 0 VWAP with no ticks', () => {
    assert.strictEqual(new TickByTickProcessor().getVWAP(), 0);
  });
});

describe('P2 OrderBookSimulator', () => {
  test('market order fills against the book with slippage and partial fills', () => {
    const ob = new OrderBookSimulator();
    ob.updateBook(
      [{ price: 99, qty: 10 }, { price: 98, qty: 5 }],   // bids
      [{ price: 101, qty: 5 }, { price: 102, qty: 5 }]   // asks
    );
    assert.strictEqual(ob.bestAsk(), 101);
    assert.strictEqual(ob.bestBid(), 99);

    const res = ob.marketOrder('BUY', 7);
    assert.strictEqual(res.filled, 7);
    assert.strictEqual(res.remaining, 0);
    assert.strictEqual(res.trade.side, 'BUY');
  });

  test('market order respects available liquidity (partial fill)', () => {
    const ob = new OrderBookSimulator();
    ob.updateBook([{ price: 98, qty: 5 }], [{ price: 101, qty: 3 }]);
    const res = ob.marketOrder('BUY', 10);
    assert.strictEqual(res.filled, 3);
    assert.strictEqual(res.remaining, 7);
  });

  test('resting limit order can be cancelled', () => {
    const ob = new OrderBookSimulator();
    ob.updateBook([], []);
    const order = ob.placeLimitOrder('BUY', 95, 4);
    assert.strictEqual(order.status, 'OPEN');
    assert.strictEqual(ob.bestBid(), 95);
    const cancelled = ob.cancelOrder(order.id);
    assert.strictEqual(cancelled.status, 'CANCELLED');
    assert.strictEqual(ob.bestBid(), null);
  });
});

describe('P2 OrderStateMachine', () => {
  test('valid transitions: OPEN -> FILLED, and rejects invalid transitions', () => {
    const osm = new OrderStateMachine();
    const order = osm.createOrder({ symbol: 'BTC/USDT', action: 'BUY', qty: 2 });
    assert.strictEqual(order.status, ORDER_STATES.OPEN);
    assert.ok(order.id.startsWith('ord-'));

    const filled = osm.updateStatus(order.id, ORDER_STATES.FILLED);
    assert.strictEqual(filled.status, ORDER_STATES.FILLED);
    // Can't go FILLED -> CANCELLED
    assert.strictEqual(osm.updateStatus(order.id, ORDER_STATES.CANCELLED), null);
  });

  test('recordFill moves OPEN -> FILLED when fully filled', () => {
    const osm = new OrderStateMachine();
    const order = osm.createOrder({ symbol: 'BTC/USDT', action: 'BUY', qty: 5 });
    const after = osm.recordFill(order.id, 5, 101);
    assert.strictEqual(after.status, ORDER_STATES.FILLED);
    assert.strictEqual(after.filledQty, 5);
  });

  test('idempotent create with clientOrderId returns the same order', () => {
    const osm = new OrderStateMachine();
    const a = osm.createOrder({ clientOrderId: 'abc', action: 'SELL', qty: 1 });
    const b = osm.createOrder({ clientOrderId: 'abc', action: 'SELL', qty: 1 });
    assert.strictEqual(a.id, b.id);
  });
});

describe('P2 Execution Engine', () => {
  const mk = () => new P2ExecutionEngine(new StubEngine());

  test('market order applies slippage and fees and reduces balance', () => {
    const eng = mk();
    const baseBefore = eng.base.balance;
    const res = eng.marketOrder('BTC/USDT', 'BUY', 1, { action: 'BUY', confidence: 0.9 }, 100);
    assert.strictEqual(res.success, true);
    assert.ok(Number.isFinite(res.trade.fee) && res.trade.fee > 0);
    assert.ok(Number.isFinite(res.trade.slippage));
    assert.strictEqual(res.trade.execType, 'MARKET');
    assert.ok(res.trade.netPnl <= res.trade.pnl); // fee subtracted
    assert.ok(eng.base.balance < baseBefore + 1000); // fee reflected in balance
  });

  test('limit order rests (OPEN) when not triggered', () => {
    const eng = mk();
    const res = eng.limitOrder('BTC/USDT', 'BUY', 1, 90, { action: 'BUY', confidence: 0.9 }, 100);
    assert.strictEqual(res.status, 'OPEN');
    assert.strictEqual(res.trade.status, 'OPEN');
    assert.strictEqual(res.trade.filledQty, 0);
  });

  test('limit order fills when the market crosses the limit price', () => {
    const eng = mk();
    const res = eng.limitOrder('BTC/USDT', 'SELL', 1, 105, { action: 'SELL', confidence: 0.9 }, 110);
    assert.strictEqual(res.status !== 'OPEN', true);
    assert.strictEqual(res.trade.status, 'FILLED');
  });

  test('stop-loss order rests when not triggered', () => {
    const eng = mk();
    const res = eng.stopLossOrder('BTC/USDT', 'SELL', 1, 95, { action: 'SELL', confidence: 0.9 }, 100);
    assert.strictEqual(res.status, 'OPEN');
  });

  test('stop-loss order triggers on a downward move', () => {
    const eng = mk();
    const res = eng.stopLossOrder('BTC/USDT', 'SELL', 1, 95, { action: 'SELL', confidence: 0.9 }, 94);
    assert.strictEqual(res.trade.status, 'FILLED');
  });
});

describe('P2 MLSignalBridge', () => {
  test('BUY signal above threshold produces a market order', () => {
    const eng = new P2ExecutionEngine(new StubEngine());
    const bridge = new MLSignalBridge(eng);
    const res = bridge.signalToOrder({ action: 'BUY', confidence: 0.9, regime: 'TRENDING_UP' }, 'BTC/USDT', 100, { size: 2 });
    assert.strictEqual(res.success, true);
  });

  test('low-confidence signal is rejected', () => {
    const bridge = new MLSignalBridge(new P2ExecutionEngine(new StubEngine()));
    const res = bridge.signalToOrder({ action: 'BUY', confidence: 0.1 }, 'BTC/USDT', 100);
    assert.strictEqual(res.success, false);
    assert.match(res.reason, /below threshold/);
  });

  test('HOLD produces no order', () => {
    const bridge = new MLSignalBridge(new P2ExecutionEngine(new StubEngine()));
    const res = bridge.signalToOrder({ action: 'HOLD', confidence: 0.9 }, 'BTC/USDT', 100);
    assert.strictEqual(res.success, false);
    assert.match(res.reason, /HOLD/);
  });
});

describe('P2 PerformanceAnalytics', () => {
  test('returns zero metrics with no trades', () => {
    const m = new PerformanceAnalytics([]).getMetrics();
    assert.strictEqual(m.totalTrades, 0);
    assert.strictEqual(m.sharpe, 0);
    assert.strictEqual(m.maxDrawdown, 0);
  });

  test('computes sharpe, win rate, profit factor, and accuracy', () => {
    const trades = [
      { pnl: 1000, isWin: true },
      { pnl: 500, isWin: true },
      { pnl: -300, isWin: false },
    ];
    const m = new PerformanceAnalytics(trades).getMetrics();
    assert.strictEqual(m.totalTrades, 3);
    assert.strictEqual(m.winRate, 2 / 3);
    assert.strictEqual(m.accuracy, 2 / 3);
    assert.strictEqual(m.profitFactor, (1000 + 500) / 300);
    assert.strictEqual(m.totalPnl, 1200);
  });
});

describe('P2 ReportGenerator', () => {
  test('generates a daily report with recommendations', () => {
    const report = new ReportGenerator([{ pnl: 100, isWin: true }, { pnl: -50, isWin: false }]).generateReport('daily');
    assert.strictEqual(report.period, 'daily');
    assert.ok(report.metrics.totalTrades === 2);
    assert.ok(Array.isArray(report.recommendations));
  });
});

describe('P2 BacktestHarness', () => {
  test('runs a full backtest with the P2 engine and returns metrics', () => {
    const engine = new P2ExecutionEngine(new StubEngine());
    const harness = new BacktestHarness(engine);
    const candles = candleSeries();
    const signals = candles.slice(0, 30).map(() => ({
      action: 'BUY',
      confidence: 0.9,
      regime: 'TRENDING_UP',
    }));
    const result = harness.run(candles, signals);
    assert.ok(result.metrics.totalTrades >= 0);
    assert.ok(Number.isFinite(result.finalEquity));
    assert.ok(Array.isArray(result.equityCurve));
  });

  test('derives compatibility PnL from the next bar path rather than forecast alignment', () => {
    const harness = new BacktestHarness(new P2ExecutionEngine(new StubEngine()));
    const bars = [
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { timestamp: 2, open: 100, high: 111, low: 99, close: 110, volume: 100 },
    ];
    const result = harness.run(bars, [{ action: 'BUY', confidence: 0 }]);
    assert.ok(result.trades[0].netPnl > 0);
    assert.equal(result.trades[0].reason, 'NEXT_BAR_PRICE_PATH');
  });
});

describe('P2 Resilience (no external infra)', () => {
  test('RedisCache falls back to in-memory when Redis is unavailable', async () => {
    const cache = new RedisCache('redis://127.0.0.1:1', { disabled: false, ttlCheckMs: 50 });
    await cache.setTicker('TEST', { price: 100 });
    const ticker = await cache.getTicker('TEST');
    assert.strictEqual(ticker.price, 100);
    await cache.close();
  });

  test('TradeRepository persists to memory when PostgreSQL is unavailable', async () => {
    process.env.DATABASE_DISABLED = 'true';
    const repo = new TradeRepository();
    await repo.ready;
    await repo.saveTrade({
      id: 'tr-1', timestamp: Date.now(), symbol: 'BTC/USDT',
      action: 'BUY', quantity: 1, entryPrice: 100, pnl: 10, isWin: true, reason: 'test',
    });
    const trades = await repo.getRecentTrades(10);
    assert.strictEqual(trades.length, 1);
    assert.strictEqual(await repo.count(), 1);
    delete process.env.DATABASE_DISABLED;
    await repo.close();
  });
});

describe('P2 API integration', () => {
  test('backtest endpoint runs and returns metrics', async () => {
    const res = await request(app).post('/api/paper-trading/p2/backtest').send({
      candles: candleSeries(),
      signals: candleSeries().slice(0, 30).map(() => ({ action: 'BUY', confidence: 0.9 })),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.metrics.totalTrades >= 0);
  });

  test('backtest rejects empty inputs', async () => {
    const res = await request(app).post('/api/paper-trading/p2/backtest').send({ candles: [] });
    assert.strictEqual(res.status, 400);
  });

  test('order book endpoints work', async () => {
    const seed = await request(app).post('/api/paper-trading/p2/orderbook').send({
      bids: [{ price: 99, qty: 5 }], asks: [{ price: 101, qty: 5 }],
    });
    assert.strictEqual(seed.status, 200);
    const depth = await request(app).get('/api/paper-trading/p2/orderbook');
    assert.strictEqual(depth.body.data.bestBid, 99);
    assert.strictEqual(depth.body.data.bestAsk, 101);
  });

  test('order state machine endpoints create, fill, and cancel orders', async () => {
    const create = await request(app).post('/api/paper-trading/p2/orders').send({
      symbol: 'BTC/USDT', action: 'BUY', qty: 5,
    });
    assert.strictEqual(create.status, 200);
    const id = create.body.data.id;
    const fill = await request(app).post('/api/paper-trading/p2/orders/fill').send({ id, filledQty: 5, fillPrice: 100 });
    assert.strictEqual(fill.body.data.status, 'FILLED');
    const list = await request(app).get('/api/paper-trading/p2/orders');
    assert.ok(list.body.data.some(o => o.id === id));
  });

  test('trade repository endpoints persist a trade', async () => {
    process.env.DATABASE_DISABLED = 'true';
    const save = await request(app).post('/api/paper-trading/p2/trades/save').send({
      trade: { id: 'api-tr', timestamp: Date.now(), symbol: 'BTC/USDT', action: 'BUY', quantity: 1, entryPrice: 100, pnl: 5, isWin: true, reason: 'api test' },
    });
    assert.strictEqual(save.status, 200);
    const list = await request(app).get('/api/paper-trading/p2/trades');
    assert.ok(list.body.data.some(t => t.id === 'api-tr'));
    delete process.env.DATABASE_DISABLED;
  });

  test('tick processing endpoint computes VWAP', async () => {
    await request(app).post('/api/paper-trading/p2/data/tick').send({ price: 100, volume: 1 });
    await request(app).post('/api/paper-trading/p2/data/tick').send({ price: 200, volume: 1 });
    const res = await request(app).get('/api/paper-trading/p2/data/tick');
    assert.strictEqual(res.body.data.vwap, 150);
  });

  test('strategy endpoint saves and reads configuration', async () => {
    const set = await request(app).post('/api/paper-trading/p2/strategy').send({
      model: 'TCN', size: 0.05, stopLoss: 0.03, takeProfit: 0.06, confidenceThreshold: 0.7,
    });
    assert.strictEqual(set.status, 200);
    assert.strictEqual(set.body.config.confidenceThreshold, 0.7);
    assert.strictEqual(set.body.config.model, 'TCN');
    assert.strictEqual(set.body.config.size, 0.05);

    const get = await request(app).get('/api/paper-trading/p2/strategy');
    assert.strictEqual(get.status, 200);
    assert.strictEqual(get.body.config.model, 'TCN');

    // Reset to a neutral config for the rest of the suite.
    await request(app).post('/api/paper-trading/p2/strategy').send({ model: 'PPO', confidenceThreshold: 0.6, size: 1 });
  });

  test('strategy confidence threshold is enforced by the ML bridge', async () => {
    await request(app).post('/api/paper-trading/p2/strategy').send({ confidenceThreshold: 0.9 });
    // Confidence 0.8 is below the configured 0.9 threshold -> rejected.
    const low = await request(app).post('/api/paper-trading/p2/execute-ml').send({
      signal: { action: 'BUY', confidence: 0.8 },
      symbol: 'BTC/USDT', marketPrice: 65000,
    });
    assert.strictEqual(low.body.data.success, false);
    // Reset threshold.
    await request(app).post('/api/paper-trading/p2/strategy').send({ confidenceThreshold: 0.6 });
  });
});

describe('P2 PaperTradingEngine wiring', () => {
  test('_ensureP2 initializes all P2 singletons', () => {
    const eng = new PaperTradingEngine();
    const exec = eng._ensureP2();
    assert.ok(exec instanceof P2ExecutionEngine);
    assert.ok(eng.mlBridge instanceof MLSignalBridge);
    assert.ok(eng.orderBook instanceof OrderBookSimulator);
    assert.ok(eng.orderStateMachine instanceof OrderStateMachine);
    assert.ok(eng.backtestHarness instanceof BacktestHarness);
    assert.ok(eng.tradeRepository instanceof TradeRepository);
    assert.ok(eng.cache instanceof RedisCache);
  });
});
