import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

const previous = {
  AUTH_REQUIRED: process.env.AUTH_REQUIRED,
  JWT_SECRET: process.env.JWT_SECRET,
  REFRESH_SECRET: process.env.REFRESH_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  DATABASE_DISABLED: process.env.DATABASE_DISABLED,
  REDIS_DISABLED: process.env.REDIS_DISABLED,
};
process.env.AUTH_REQUIRED = 'true';
process.env.JWT_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
process.env.ADMIN_USERNAME = 'audit-admin';
process.env.ADMIN_PASSWORD = 'correct horse battery staple';
process.env.DATABASE_DISABLED = 'true';
process.env.REDIS_DISABLED = 'true';

const { app } = await import(`./index.js?auth-test=${Date.now()}`);

const candles = Array.from({ length: 35 }, (_, index) => ({
  timestamp: Date.UTC(2024, 0, 1) + index * 60_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 1_000,
}));

after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('secured API mode', () => {
  test('keeps health public and applies defensive response headers', async () => {
    const response = await request(app).get('/api/status');
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
  });

  test('rejects missing, malformed, and invalid bearer credentials', async () => {
    assert.equal((await request(app).get('/api/positions')).status, 401);
    assert.equal((await request(app).get('/api/positions').set('Authorization', 'Basic abc')).status, 401);
    assert.equal((await request(app).get('/api/positions').set('Authorization', 'Bearer invalid')).status, 403);
    assert.equal((await request(app).post('/api/paper-trading/execute').send({})).status, 401);
  });

  test('logs in, authorizes all API routes, and refreshes an access token', async () => {
    const failed = await request(app).post('/api/auth/login').send({ username: 'audit-admin', password: 'wrong' });
    assert.equal(failed.status, 401);

    const login = await request(app).post('/api/auth/login').send({
      username: 'audit-admin',
      password: 'correct horse battery staple',
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers['cache-control'], 'no-store');
    assert.equal(login.body.tokenType, 'Bearer');
    assert.equal(typeof login.body.accessToken, 'string');
    assert.equal(typeof login.body.refreshToken, 'string');

    const analysis = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ historyData: candles });
    assert.equal(analysis.status, 200);

    const positions = await request(app)
      .get('/api/positions')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.equal(positions.status, 200);
    assert.equal(positions.body.simulated, true);
    assert.deepEqual(positions.body.data, []);

    const refresh = await request(app).post('/api/auth/refresh').send({ token: login.body.refreshToken });
    assert.equal(refresh.status, 200);
    assert.equal(refresh.headers['cache-control'], 'no-store');
    assert.equal(typeof refresh.body.accessToken, 'string');
  });
});
