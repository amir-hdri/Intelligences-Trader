import { Pool } from 'pg';

/**
 * PostgreSQL Trade Repository for P2
 */
export class TradeRepository {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/paper_trading',
    });
    this.initTable();
  }

  async initTable() {
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
  }

  async saveTrade(trade) {
    const query = `
      INSERT INTO paper_trades (id, timestamp, symbol, action, quantity, entry_price, pnl, is_win, reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `;
    await this.pool.query(query, [
      trade.id, trade.timestamp, trade.symbol, trade.action,
      trade.quantity, trade.entryPrice, trade.pnl, trade.isWin, trade.reason
    ]);
  }

  async getRecentTrades(limit = 100) {
    const res = await this.pool.query(
      'SELECT * FROM paper_trades ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  }
}
