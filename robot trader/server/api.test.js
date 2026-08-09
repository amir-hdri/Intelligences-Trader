import { describe, test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from './index.js';

const candles = Array.from({ length: 60 }, (_, index) => {
  const open = 100 + index * 0.1;
  const close = open + 0.05;
  return {
    timestamp: Date.now() - (60 - index) * 60_000,
    open,
    high: close + 0.1,
    low: open - 0.1,
    close,
    volume: 1_000 + index,
  };
});

describe('Analysis API integration', () => {
  test('reports service and model readiness state', async () => {
    const response = await request(app).get('/api/status');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'Online');
    assert.strictEqual(typeof response.body.modelReady, 'boolean');
  });

  test('returns a complete validated rule analysis', async () => {
    const response = await request(app).post('/api/analyze').send({ historyData: candles });
    assert.strictEqual(response.status, 200);
    assert.ok(['BUY', 'HOLD', 'SELL'].includes(response.body.prediction));
    assert.ok(response.body.confidence >= 0 && response.body.confidence <= 1);
    assert.ok(Number.isFinite(response.body.risk.valueAtRisk95));
  });

  test('rejects malformed OHLCV input', async () => {
    const response = await request(app).post('/api/analyze').send({
      historyData: [{ open: 100, high: 90, low: 110, close: 100, volume: -1 }],
    });
    assert.strictEqual(response.status, 400);
  });

  test('disables simulated advanced engines by default', async () => {
    const response = await request(app).post('/api/advanced/ensemble').send({ features: {} });
    assert.strictEqual(response.status, 501);
    assert.match(response.body.error, /disabled/);
  });

  test('keeps empty ledgers honest and labels paper data as simulated', async () => {
    const positions = await request(app).get('/api/positions?symbol=SAF1403');
    assert.strictEqual(positions.status, 200);
    assert.strictEqual(positions.body.simulated, true);
    assert.deepStrictEqual(positions.body.data, []);

    const model = await request(app).get('/api/models');
    assert.strictEqual(model.status, 200);
    assert.strictEqual(model.body.data.accuracy, null);

    const invalidPaper = await request(app).post('/api/paper-trading/execute').send({
      order: { action: 'BUY', symbol: 'SAF1403', qty: 0, entry: 100 },
      forecast: { action: 'BUY', confidence: 2 },
    });
    assert.strictEqual(invalidPaper.status, 400);
  });

  test('exports process metrics', async () => {
    const response = await request(app).get('/metrics');
    assert.strictEqual(response.status, 200);
    assert.match(response.text, /http_requests_total/);
    assert.match(response.text, /backtest_runs_running/);
    assert.match(response.text, /backtest_runs_queued/);
  });
});
