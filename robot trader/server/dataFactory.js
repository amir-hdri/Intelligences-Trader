
const generateHistoricalData = (symbolId, years = 3) => {
  const candles = [];
  const now = Date.now();
  const hoursPerYear = 365 * 24;
  const totalHours = years * hoursPerYear;

  // Base Parameters
  let price = symbolId.includes('SAF') ? 950000 :
              symbolId.includes('GOLD') ? 45000000 : 150000;

  const mu = 0.0001; // Annual drift
  const sigma = 0.02; // Volatility
  const dt = 1/24; // Time step (1 hour)

  // Seasonality for Saffron (Harvest in Oct/Nov)
  const isSaffron = symbolId.includes('SAF');

  for (let i = 0; i < totalHours; i++) {
    const timestamp = now - (totalHours - i) * 3600 * 1000;
    const date = new Date(timestamp);
    const month = date.getMonth(); // 0-11

    // Seasonal Effect
    let seasonalFactor = 0;
    if (isSaffron) {
       // Peak harvest supply (price drops) in Oct (9) / Nov (10)
       if (month === 9 || month === 10) seasonalFactor = -0.0005;
       // Scarcity in Feb (1) / Mar (2)
       if (month === 1 || month === 2) seasonalFactor = 0.0005;
    }

    const epsilon = Math.random() * 2 - 1; // Random shock
    const drift = (mu + seasonalFactor) * dt;
    const diffusion = sigma * epsilon * Math.sqrt(dt);

    const changePct = drift + diffusion;
    price = price * (1 + changePct);

    // Ensure price doesn't go negative
    if (price < 1000) price = 1000;

    const open = price;
    const close = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    const volume = Math.floor(Math.random() * 10000 + 1000);
    const openInterest = Math.floor(Math.random() * 5000 + 5000);

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

export { generateHistoricalData };
