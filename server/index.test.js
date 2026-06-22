import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import nock from 'nock';
import { WebSocket } from 'ws';

process.env.JWT_SECRET = 'test-secret';
process.env.PORT = 3002;

// Mock external api
nock('http://cdn.tsetmc.com')
  .persist()
  .get(/api\/Instrument\/GetInstrumentHistory\/.*/)
  .reply(200, {
    instrumentHistory: [
      { date: '2023-01-01', openPrice: 100, highPrice: 110, lowPrice: 90, closingPrice: 105, volume: 1000, count: 50 }
    ]
  });

const { app, server, wss, interval, broadcastInterval } = await import('./index.js');

describe('Server Integration Tests', () => {
  after(() => {
    clearInterval(interval);
    clearInterval(broadcastInterval);
    server.close();
    wss.close();
    nock.cleanAll();
  });

  test('GET /api/status should return status', async () => {
    const response = await request(app).get('/api/status');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'Online');
    assert.strictEqual(response.body.service, 'TSE Proxy Gateway Server');
  });

  test('GET /api/market/:symbol should return market data from API', async () => {
    const response = await request(app).get('/api/market/SAF1403');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.data);
    assert.strictEqual(response.body.source, 'TSETMC_API');
    assert.strictEqual(response.body.data[0].open, 100);
  });

  test('GET /api/market/:symbol should fallback to simulation if API fails', async () => {
    nock.cleanAll();
    nock('http://cdn.tsetmc.com')
      .persist()
      .get(/api\/Instrument\/GetInstrumentHistory\/.*/)
      .replyWithError('API down');

    const response = await request(app).get('/api/market/SAF1403');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.data);
    assert.strictEqual(response.body.source, 'PROFESSIONAL_SIM');
  });

  test('GET /api/orderbook/:symbol should return orderbook data', async () => {
    const response = await request(app).get('/api/orderbook/SAF1403');
    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(response.body.bids));
    assert.ok(Array.isArray(response.body.asks));
    assert.ok('timestamp' in response.body);
  });

  test('WebSocket should connect and receive market data', () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3002?symbol=GOLD');

      let messagesReceived = 0;

      ws.on('open', () => {
        // Connected
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'ORDER_BOOK' || msg.type === 'TRADE_TICK' || msg.type === 'PRICE_CHANGE') {
          messagesReceived++;
        }

        if (messagesReceived >= 3) {
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });

      // Timeout just in case
      setTimeout(() => {
        ws.close();
        if (messagesReceived > 0) resolve();
        else reject(new Error('No messages received'));
      }, 1000);
    });
  });
});
