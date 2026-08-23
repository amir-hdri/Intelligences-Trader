/**
 * Intelligences-Trader — Authentication service.
 *
 * Password hashing uses Node's built-in `crypto.scrypt` (memory-hard KDF)
 * with a per-user random salt and timing-safe comparison. No external
 * bcrypt dependency required, which keeps Docker builds dependency-free.
 *
 * Tokens: JWT access (short-lived) + JWT refresh (longer-lived), signed with
 * secrets read from the environment (never hardcoded).
 */
import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const SCRYPT_KEYLEN = 64;

export function hashPassword(password, saltHex = null) {
  const salt = saltHex || randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, saltHex, expectedHashHex) {
  if (!saltHex || !expectedHashHex) return false;
  try {
    const actual = scryptSync(String(password), saltHex, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Persist a user with a hashed password. Returns the created row. */
export function createUser(db, { username, password, role = 'trader' }) {
  const { salt, hash } = hashPassword(password);
  const info = db.prepare(
    `INSERT INTO users (username, password_hash, salt, role)
     VALUES (?, ?, ?, ?)`
  ).run(username, hash, salt, role);
  return { id: Number(info.lastInsertRowid), username, role };
}

export function findUserByUsername(db, username) {
  return db.prepare(
    `SELECT id, username, password_hash, salt, role, is_active, last_login_at, created_at
     FROM users WHERE username = ?`
  ).get(username);
}

/** Verify credentials against the DB and record last_login_at. */
export function verifyCredentials(db, username, password) {
  const user = findUserByUsername(db, username);
  if (!user || !user.is_active) return null;
  if (!verifyPassword(password, user.salt, user.password_hash)) return null;
  db.prepare(
    `UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(user.id);
  return { id: user.id, username: user.username, role: user.role };
}

export function recordAudit(db, { eventType, username = null, ip = null, correlationId = null, details = null }) {
  db.prepare(
    `INSERT INTO audit_events (event_type, username, ip, correlation_id, details_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    eventType,
    username,
    ip,
    correlationId,
    details ? JSON.stringify(details) : null
  );
}
