
export const generateHistoricalData = (symbolId, years = 3) => {
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

    // IME Limit Up/Down logic (simulated roughly at 5%)
    const maxChange = 0.05;
    let finalChange = Math.max(Math.min(changePct, maxChange), -maxChange);

    price = price * (1 + finalChange);

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

// New Helper for short-term simulation used by fallback
export const generateSimulationData = (symbolId, days = 100) => {
    console.log(`Generating fallback simulation for ${symbolId}`);
    const now = Date.now();
    const data = [];
    let price = symbolId.includes('GOLD') ? 35000000 : 1200000;
    let openInterest = 5000;

    for (let i = 0; i < days; i++) {
        const date = now - (days - i) * 24 * 60 * 60 * 1000;

        // Saf Hamle (Limit Up/Down) Simulation
        const isLimitUp = Math.random() > 0.95;
        const isLimitDown = Math.random() > 0.95;

        let change = (Math.random() - 0.5) * 0.02; // Normal volatility
        if (isLimitUp) change = 0.05;
        else if (isLimitDown) change = -0.05;

        const close = Math.floor(price * (1 + change));
        const open = Math.floor(price * (1 + (Math.random() - 0.5) * 0.005));
        const high = Math.max(open, close, Math.floor(price * (1 + Math.abs(change) + 0.005)));
        const low = Math.min(open, close, Math.floor(price * (1 - Math.abs(change) - 0.005)));
        const volume = Math.floor(Math.random() * 100000) + 5000;

        openInterest += Math.floor((Math.random() - 0.4) * 500);

        data.push({
          timestamp: date,
          open,
          high,
          low,
          close,
          volume,
          openInterest: Math.max(0, openInterest),
          basis: symbolId.includes('FUT') ? close - (close * (0.98 + Math.random() * 0.04)) : 0
        });
        price = close;
    }
    return data;
}
