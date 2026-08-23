/**
 * Intelligences-Trader — Database access layer.
 *
 * Uses the built-in `node:sqlite` module (Node 22.13+ / 26) so the project
 * gains a real relational persistence layer with ZERO native dependencies —
 * which keeps the `node:22-alpine` Docker builds free of compile steps.
 *
 * Responsibilities:
 *   - open the SQLite database (path from DB_PATH env or ./data/trader.db)
 *   - run idempotent migrations from db/migrations/*.sql in order
 *   - seed initial data (default admin + sample rows) when empty
 *   - expose the DatabaseSync handle and small helpers
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'trader.db');

export function openDatabase(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/** Run every migration file in db/migrations in lexical order (idempotent). */
export function runMigrations(db) {
  const migrationsDir = join(__dirname, 'migrations');
  if (!existsSync(migrationsDir)) return 0;
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.exec(sql);
    applied += 1;
  }
  return applied;
}

export function countRows(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  } catch {
    return -1;
  }
}

/**
 * Seed the database if it is empty. Creates a default admin user
 * (credentials from env, with safe development fallbacks) and a few
 * sample audit/setting rows so the app is immediately usable.
 */
export function seedDatabase(db, { seedUser = null, seedPassword = null } = {}) {
  const username = seedUser || process.env.ADMIN_USERNAME || 'admin';
  // If no password is provided, generate a strong random one (never ship a
  // known default like "admin123"). It is printed once so the operator can
  // retrieve it from the startup log.
  const useProvided = seedPassword || process.env.ADMIN_PASSWORD;
  const password = useProvided || randomBytes(16).toString('base64url');
  if (!useProvided) {
    console.log(`[seed] No ADMIN_PASSWORD set — generated random admin password: ${password}`);
  }
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, 64).toString('hex');

  const userCount = countRows(db, 'users');
  if (userCount === 0) {
    db.prepare(
      `INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'admin')`
    ).run(username, passwordHash, salt);

    db.prepare(
      `INSERT INTO audit_events (event_type, username, details_json) VALUES (?, ?, ?)`
    ).run('SEED', username, JSON.stringify({ note: 'initial admin seeded' }));

    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)`
    ).run('default_risk_limits', JSON.stringify({
      maxDailyDrawdown: 1.5,
      maxTotalDrawdown: 10.0,
      maxPositionSize: 20.0,
      maxOpenTrades: 15,
      stopAllTrading: false,
    }));
  }

  return { username, password, seeded: userCount === 0 };
}

/** Convenience factory used by the app entrypoint. */
export function createDatabase(opts = {}) {
  const db = openDatabase(opts.dbPath);
  const migrations = runMigrations(db);
  const seed = opts.skipSeed ? { seeded: false } : seedDatabase(db, opts);
  return { db, migrations, seed };
}

export { randomUUID };
