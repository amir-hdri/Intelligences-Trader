/**
 * Deterministic PRNG utilities - Phase 1
 * Replaces Math.random() with seeded deterministic generators
 * to ensure reproducible, auditable simulation.
 */

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: number | string): () => number {
  const numericSeed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return mulberry32(numericSeed || 1);
}

// Global deterministic RNG seeded by build time constant + date to maintain daily stability but no Math.random
let globalSeed = hashString('Intelligences-Trader-v2.5-fixed-seed-2026') ^ (Math.floor(Date.now() / 86400000) & 0xffff);
let globalRng = mulberry32(globalSeed);

export function deterministicRandom(): number {
  return globalRng();
}

export function resetDeterministicRng(seed: number | string) {
  globalSeed = typeof seed === 'string' ? hashString(seed) : seed;
  globalRng = mulberry32(globalSeed);
}

export function seededBetween(min: number, max: number, rng: () => number = globalRng): number {
  return min + rng() * (max - min);
}

export function seededIntBetween(min: number, max: number, rng: () => number = globalRng): number {
  return Math.floor(seededBetween(min, max + 1, rng));
}

/**
 * Deterministic sparkline - no random, based on seed
 */
export function generateDeterministicSparkline(seed: string, length = 18): number[] {
  const rng = createSeededRng(seed);
  const points: number[] = [];
  for (let i = 0; i < length; i++) {
    // Use sine-based pattern + seeded jitter bounded
    const base = 8 + Math.sin((i / length) * Math.PI * 2 + hashString(seed) * 0.0001) * 6 + 6;
    const jitter = (rng() - 0.5) * 2; // small deterministic jitter
    points.push(Math.max(2, Math.min(26, base + jitter)));
  }
  return points;
}

/**
 * Deterministic Gaussian using Box-Muller with seeded RNG
 */
export function seededGaussian(rng: () => number = globalRng): number {
  let u = 0,
    v = 0;
  // Convert [0,1) to (0,1) deterministically
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Deterministic choice from array
 */
export function seededChoice<T>(arr: T[], rng: () => number = globalRng): T {
  const idx = Math.floor(rng() * arr.length);
  return arr[Math.min(idx, arr.length - 1)];
}
