import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import nock from 'nock';
import { WebSocket } from 'ws';
import { app, startServer, stopServer } from './index.js';

const historyResponse = {
  instrumentHistory: [
    { date: 20230101, openPrice: 100, highPrice: 110, lowPrice: 90, closingPrice: 105, volume: 1000, count: 50 },
  ],
};

describe('Proxy server integration', () => {
  let port;

  before(async () => {
    const server = startServer(0);
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    port = server.address().port;
  });

  beforeEach(() => nock.cleanAll());

  after(async () => {
    nock.cleanAll();
    await stopServer();
  });

  test('returns health and Prometheus metrics', async () => {
    const health = await request(app).get('/api/status');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'Online');
    assert.strictEqual(health.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(health.headers['x-frame-options'], 'DENY');

    const metrics = await request(app).get('/metrics');
    assert.strictEqual(metrics.status, 200);
    assert.match(metrics.text, /^# TYPE http_requests_total counter\nhttp_requests_total \d+/);
    assert.ok(!metrics.text.includes('\\n'), 'metrics must contain real newlines, not escaped text');
  });

  test('returns normalized external market history', async () => {
    nock('https://cdn.tsetmc.com')
      .get(/api\/Instrument\/GetInstrumentHistory\/.*/)
      .reply(200, historyResponse);

    const response = await request(app).get('/api/market/SAF1403');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.source, 'TSETMC_API');
    assert.strictEqual(response.body.simulated, false);
    assert.strictEqual(response.body.data[0].open, 100);
  });

  test('labels fallback data as simulated when the provider fails', async () => {
    nock('https://cdn.tsetmc.com')
      .get(/api\/Instrument\/GetInstrumentHistory\/.*/)
      .replyWithError('API down');

    const response = await request(app).get('/api/market/STEEL-SPOT');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.source, 'DIGITAL_TWIN');
    assert.strictEqual(response.body.simulated, true);
    assert.strictEqual(response.body.data.length, 100);
  });

  test('labels generated order-book depth as simulated', async () => {
    const response = await request(app).get('/api/orderbook/GOLD');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.source, 'DIGITAL_TWIN_ORDER_BOOK');
    assert.strictEqual(response.body.simulated, true);
    assert.ok(Array.isArray(response.body.data.bids));
    assert.ok(Array.isArray(response.body.data.asks));
  });

  test('rejects malformed symbols', async () => {
    const response = await request(app).get('/api/market/not%20valid');
    assert.strictEqual(response.status, 400);
  });

  test('WebSocket streams a normalized market batch', async () => {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?symbol=GOLD`);
      const messageTypes = new Set();
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timed out waiting for WebSocket market data'));
      }, 2_000);

      ws.on('message', data => {
        const message = JSON.parse(String(data));
        assert.strictEqual(message.data.simulated, true);
        assert.strictEqual(message.data.source, 'DIGITAL_TWIN_WEBSOCKET');
        messageTypes.add(message.type);
        if (messageTypes.has('ORDER_BOOK') && messageTypes.has('TRADE_TICK') && messageTypes.has('PRICE_CHANGE')) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });
  });
});
