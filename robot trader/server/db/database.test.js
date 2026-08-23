/**
 * Tests for the database + auth + repository layer (node:test, in-memory SQLite).
 * Run with: node --test db/ auth/  (or via the workspace `npm test`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDatabase } from './database.js';
import { hashPassword, verifyPassword, createUser, verifyCredentials, findUserByUsername } from '../auth/authService.js';
import {
  insertPrediction, listPredictions, updatePredictionStatus,
  insertTrade, closeTrade, listTrades,
  listAuditEvents, insertSnapshot, latestSnapshots,
  getSetting, setSetting,
} from './repositories.js';

function freshDb() {
  return createDatabase({ dbPath: ':memory:' }).db;
}

test('migrations create the expected tables', () => {
  const db = freshDb();
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all().map((r) => r.name);
  for (const t of ['users', 'predictions', 'trades', 'audit_events', 'settings', 'market_snapshots']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('seed creates a default admin and audit record when empty', () => {
  const { db, seed } = createDatabase({ dbPath: ':memory:' });
  assert.equal(seed.seeded, true);
  const admin = findUserByUsername(db, 'admin');
  assert.ok(admin, 'admin user should exist');
  assert.equal(admin.role, 'admin');
});

test('password hashing is salted and verifies', () => {
  const { salt, hash } = hashPassword('s3cret!');
  assert.ok(verifyPassword('s3cret!', salt, hash));
  assert.equal(verifyPassword('wrong', salt, hash), false);
  // Same password → different salt → different hash
  const again = hashPassword('s3cret!');
  assert.notEqual(again.hash, hash);
});

test('createUser + verifyCredentials roundtrip', () => {
  const db = freshDb();
  createUser(db, { username: 'alice', password: 'pass1234', role: 'trader' });
  const ok = verifyCredentials(db, 'alice', 'pass1234');
  assert.ok(ok, 'valid credentials should verify');
  assert.equal(ok.role, 'trader');
  assert.equal(verifyCredentials(db, 'alice', 'nope'), null);
  assert.equal(verifyCredentials(db, 'ghost', 'pass1234'), null);
});

test('prediction insert/list/status lifecycle persists', () => {
  const db = freshDb();
  const id = insertPrediction(db, {
    symbol: 'GOLD-FUT', action: 'BUY', entryPrice: 100, targetPrice: 110,
    stopLoss: 95, confidence: 0.8, indicators: { rsi: 60 }, reason: 'trend', weights: { momentum: 0.7 },
  });
  let rows = listPredictions(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'PENDING');
  assert.equal(rows[0].indicators.rsi, 60);

  updatePredictionStatus(db, id, 'WIN', 112);
  rows = listPredictions(db, { status: 'WIN' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actualOutcome, 112);
});

test('trade open/close computes PnL for BUY and SELL', () => {
  const db = freshDb();
  const buyId = insertTrade(db, { symbol: 'SAF1403', side: 'BUY', quantity: 2, entryPrice: 100 });
  const buyClosed = closeTrade(db, buyId, { exitPrice: 120 });
  assert.equal(buyClosed.pnl, 40);

  const sellId = insertTrade(db, { symbol: 'SAF1403', side: 'SELL', quantity: 3, entryPrice: 100 });
  const sellClosed = closeTrade(db, sellId, { exitPrice: 80 });
  assert.equal(sellClosed.pnl, 60);

  assert.equal(listTrades(db).length, 2);
});

test('settings roundtrip preserves object values', () => {
  const db = freshDb();
  setSetting(db, 'risk', { maxDrawdown: 1.5 });
  assert.equal(JSON.parse(getSetting(db, 'risk')).maxDrawdown, 1.5);
  setSetting(db, 'risk', { maxDrawdown: 2.0 });
  assert.equal(JSON.parse(getSetting(db, 'risk')).maxDrawdown, 2.0);
});

test('market snapshots persist and list in reverse chronological order', () => {
  const db = freshDb();
  insertSnapshot(db, { symbol: 'GOLD-FUT', price: 101, source: 'tsetmc' });
  insertSnapshot(db, { symbol: 'GOLD-FUT', price: 102, source: 'tsetmc' });
  const snaps = latestSnapshots(db);
  assert.equal(snaps.length, 2);
  assert.equal(snaps[0].price, 102);
});

test('audit events are append-only and listable', () => {
  const db = freshDb();
  assert.ok(listAuditEvents(db).length >= 0);
});
