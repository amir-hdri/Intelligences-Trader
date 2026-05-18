import express from 'express';
import cors from 'cors';
import { DayDetails } from 'tsetmc-client';
import { analyzeMarketMTF, detectMarketRegime, calculateATR } from './analyzer.js';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Proxy for Real API (TSETMC)
app.get('/api/tse/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const today = new Date();
    // Assuming a simple way to format date as YYYYMMDD
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dEven = parseInt(`${yyyy}${mm}${dd}`);

    const data = await DayDetails.getPriceData({ insId: id, dEven: dEven });

    // Transform tsetmc-client data into our MarketCandle format
    // Real TSETMC client might not return historical intraday candles perfectly,
    // so we will simulate generating the candles based on real daily data

    const priceChange = data.priceChange || 0;
    const openPrice = data.lastPrice - priceChange; // Approximation

    const candle = {
        timestamp: Date.now(),
        open: openPrice,
        high: data.high || data.lastPrice,
        low: data.low || data.lastPrice,
        close: data.lastPrice,
        volume: data.tradeVolume || 0,
        openInterest: 0,
        basis: 0,
        warehouseVolume: 0
    };

    // Construct array of candles for analysis (normally you would fetch history)
    // Here we generate a mock history to feed the analyzer, anchored to the real last price.
    const candles = generateHistory(candle);

    res.json({ success: true, data: candles });
  } catch (error) {
    console.error('Real API Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch from real API. Check ID or network.' });
  }
});

// 3. TSETMC History (with Fallback)
app.get('/api/tse/history/:symbolId', async (req, res) => {
  const symbolId = String(req.params.symbolId);
  const insCode = Object.prototype.hasOwnProperty.call(SYMBOL_MAP, symbolId) ? SYMBOL_MAP[symbolId] : null;

  // If not in map or unavailable, fallback to centralized simulation
  if (!insCode) {
    console.warn(`Symbol ${symbolId} not found in map, using Digital Twin.`);
    return res.json(generateSimulationData(symbolId));
  }

  // 1. Analyze Market (Direction & Confidence)
  const analysis = analyzeMarketMTF({
      '1m': [],
      '15m': [],
      '1h': historyData,
      '1d': historyData
  }, 'UNKNOWN');

  // 2. Volatility Analysis (Regime)
  const atr = calculateATR(historyData);
  const regime = detectMarketRegime(historyData, atr);

  // 3. Value at Risk (Historical Simulation 95% Confidence)
  const returns = [];
  for(let i=1; i<historyData.length; i++){
      returns.push((historyData[i].close - historyData[i-1].close) / historyData[i-1].close);
  }
});

// 4. Real-Time Info (Last Price, Best Limits)
app.get('/api/tse/info/:symbolId', async (req, res) => {
  const symbolId = String(req.params.symbolId);
  const insCode = Object.prototype.hasOwnProperty.call(SYMBOL_MAP, symbolId) ? SYMBOL_MAP[symbolId] : null;

  if (!insCode) return res.status(404).json({ error: 'Symbol not found' });

  try {
    const infoData = await fetchWithRetry(`${TSETMC_INFO_URL}/${insCode}`);
    const obData = await fetchWithRetry(`${TSETMC_OB_URL}/${insCode}`);

    const lastPrice = infoData.instrumentInfo.priceClosing;

    const bids = obData.bestLimits.map(limit => ({
      price: limit.pMeDem,
      quantity: limit.qTitMeDem,
      count: limit.zTitMeDem
    })).filter(b => b.quantity > 0);

    const asks = obData.bestLimits.map(limit => ({
        price: limit.pMeOf,
        quantity: limit.qTitMeOf,
        count: limit.zTitMeOf
    })).filter(a => a.quantity > 0);

    res.json({
      price: lastPrice,
      orderBook: { bids, asks },
      timestamp: Date.now()
    });

  res.json(advancedMetrics);
});

// 5. Deep Training (Strategy Optimization)
app.post('/api/train', (req, res) => {
  let symbol = req.body.symbol || 'SAF1403';

  if (typeof symbol !== 'string' || !/^[A-Z0-9-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  console.log(`Starting deep training for ${symbol}...`);

// Helper to generate fake history anchored to real price
function generateHistory(currentCandle) {
    const candles = [];
    const count = 100;
    let lastClose = currentCandle.close * 0.95; // start 5% lower to create a trend
    const tfMs = 60 * 60 * 1000;
    const now = currentCandle.timestamp;

    for (let i = 0; i < count - 1; i++) {
        const change = lastClose * (Math.random() * 0.02 - 0.01);
        const close = lastClose + change;
        candles.push({
            timestamp: now - (count - i) * tfMs,
            open: lastClose,
            high: Math.max(lastClose, close) * 1.01,
            low: Math.min(lastClose, close) * 0.99,
            close: close,
            volume: Math.floor(Math.random() * 50000),
            openInterest: 5000,
            basis: 0,
            warehouseVolume: 10000
        });
        lastClose = close;
    }
    // Push the real current candle last
    candles.push(currentCandle);
    return candles;
}

// 6. Generic Market Mock (Legacy support)
app.get('/api/market/history', (req, res) => {
  const symbol = String(req.query.symbol || 'SAF1403');

  if (!/^[A-Z0-9-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  const data = generateHistoricalData(symbol);
  res.json(data);
});

app.listen(port, () => {
  console.log(`Smart Analysis Backend listening on port ${port}`);
});
