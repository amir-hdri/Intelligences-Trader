import pg from 'pg';

/**
 * PostgreSQL Trade Repository for P2.
 *
 * Persists paper trades to PostgreSQL when a DATABASE_URL is configured and
 * reachable; otherwise falls back to an in-memory store so the engine remains
 * functional without infrastructure (tests, local dev).
 */
export class TradeRepository {
  // Cap for the in-memory fallback so long-lived processes cannot grow
  // without bound.
  static MAX_MEMORY_TRADES = 5000;

  constructor() {
    this.dbEnabled = false;
    this.pool = null;
    this.memory = [];
    this.ready = Promise.resolve();
    this.ready = this._init();
  }

  async _init() {
    // No credential-bearing default: without an explicit DATABASE_URL the
    // repository stays in memory mode instead of dialing a fake localhost DSN.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || process.env.DATABASE_DISABLED === 'true') return;

    try {
      this.pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 1000 });
      // An idle-client backend failure emits 'error' on the Pool itself;
      // without a listener it crashes the whole process.
      this.pool.on('error', (err) => {
        console.error('[TradeRepository] PostgreSQL pool error:', err?.message || err);
      });
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS paper_trades (
          id TEXT PRIMARY KEY,
          timestamp BIGINT,
          symbol TEXT,
          action TEXT,
          quantity NUMERIC,
          entry_price NUMERIC,
          pnl NUMERIC,
          is_win BOOLEAN,
          reason TEXT
        )
      `);
      this.dbEnabled = true;
    } catch {
      this.dbEnabled = false;
      this.pool = null;
    }
  }

  async saveTrade(trade) {
    if (!trade || !trade.id) throw new TypeError('trade requires an id');

    if (this.dbEnabled && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO paper_trades (id, timestamp, symbol, action, quantity, entry_price, pnl, is_win, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
          [
            trade.id, trade.timestamp, trade.symbol, trade.action,
            trade.quantity, trade.entryPrice, trade.pnl, trade.isWin, trade.reason,
          ]
        );
        return;
      } catch {
        // fall through to memory
      }
    }

    if (!this.memory.some(t => t.id === trade.id)) {
      this.memory.push({
        id: trade.id,
        timestamp: trade.timestamp,
        symbol: trade.symbol,
        action: trade.action,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        pnl: trade.pnl,
        isWin: trade.isWin,
        reason: trade.reason,
      });
      if (this.memory.length > TradeRepository.MAX_MEMORY_TRADES) {
        this.memory.shift();
      }
    }
  }

  async getRecentTrades(limit = 100) {
    if (this.dbEnabled && this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM paper_trades ORDER BY timestamp DESC LIMIT $1',
          [limit]
        );
        return res.rows;
      } catch {
        // fall through to memory
      }
    }
    return this.memory.slice(-limit).reverse();
  }

  async count() {
    if (this.dbEnabled && this.pool) {
      try {
        const res = await this.pool.query('SELECT COUNT(*) AS c FROM paper_trades');
        return Number(res.rows[0].c);
      } catch {
        // fall through
      }
    }
    return this.memory.length;
  }

  async close() {
    if (this.pool) {
      try { await this.pool.end(); } catch { /* ignore */ }
    }
  }
}
