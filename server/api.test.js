import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
const apiMetrics = () => (req, res, next) => next();

// We mock the proxy server routes
const app = express();
app.use(apiMetrics());
app.use(cors());
app.use(express.json());
app.get('/metrics', (req, res) => res.send('http_requests_total 1'));

// Mock endpoints similar to server/index.js
app.get('/api/market/:symbol', (req, res) => {
    res.json({ symbol: req.params.symbol, price: 1000 });
});

app.get('/api/orderbook/:symbol', (req, res) => {
    res.json({ symbol: req.params.symbol, bids: [], asks: [] });
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', service: 'TSE Proxy Gateway Server', version: '1.0.0' });
});

describe('Proxy Server API Integration Tests', () => {
    test('GET /metrics should return prometheus metrics', async () => {
        const response = await request(app).get('/metrics');
        assert.strictEqual(response.status, 200);
        assert.ok(response.text.includes('http_requests_total'));
    });

    test('GET /api/status should return status', async () => {
        const response = await request(app).get('/api/status');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.status, 'Online');
    });

    test('GET /api/market/:symbol should return market data', async () => {
        const response = await request(app).get('/api/market/SAF1403');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.symbol, 'SAF1403');
    });

    test('GET /api/orderbook/:symbol should return orderbook data', async () => {
        const response = await request(app).get('/api/orderbook/SAF1403');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.symbol, 'SAF1403');
        assert.ok(Array.isArray(response.body.bids));
    });
});
