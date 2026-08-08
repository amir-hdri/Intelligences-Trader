import pg from 'pg';
import { cloneJson } from '../domain/canonical.js';

/**
 * Durable repository for immutable Phase-1 dataset snapshots and backtest runs.
 * PostgreSQL is used when DATABASE_URL is configured; local/test environments
 * use the same contract backed by process memory.
 */
export class BacktestRepository {
  constructor({ connectionString = process.env.DATABASE_URL, disabled = process.env.DATABASE_DISABLED === 'true' } = {}) {
    this.datasets = new Map();
    this.runs = new Map();
    this.pool = null;
    this.dbEnabled = false;
    this.ready = this._initialize(connectionString, disabled);
  }

  async _initialize(connectionString, disabled) {
    if (disabled || !connectionString) return;
    let pool;
    try {
      pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 1500, max: 5 });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS backtest_datasets (
          id TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          payload JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS backtest_runs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE,
          payload JSONB NOT NULL
        );
        ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS backtest_runs_created_at_idx
          ON backtest_runs (created_at DESC);
      `);
      this.pool = pool;
      this.dbEnabled = true;
    } catch {
      if (pool) {
        try { await pool.end(); } catch { /* best-effort cleanup */ }
      }
      this.pool = null;
      this.dbEnabled = false;
    }
  }

  async saveDataset(dataset) {
    await this.ready;
    const copy = cloneJson(dataset);
    if (this.dbEnabled) {
      const existing = await this.pool.query('SELECT content_hash FROM backtest_datasets WHERE id = $1', [copy.id]);
      if (existing.rowCount && existing.rows[0].content_hash !== copy.contentHash) {
        throw new Error(`Dataset snapshot ${copy.id} is immutable and already has different content`);
      }
      const inserted = await this.pool.query(
        `INSERT INTO backtest_datasets (id, content_hash, schema_version, created_at, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO NOTHING
         RETURNING payload`,
        [copy.id, copy.contentHash, copy.schemaVersion, copy.createdAt, JSON.stringify(copy)],
      );
      if (inserted.rowCount) return inserted.rows[0].payload;
      const winner = await this.pool.query('SELECT content_hash, payload FROM backtest_datasets WHERE id = $1', [copy.id]);
      if (!winner.rowCount || winner.rows[0].content_hash !== copy.contentHash) {
        throw new Error(`Dataset snapshot ${copy.id} is immutable and already has different content`);
      }
      return winner.rows[0].payload;
    }

    const existing = this.datasets.get(copy.id);
    if (existing && existing.contentHash !== copy.contentHash) {
      throw new Error(`Dataset snapshot ${copy.id} is immutable and already has different content`);
    }
    if (!existing) this.datasets.set(copy.id, copy);
    return cloneJson(existing || copy);
  }

  async getDataset(id) {
    await this.ready;
    if (this.dbEnabled) {
      const result = await this.pool.query('SELECT payload FROM backtest_datasets WHERE id = $1', [id]);
      return result.rowCount ? result.rows[0].payload : null;
    }
    return cloneJson(this.datasets.get(id) || null);
  }

  async saveRun(run) {
    await this.ready;
    const copy = cloneJson(run);
    if (this.dbEnabled) {
      await this.pool.query(
        `INSERT INTO backtest_runs (id, status, created_at, updated_at, cancellation_requested, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at,
           cancellation_requested = backtest_runs.cancellation_requested OR EXCLUDED.cancellation_requested,
           payload = EXCLUDED.payload`,
        [copy.id, copy.status, copy.createdAt, copy.updatedAt, copy.cancellationRequested === true, JSON.stringify(copy)],
      );
    } else {
      const existing = this.runs.get(copy.id);
      if (existing?.cancellationRequested) copy.cancellationRequested = true;
      this.runs.set(copy.id, copy);
    }
    return cloneJson(copy);
  }

  async getRun(id) {
    await this.ready;
    if (this.dbEnabled) {
      const result = await this.pool.query('SELECT payload, cancellation_requested FROM backtest_runs WHERE id = $1', [id]);
      if (!result.rowCount) return null;
      return { ...result.rows[0].payload, cancellationRequested: result.rows[0].cancellation_requested };
    }
    return cloneJson(this.runs.get(id) || null);
  }

  async listRuns({ limit = 50, status } = {}) {
    await this.ready;
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    if (this.dbEnabled) {
      const values = [];
      let where = '';
      if (status) {
        values.push(status);
        where = 'WHERE status = $1';
      }
      values.push(safeLimit);
      const result = await this.pool.query(
        `SELECT payload, cancellation_requested FROM backtest_runs ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(row => ({ ...row.payload, cancellationRequested: row.cancellation_requested }));
    }
    return [...this.runs.values()]
      .filter(run => !status || run.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, safeLimit)
      .map(cloneJson);
  }

  async requestCancellation(id) {
    await this.ready;
    if (this.dbEnabled) {
      const result = await this.pool.query(
        `UPDATE backtest_runs
         SET cancellation_requested = TRUE, updated_at = $2
         WHERE id = $1
         RETURNING payload`,
        [id, Date.now()],
      );
      return result.rowCount > 0;
    }
    const run = this.runs.get(id);
    if (!run) return false;
    run.cancellationRequested = true;
    run.updatedAt = Date.now();
    this.runs.set(id, run);
    return true;
  }

  async isCancellationRequested(id) {
    await this.ready;
    if (this.dbEnabled) {
      const result = await this.pool.query('SELECT cancellation_requested FROM backtest_runs WHERE id = $1', [id]);
      return result.rowCount ? result.rows[0].cancellation_requested === true : false;
    }
    return this.runs.get(id)?.cancellationRequested === true;
  }

  async close() {
    if (this.pool) {
      try { await this.pool.end(); } catch { /* ignore shutdown errors */ }
    }
  }
}
