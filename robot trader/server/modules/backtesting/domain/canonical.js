import crypto from 'node:crypto';

/**
 * Convert a JSON-compatible value into a recursively key-sorted form.  Run
 * hashes must not depend on object insertion order or locale-specific output.
 */
export function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Cannot canonicalize a non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(item => canonicalize(item ?? null));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`Unsupported canonical value type: ${typeof value}`);
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = typeof value === 'string' || Buffer.isBuffer(value) || ArrayBuffer.isView(value)
    ? value
    : stableStringify(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
