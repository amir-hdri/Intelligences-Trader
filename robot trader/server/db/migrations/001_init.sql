-- Intelligences-Trader — Database Schema (migration 001)
-- Runtime: node:sqlite (built-in, Node 22.13+ / 26). Zero native dependencies.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,          -- scrypt hash (hex)
    salt          TEXT    NOT NULL,          -- random salt (hex)
    role          TEXT    NOT NULL DEFAULT 'trader'
                  CHECK (role IN ('admin','trader','viewer')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_login_at TEXT
);

-- ---------------------------------------------------------------------------
-- Predictions (persisted forecast history; replaces localStorage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
    id              TEXT    PRIMARY KEY,     -- UUID generated server-side
    symbol          TEXT    NOT NULL,
    action          TEXT    NOT NULL CHECK (action IN ('BUY','SELL','HOLD')),
    entry_price     REAL    NOT NULL,
    target_price    REAL    NOT NULL,
    stop_loss       REAL    NOT NULL,
    confidence      REAL    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','WIN','LOSS','CANCELLED')),
    actual_outcome  REAL,
    indicators_json TEXT,                    -- rsi, macdHistogram, atr, regime
    reason          TEXT,
    weights_json    TEXT,                    -- strategy weights at decision time
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT,
    closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);

-- ---------------------------------------------------------------------------
-- Trades (order/fill ledger for auditability)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    side        TEXT    NOT NULL CHECK (side IN ('BUY','SELL')),
    quantity    REAL    NOT NULL DEFAULT 0,
    entry_price REAL    NOT NULL,
    exit_price  REAL,
    status      TEXT    NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
    pnl         REAL,
    strategy    TEXT,
    opened_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- ---------------------------------------------------------------------------
-- Audit events (append-only; correlates with AuditLogger file output)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT    NOT NULL,            -- LOGIN_SUCCESS, LOGIN_FAILED, ...
    username    TEXT,
    ip          TEXT,
    correlation_id TEXT,
    details_json TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);

-- ---------------------------------------------------------------------------
-- Key-value settings (persisted app configuration)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- Market snapshots (persisted last-price samples for reporting/replay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_snapshots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol    TEXT    NOT NULL,
    price     REAL    NOT NULL,
    source    TEXT    NOT NULL DEFAULT 'simulation',
    captured_at TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON market_snapshots(symbol);
