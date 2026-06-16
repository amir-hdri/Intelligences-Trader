
/**
 * Symbol Configuration
 * Defines base prices, seasonality patterns, and other parameters per symbol
 */
const SYMBOL_CONFIG = {
  SAF: {
    basePrice: 950000,
    name: 'Saffron',
    seasonality: {
      9: -0.0005,   // October - harvest peak (supply increases, price drops)
      10: -0.0005,  // November - harvest peak (supply increases, price drops)
      1: 0.0005,    // February - scarcity (price rises)
      2: 0.0005     // March - scarcity (price rises)
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
  mu: 0.0001,              // Annual drift (mean return)
  sigma: 0.02,             // Volatility (standard deviation)
  dt: 1 / 24,              // Time step (1 hour = 1/24 of a day)
  minPrice: 1000,          // Floor for price to prevent negative values
  priceFluctuation: 0.01,  // Intra-candle price variation (±1%)
  candleWickRange: 0.005,  // High/Low wick magnitude
  maxVolume: 10000,        // Maximum trading volume
  minVolume: 1000,         // Minimum trading volume
  maxOpenInterest: 5000,   // Maximum open interest
  minOpenInterest: 5000    // Minimum open interest
};

/**
 * Get symbol configuration by ID
 * Matches symbolId against configured symbols (case-insensitive)
 * 
 * @param {string} symbolId - The symbol identifier
 * @returns {Object} Symbol configuration object
 */
const getSymbolConfig = (symbolId) => {
  for (const [key, config] of Object.entries(SYMBOL_CONFIG)) {
    if (key !== 'DEFAULT' && symbolId.includes(key)) {
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
const generateHistoricalData = (symbolId, years = 3) => {
  const candles = [];
  const now = Date.now();
  const hoursPerYear = 365 * 24;
  const totalHours = years * hoursPerYear;

  // Get configuration for this symbol
  const config = getSymbolConfig(symbolId);
  let price = config.basePrice;


  for (let i = 0; i < totalHours; i++) {
    // Calculate timestamp for this candle (going backwards from now)
    const timestamp = now - (totalHours - i) * 3600 * 1000;
    const date = new Date(timestamp);
    const month = date.getMonth(); // 0 (Jan) - 11 (Dec)

    // Get seasonality factor for this month (defaults to 0 if not found)
    const seasonalFactor = config.seasonality[month] ?? 0;

    // Geometric Brownian Motion: price change percentage
    const epsilon = Math.random() * 2 - 1; // Random shock from [-1, 1]
    const drift = (MARKET_PARAMS.mu + seasonalFactor) * MARKET_PARAMS.dt;
    const diffusion = MARKET_PARAMS.sigma * epsilon * Math.sqrt(MARKET_PARAMS.dt);

    const changePct = drift + diffusion;
    price = price * (1 + changePct);

    // Ensure price floor is maintained
    price = Math.max(price, MARKET_PARAMS.minPrice);

    // Generate OHLC (Open, High, Low, Close)
    const open = price;
    const close = price * (1 + (Math.random() - 0.5) * MARKET_PARAMS.priceFluctuation);
    const high = Math.max(open, close) * (1 + Math.random() * MARKET_PARAMS.candleWickRange);
    const low = Math.min(open, close) * (1 - Math.random() * MARKET_PARAMS.candleWickRange);

    // Generate volume and open interest
    const volume = Math.floor(
      Math.random() * (MARKET_PARAMS.maxVolume - MARKET_PARAMS.minVolume) + MARKET_PARAMS.minVolume
    );
    const openInterest = Math.floor(
      Math.random() * (MARKET_PARAMS.maxOpenInterest - MARKET_PARAMS.minOpenInterest) + MARKET_PARAMS.minOpenInterest
    );

    candles.push({
      timestamp,
      open: parseFloat(open.toFixed(0)),
      high: parseFloat(high.toFixed(0)),
      low: parseFloat(low.toFixed(0)),
      close: parseFloat(close.toFixed(0)),
      volume,
      openInterest
    });
  }

  return candles;
};

export { generateHistoricalData, SYMBOL_CONFIG, MARKET_PARAMS, getSymbolConfig };
