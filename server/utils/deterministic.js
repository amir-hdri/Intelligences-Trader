/**
 * Deterministic PRNG for proxy server
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
let globalSeed = hashString('Intelligences-Trader-proxy-seed-2026') ^ (Math.floor(Date.now() / 86400000) & 0xffff);
let globalRng = mulberry32(globalSeed);
export function deterministicRandom() { return globalRng(); }
export function seededBetween(min,max,rng=globalRng){return min+rng()*(max-min);}
export function seededIntBetween(min,max,rng=globalRng){return Math.floor(seededBetween(min,max+1,rng));}
