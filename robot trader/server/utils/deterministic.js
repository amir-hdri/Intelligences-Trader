/**
 * Deterministic PRNG utilities - Backend - Phase 1
 * Replaces Math.random() where simulation determinism is required
 */

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed) {
  const numericSeed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return mulberry32(numericSeed || 1);
}

let globalSeed = hashString('Intelligences-Trader-backend-fixed-seed-2026') ^ (Math.floor(Date.now() / 86400000) & 0xffff);
let globalRng = mulberry32(globalSeed);

export function deterministicRandom() {
  return globalRng();
}

export function resetDeterministicRng(seed) {
  globalSeed = typeof seed === 'string' ? hashString(seed) : seed;
  globalRng = mulberry32(globalSeed);
}

export function seededBetween(min, max, rng = globalRng) {
  return min + rng() * (max - min);
}

export function seededIntBetween(min, max, rng = globalRng) {
  return Math.floor(seededBetween(min, max + 1, rng));
}

export function seededGaussian(rng = globalRng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function seededChoice(arr, rng = globalRng) {
  const idx = Math.floor(rng() * arr.length);
  return arr[Math.min(idx, arr.length - 1)];
}
