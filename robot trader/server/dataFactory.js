/**
 * Symbol Configuration - Deterministic Version (Phase 1)
 * No Math.random, uses seeded deterministic PRNG
 */
import { createSeededRng } from './utils/deterministic.js';

const SYMBOL_CONFIG = {
  SAF: {
    basePrice: 950000,
    name: 'Saffron',
    seasonality: {
      9: -0.08,
      10: -0.08,
      1: 0.08,
      2: 0.08
    }
  },
  GOLD: {
    basePrice: 45000000,
    name: 'Gold',
    seasonality: {}
  },
  DEFAULT: {
    basePrice: 150000,
    name: 'Default Commodity',
    seasonality: {}
  }
};

const MARKET_PARAMS = {
  mu: 0.10,
  sigma: 0.25,
  dt: 1 / (365 * 24),
  minPrice: 1000,
  priceFluctuation: 0.01,
  candleWickRange: 0.005,
  maxVolume: 10000,
  minVolume: 1000,
  maxOpenInterest: 10000,
  minOpenInterest: 2000
};

const getSymbolConfig = (symbolId) => {
  const normalizedSymbol = String(symbolId).toUpperCase();
  for (const [key, config] of Object.entries(SYMBOL_CONFIG)) {
    if (key !== 'DEFAULT' && normalizedSymbol.includes(key)) {
      return config;
    }
  }
  return SYMBOL_CONFIG.DEFAULT;
};

// Deterministic standard normal using seeded rng per symbol
const createDeterministicStandardNormal = (rng) => {
  return () => {
    let first = 0;
    let second = 0;
    while (first === 0) first = rng();
    while (second === 0) second = rng();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  };
};

const generateHistoricalData = (symbolId, years = 3) => {
  if (!Number.isFinite(years) || years <= 0 || years > 10) {
    throw new RangeError('years must be greater than 0 and no more than 10');
  }
  const candles = [];
  const now = Date.now();
  const totalHours = Math.floor(years * 365 * 24);
  const config = getSymbolConfig(symbolId);
  let previousClose = config.basePrice;

  // Deterministic RNG seeded by symbolId
  const baseRng = createSeededRng(`historical-${symbolId}-${years}`);
  const standardNormal = createDeterministicStandardNormal(baseRng);

  for (let index = 0; index < totalHours; index++) {
    const timestamp = now - (totalHours - index) * 3_600_000;
    const month = new Date(timestamp).getMonth();
    const seasonalDrift = config.seasonality[month] ?? 0;
    const drift = (MARKET_PARAMS.mu + seasonalDrift - 0.5 * MARKET_PARAMS.sigma ** 2) * MARKET_PARAMS.dt;
    const diffusion = MARKET_PARAMS.sigma * Math.sqrt(MARKET_PARAMS.dt) * standardNormal();

    const open = previousClose;
    const close = Math.max(MARKET_PARAMS.minPrice, open * Math.exp(drift + diffusion));
    // Deterministic wick using rng
    const wickHighFactor = baseRng() * MARKET_PARAMS.candleWickRange;
    const wickLowFactor = baseRng() * MARKET_PARAMS.candleWickRange;
    const high = Math.max(open, close) * (1 + wickHighFactor);
    const low = Math.max(MARKET_PARAMS.minPrice, Math.min(open, close) * (1 - wickLowFactor));
    const volume = Math.floor(baseRng() * (MARKET_PARAMS.maxVolume - MARKET_PARAMS.minVolume + 1) + MARKET_PARAMS.minVolume);
    const openInterest = Math.floor(baseRng() * (MARKET_PARAMS.maxOpenInterest - MARKET_PARAMS.minOpenInterest + 1) + MARKET_PARAMS.minOpenInterest);

    candles.push({
      timestamp,
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume,
      openInterest,
    });
    previousClose = close;
  }
  return candles;
};

export { generateHistoricalData, SYMBOL_CONFIG, MARKET_PARAMS, getSymbolConfig };
