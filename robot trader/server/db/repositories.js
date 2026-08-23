/**
 * Intelligences-Trader — Repository layer (thin data-access over node:sqlite).
 *
 * Each function maps one domain entity to the database and back, keeping the
 * HTTP routes free of raw SQL. All writes are transactional where relevant.
 */
import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------
export function insertPrediction(db, p) {
  const id = p.id || randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO predictions
       (id, symbol, action, entry_price, target_price, stop_loss, confidence,
        status, indicators_json, reason, weights_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    p.symbol,
    p.action,
    p.entryPrice,
    p.targetPrice,
    p.stopLoss,
    p.confidence,
    p.status || 'PENDING',
    p.indicators ? JSON.stringify(p.indicators) : null,
    p.reason || null,
    p.weights ? JSON.stringify(p.weights) : null,
    ts
  );
  return id;
}

export function listPredictions(db, { symbol = null, status = null, limit = 100 } = {}) {
  let sql = `SELECT * FROM predictions`;
  const clauses = [];
  const args = [];
  if (symbol) { clauses.push('symbol = ?'); args.push(symbol); }
  if (status) { clauses.push('status = ?'); args.push(status); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(limit);
  return db.prepare(sql).all(...args).map(parsePrediction);
}

export function updatePredictionStatus(db, id, status, actualOutcome) {
  const ts = now();
  db.prepare(
    `UPDATE predictions
     SET status = ?, actual_outcome = ?, updated_at = ?, closed_at = ?
     WHERE id = ?`
  ).run(status, actualOutcome ?? null, ts, ts, id);
}

function parsePrediction(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    action: row.action,
    entryPrice: row.entry_price,
    targetPrice: row.target_price,
    stopLoss: row.stop_loss,
    confidence: row.confidence,
    status: row.status,
    actualOutcome: row.actual_outcome,
    indicators: row.indicators_json ? safeParse(row.indicators_json) : null,
    reason: row.reason,
    weights: row.weights_json ? safeParse(row.weights_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------
export function insertTrade(db, t) {
  const info = db.prepare(
    `INSERT INTO trades (symbol, side, quantity, entry_price, status, strategy)
     VALUES (?, ?, ?, ?, 'OPEN', ?)`
  ).run(t.symbol, t.side, t.quantity ?? 0, t.entryPrice, t.strategy ?? null);
  return Number(info.lastInsertRowid);
}

export function closeTrade(db, id, { exitPrice, status = 'CLOSED' }) {
  const trade = db.prepare(`SELECT * FROM trades WHERE id = ?`).get(id);
  if (!trade) return null;
  let pnl = null;
  if (exitPrice != null) {
    pnl = trade.side === 'BUY'
      ? (exitPrice - trade.entry_price) * trade.quantity
      : (trade.entry_price - exitPrice) * trade.quantity;
  }
  db.prepare(
    `UPDATE trades SET exit_price = ?, status = ?, pnl = ?, closed_at = ? WHERE id = ?`
  ).run(exitPrice ?? null, status, pnl, now(), id);
  return { ...trade, exit_price: exitPrice, status, pnl };
}

export function listTrades(db, { symbol = null, limit = 100 } = {}) {
  let sql = `SELECT * FROM trades`;
  const args = [];
  if (symbol) { sql += ' WHERE symbol = ?'; args.push(symbol); }
  sql += ' ORDER BY opened_at DESC LIMIT ?';
  args.push(limit);
  return db.prepare(sql).all(...args);
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------
export function listAuditEvents(db, { limit = 100 } = {}) {
  return db.prepare(
    `SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
}

// ---------------------------------------------------------------------------
// Market snapshots
// ---------------------------------------------------------------------------
export function insertSnapshot(db, { symbol, price, source = 'simulation' }) {
  db.prepare(
    `INSERT INTO market_snapshots (symbol, price, source) VALUES (?, ?, ?)`
  ).run(symbol, price, source);
}

export function latestSnapshots(db, limit = 50) {
  return db.prepare(
    `SELECT * FROM market_snapshots ORDER BY id DESC LIMIT ?`
  ).all(limit);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function getSetting(db, key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, typeof value === 'string' ? value : JSON.stringify(value), now());
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
