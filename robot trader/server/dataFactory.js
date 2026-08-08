
/**
 * Symbol Configuration
 * Defines base prices, seasonality patterns, and other parameters per symbol
 */
const SYMBOL_CONFIG = {
  SAF: {
    basePrice: 950000,
    name: 'Saffron',
    seasonality: {
      9: -0.08,   // Annualized harvest pressure in October
      10: -0.08,  // Annualized harvest pressure in November
      1: 0.08,    // Annualized scarcity premium in February
      2: 0.08     // Annualized scarcity premium in March
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

/**
 * Market Parameters
 * Global market dynamics and constraints
 */
const MARKET_PARAMS = {
  mu: 0.10,                // Annualized drift
  sigma: 0.25,             // Annualized volatility
  dt: 1 / (365 * 24),      // One hour expressed as a fraction of a year
  minPrice: 1000,          // Floor for price to prevent negative values
  priceFluctuation: 0.01,  // Intra-candle price variation (±1%)
  candleWickRange: 0.005,  // High/Low wick magnitude
  maxVolume: 10000,        // Maximum trading volume
  minVolume: 1000,         // Minimum trading volume
  maxOpenInterest: 10000,
  minOpenInterest: 2000
};

/**
 * Get symbol configuration by ID
 * Matches symbolId against configured symbols (case-insensitive)
 * 
 * @param {string} symbolId - The symbol identifier
 * @returns {Object} Symbol configuration object
 */
const getSymbolConfig = (symbolId) => {
  const normalizedSymbol = String(symbolId).toUpperCase();
  for (const [key, config] of Object.entries(SYMBOL_CONFIG)) {
    if (key !== 'DEFAULT' && normalizedSymbol.includes(key)) {
      return config;
    }
  }
  return SYMBOL_CONFIG.DEFAULT;
};

/**
 * Generate Historical OHLCV Data
 * Creates realistic candlestick data using geometric Brownian motion with seasonality
 * 
 * Model: dP = (μ + seasonalFactor) * P * dt + σ * P * dW
 * Where:
 *   - P = price
 *   - μ = drift (trend)
 *   - σ = volatility
 *   - dW = random shock (Wiener process)
 *   - seasonalFactor = commodity-specific seasonal effect
 * 
 * @param {string} symbolId - The symbol to generate data for (e.g., 'SAF', 'GOLD')
 * @param {number} [years=3] - Number of years of historical data to generate
 * @returns {Array<Object>} Array of candle objects with OHLCV data
 * 
 * @example
 * const candles = generateHistoricalData('SAF', 5);
 * // Returns 5 years of hourly candles for Saffron
 */
const standardNormal = () => {
  let first = 0;
  let second = 0;
  while (first === 0) first = Math.random();
  while (second === 0) second = Math.random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
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

  for (let index = 0; index < totalHours; index++) {
    const timestamp = now - (totalHours - index) * 3_600_000;
    const month = new Date(timestamp).getMonth();
    const seasonalDrift = config.seasonality[month] ?? 0;
    const drift = (MARKET_PARAMS.mu + seasonalDrift - 0.5 * MARKET_PARAMS.sigma ** 2) * MARKET_PARAMS.dt;
    const diffusion = MARKET_PARAMS.sigma * Math.sqrt(MARKET_PARAMS.dt) * standardNormal();

    const open = previousClose;
    const close = Math.max(MARKET_PARAMS.minPrice, open * Math.exp(drift + diffusion));
    const high = Math.max(open, close) * (1 + Math.random() * MARKET_PARAMS.candleWickRange);
    const low = Math.max(MARKET_PARAMS.minPrice, Math.min(open, close) * (1 - Math.random() * MARKET_PARAMS.candleWickRange));
    const volume = Math.floor(
      Math.random() * (MARKET_PARAMS.maxVolume - MARKET_PARAMS.minVolume + 1) + MARKET_PARAMS.minVolume,
    );
    const openInterest = Math.floor(
      Math.random() * (MARKET_PARAMS.maxOpenInterest - MARKET_PARAMS.minOpenInterest + 1) + MARKET_PARAMS.minOpenInterest,
    );

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
