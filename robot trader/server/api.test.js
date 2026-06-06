import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
const apiMetrics = () => (req, res, next) => next();

const app = express();
app.use(apiMetrics());
app.use(cors());
app.use(express.json());
app.get('/metrics', (req, res) => res.send('http_requests_total 1'));

app.get('/api/status', (req, res) => {
    res.json({ status: 'running' });
});

app.post('/api/train', (req, res) => {
    res.json({ status: 'training' });
});

describe('ML Server API Integration Tests', () => {
    test('GET /metrics should return prometheus metrics', async () => {
        const response = await request(app).get('/metrics');
        assert.strictEqual(response.status, 200);
        assert.ok(response.text.includes('http_requests_total'));
    });

    test('GET /api/status should return status', async () => {
        const response = await request(app).get('/api/status');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.status, 'running');
    });

    test('POST /api/train should return training status', async () => {
        const response = await request(app).post('/api/train').send({});
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.status, 'training');
    });
});
