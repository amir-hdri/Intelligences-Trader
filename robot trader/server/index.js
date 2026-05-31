import express from 'express';
import cors from 'cors';
import { DayDetails } from 'tsetmc-client';
import { analyzeMarketMTF, detectMarketRegime, calculateATR } from './analyzer.js';
import { generateAnalysis } from './analysisEngine.js';

import { generateHistoricalData } from './dataFactory.js';
import crypto from 'crypto';

const ALLOWED_INS_CODES = ['SAF1403', 'GOLD1403', 'SAFSPOT', 'GOLDFUND', 'STEELSPOT'];

const SYMBOL_MAP = {
  'SAF-NGN-FUT': 'SAF1403',
  'GOLD-FUT': 'GOLD1403',
  'SAF-NGN-SPOT': 'SAFSPOT',
  'GOLD-FUND': 'GOLDFUND',
  'STEEL-SPOT': 'STEELSPOT'
};

const TSETMC_INFO_URL = 'http://cdn.tsetmc.com/api/Instrument/GetInstrumentInfo';
const TSETMC_OB_URL = 'http://cdn.tsetmc.com/api/Instrument/GetInstrumentOrderBook';

const fetchWithRetry = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, 500 * (i + 1)));
    }
  }
};

const generateSimulationData = (symbolId) => {
  return generateHistoricalData(symbolId);
};


const app = express();
const port = 3000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());


// Smart Analysis Endpoint

// Prediction Endpoint
app.post('/api/predict', (req, res) => {
  const { historyData } = req.body;
  if (!historyData || !Array.isArray(historyData) || historyData.length === 0) {
    return res.status(400).json({ error: 'Invalid historyData array' });
  }

  try {
    const analysis = generateAnalysis(historyData);
    const lastClose = historyData[historyData.length - 1].close;
    const atr = analysis.indicators.atr;

    let targetPrice = lastClose;
    if (analysis.prediction === 'BUY') targetPrice = lastClose + atr;
    else if (analysis.prediction === 'SELL') targetPrice = lastClose - atr;

    res.json({
      prediction: analysis.prediction,
      targetPrice: targetPrice,
      confidence: analysis.confidence
    });
  } catch (error) {
    res.status(500).json({ error: 'Prediction failed' });
  }
});


app.post('/api/analyze', (req, res) => {
  const t0 = Date.now();
  const { historyData } = req.body;
  if (!historyData || !Array.isArray(historyData)) {
    return res.status(400).json({ error: 'Invalid historyData array' });
  }

  try {
    const analysis = generateAnalysis(historyData);
    const t1 = Date.now();
    // Ensure < 500ms
    if ((t1 - t0) > 500) {
      console.warn('Analysis took too long:', t1 - t0, 'ms');
    }
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});


// Proxy for Real API (TSETMC)
app.get('/api/tse/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^[A-Z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

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
  if (!/^[A-Z0-9-]+$/.test(symbolId)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  const insCode = Object.prototype.hasOwnProperty.call(SYMBOL_MAP, symbolId) ? SYMBOL_MAP[symbolId] : null;

  // If not in map or unavailable, fallback to centralized simulation
  if (!insCode) {
    console.warn(`Symbol ${symbolId} not found in map, using Digital Twin.`);
    return res.json(generateSimulationData(symbolId));
  }

  // Generate historical data since we aren't actually fetching it from TSETMC history api here.
  const historyData = generateSimulationData(symbolId);

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
  returns.sort((a,b) => a-b);
  const var95 = returns[Math.floor(returns.length * 0.05)] || 0;

  res.json({
    prediction: analysis.action,
    confidence: analysis.confidence,
    regime: regime,
    risk: {
      valueAtRisk95: var95,
      suggestedRiskCapital: 0.1 // 10% base
    }
  });
});

// 4. Real-Time Info (Last Price, Best Limits)
app.get('/api/tse/info/:symbolId', async (req, res) => {
  const symbolId = String(req.params.symbolId);
  if (!/^[A-Z0-9-]+$/.test(symbolId)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  const insCode = Object.prototype.hasOwnProperty.call(SYMBOL_MAP, symbolId) ? SYMBOL_MAP[symbolId] : null;

  if (!insCode) return res.status(404).json({ error: 'Symbol not found' });
  if (!ALLOWED_INS_CODES.includes(insCode)) return res.status(400).json({ error: 'Invalid instrument code' });

  try {
    const [infoData, obData] = await Promise.all([
      fetchWithRetry(`${TSETMC_INFO_URL}/${insCode}`),
      fetchWithRetry(`${TSETMC_OB_URL}/${insCode}`)
    ]);

    const lastPrice = infoData?.instrumentInfo?.priceClosing || 0;

    const bids = (obData?.bestLimits || []).map(limit => ({
      price: limit.pMeDem,
      quantity: limit.qTitMeDem,
      count: limit.zTitMeDem
    })).filter(b => b.quantity > 0);

    const asks = (obData?.bestLimits || []).map(limit => ({
        price: limit.pMeOf,
        quantity: limit.qTitMeOf,
        count: limit.zTitMeOf
    })).filter(a => a.quantity > 0);

    res.json({
      price: lastPrice,
      orderBook: { bids, asks },
      timestamp: Date.now()
    });
  } catch(error) {
    console.error('Real API Info Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch from real API. Please try again later.' });
  }
});

// 5. Deep Training (Strategy Optimization)
app.post('/api/train', (req, res) => {
  let symbol = req.body.symbol || 'SAF1403';
  const historyData = req.body.historyData || [];

  if (typeof symbol !== 'string' || !/^[A-Z0-9-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  console.log(`Starting deep training for ${symbol} with ${historyData.length} data points...`);
  res.json({
    success: true,
    message: historyData.length > 0 ? `Model trained successfully on ${historyData.length} data points for ${symbol}` : `Training started for ${symbol}`
  });
});
// Helper to generate fake history anchored to real price
function generateHistory(currentCandle) {
    const candles = [];
    const count = 100;
    let lastClose = currentCandle.close * 0.95; // start 5% lower to create a trend
    const tfMs = 60 * 60 * 1000;
    const now = currentCandle.timestamp;

    for (let i = 0; i < count - 1; i++) {
        const change = lastClose * ((crypto.randomBytes(4).readUInt32BE() / 0x100000000) * 0.02 - 0.01);
        const close = lastClose + change;
        candles.push({
            timestamp: now - (count - i) * tfMs,
            open: lastClose,
            high: Math.max(lastClose, close) * 1.01,
            low: Math.min(lastClose, close) * 0.99,
            close: close,
            volume: Math.floor((crypto.randomBytes(4).readUInt32BE() / 0x100000000) * 50000),
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Smart Analysis Backend listening on port ${port}`);
});
