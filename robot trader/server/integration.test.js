/**
 * End-to-end integration test for the auth + persistence HTTP layer.
 *
 * Boots the real server (index.js) as a child process with an in-memory DB
 * and verifies the env-admin login → save → list → evaluate → audit flow,
 * including authorization (401 without token, 403 for non-admin audit).
 *
 * Auth model (merged): /api/auth/login is env-based (ADMIN_USERNAME/ADMIN_PASSWORD,
 * role 'admin'); /api/auth/register provisions DB users for provisioning/audit.
 * Stateful persistence endpoints require a Bearer token via authenticateToken.
 *
 * Run: node --test integration.test.js   (or via `npm test`)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'integration_jwt_secret_0123456789abcdef';

let child;

async function waitForStatus(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('Server did not become ready in time');
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

async function adminToken() {
  const login = await api('POST', '/api/auth/login', { body: { username: 'itadmin', password: 'itadminpass123' } });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  return login.json.accessToken;
}

before(async () => {
  child = spawn(process.execPath, ['index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: ':memory:',
      JWT_SECRET,
      REFRESH_SECRET: 'integration_refresh_secret_0123456789abcdef',
      ADMIN_USERNAME: 'itadmin',
      ADMIN_PASSWORD: 'itadminpass123',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('exit', (code) => { if (code) console.error('server stderr:', stderr.slice(-2000)); });
  await waitForStatus();
});

after(async () => {
  if (child) child.kill('SIGTERM');
});

test('status reports database connected', async () => {
  const status = await waitForStatus();
  assert.equal(status.database, 'connected');
});

test('register provisions users; login is env-based', async () => {
  const reg = await api('POST', '/api/auth/register', { body: { username: 'trader1', password: 'securepass123' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));

  const dup = await api('POST', '/api/auth/register', { body: { username: 'trader1', password: 'securepass123' } });
  assert.equal(dup.status, 409);

  // Env-based login: only the configured admin authenticates.
  const adminOk = await api('POST', '/api/auth/login', { body: { username: 'itadmin', password: 'itadminpass123' } });
  assert.equal(adminOk.status, 200);
  assert.ok(adminOk.json.accessToken);
  assert.ok(adminOk.json.refreshToken);

  const wrongPass = await api('POST', '/api/auth/login', { body: { username: 'itadmin', password: 'wrongpass' } });
  assert.equal(wrongPass.status, 401);
});

test('predictions roundtrip with admin token', async () => {
  const token = await adminToken();

  const save = await api('POST', '/api/predictions', {
    token,
    body: { symbol: 'GOLD-FUT', action: 'BUY', entryPrice: 100, targetPrice: 110, stopLoss: 95, confidence: 0.8, indicators: { rsi: 55 } },
  });
  assert.equal(save.status, 201, JSON.stringify(save.json));
  assert.ok(save.json.id);

  const list = await api('GET', '/api/predictions', { token });
  assert.equal(list.status, 200);
  assert.equal(list.json.predictions.length, 1);
  assert.equal(list.json.predictions[0].status, 'PENDING');

  const evalRes = await api('POST', '/api/predictions/evaluate', { token, body: { symbol: 'GOLD-FUT', currentPrice: 115 } });
  assert.equal(evalRes.status, 200);
  assert.equal(evalRes.json.settled, 1);

  const afterEval = await api('GET', '/api/predictions', { token });
  assert.equal(afterEval.json.predictions[0].status, 'WIN');
  assert.equal(afterEval.json.predictions[0].actualOutcome, 115);
});

test('authorization is enforced', async () => {
  // No token → 401
  const noToken = await api('GET', '/api/predictions');
  assert.equal(noToken.status, 401);

  // Non-admin (trader) cannot read audit → 403
  const traderToken = jwt.sign({ name: 'trader1', role: 'trader' }, JWT_SECRET, { algorithm: 'HS256' });
  const traderAudit = await api('GET', '/api/audit', { token: traderToken });
  assert.equal(traderAudit.status, 403);

  // Admin can read audit and sees prior register/login events
  const token = await adminToken();
  const adminAudit = await api('GET', '/api/audit', { token });
  assert.equal(adminAudit.status, 200);
  assert.ok(adminAudit.json.events.length > 0);
});

test('trade open/close persists PnL', async () => {
  const token = await adminToken();

  const open = await api('POST', '/api/trades', { token, body: { symbol: 'SAF1403', side: 'BUY', quantity: 2, entryPrice: 100 } });
  assert.equal(open.status, 201);
  const tradeId = open.json.id;

  const close = await api('POST', `/api/trades/${tradeId}/close`, { token, body: { exitPrice: 120 } });
  assert.equal(close.status, 200);
  assert.equal(close.json.trade.pnl, 40);
});
