import express from 'express';
import cors from 'cors';
import axios from 'axios';
import NodeCache from 'node-cache';
import bodyParser from 'body-parser';

// Internal Logic
import { generateNews } from './newsEngine.js';
import { generateHistoricalData } from './dataFactory.js';
import { optimizeStrategy } from './strategyOptimizer.js';

const app = express();
const port = 3000;
const cache = new NodeCache({ stdTTL: 10 }); // Cache for 10 seconds

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// --- Constants & Config ---
const TSETMC_URL = 'http://cdn.tsetmc.com/api/Instrument/GetInstrumentHistory';
const TSETMC_INFO_URL = 'http://cdn.tsetmc.com/api/Instrument/GetInstrumentInfo';
const TSETMC_OB_URL = 'http://cdn.tsetmc.com/api/BestLimits/';

const SYMBOL_MAP = {
  'SAF-NGN-FUT': '63934444535316315',
  'SAF-NGN-SPOT': '35425587644337450',
  'GOLD-FUT': '2400322364771558',
  'GOLD-FUND': '65883838195688438',
  'STEEL-SPOT': '2400322364771558',
};

// --- Helpers ---

// Helper to fetch data with retries
async function fetchWithRetry(url, params = {}, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
          params,
          timeout: 5000,
          headers: {
              'User-Agent': 'Mozilla/5.0'
          }
      });
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function parseTseDate(dateInt) {
  const str = dateInt.toString();
  const year = parseInt(str.substring(0, 4));
  const month = parseInt(str.substring(4, 6)) - 1;
  const day = parseInt(str.substring(6, 8));
  return new Date(year, month, day).getTime();
}

function generateSimulationData(symbolId) {
    console.log(`Generating fallback simulation for ${symbolId}`);
    const now = Date.now();
    const data = [];
    let price = symbolId.includes('GOLD') ? 35000000 : 1200000;
    let openInterest = 5000;

    for (let i = 0; i < 100; i++) {
        const date = now - (100 - i) * 24 * 60 * 60 * 1000;

        const isLimitUp = Math.random() > 0.95;
        const isLimitDown = Math.random() > 0.95;

        let change = (Math.random() - 0.5) * 0.02;
        if (isLimitUp) change = 0.05;
        if (isLimitDown) change = -0.05;

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

// --- Endpoints ---

// 1. Status Check
app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', service: 'Robot Trader Intelligence Core', version: '2.5.0' });
});

// 2. NLP News Analysis
app.get('/api/news', (req, res) => {
  try {
    const news = generateNews(5);
    const aggregateScore = news.reduce((acc, curr) => acc + curr.sentimentScore, 0) / news.length;
    res.json({
      sentiment: {
        score: aggregateScore,
        label: aggregateScore > 0.1 ? 'GREED' : aggregateScore < -0.1 ? 'FEAR' : 'NEUTRAL',
        news
      }
    });
  } catch (error) {
    console.error('Error in /api/news:', error);
    res.status(500).json({ error: 'Failed to generate news' });
  }
});

// 3. TSETMC History (with Fallback)
app.get('/api/tse/history/:symbolId', async (req, res) => {
  const { symbolId } = req.params;
  const insCode = SYMBOL_MAP[symbolId];

  if (!insCode) {
    // If not in map, default to simulation immediately?
    // Or return 404? Frontend expects array or fallback.
    // Let's fallback to simulation for unknown symbols too for robustness.
    return res.json(generateSimulationData(symbolId));
  }

  const cacheKey = `history_${symbolId}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return res.json(cachedData);

  try {
    const data = await fetchWithRetry(`${TSETMC_URL}/${insCode}/0`);

    const candles = data.instrumentHistory.map(item => ({
      timestamp: parseTseDate(item.dEven),
      open: item.priceFirst,
      high: item.priceMax,
      low: item.priceMin,
      close: item.priceClosing,
      volume: item.qTotTran5J,
      openInterest: 0, // TSETMC history API often lacks OI in this endpoint
    })).reverse();

    cache.set(cacheKey, candles);
    res.json(candles);
  } catch (error) {
    console.error(`Error fetching history for ${symbolId}:`, error.message);
    // Fallback to Simulation
    const simData = generateSimulationData(symbolId);
    res.json(simData);
  }
});

// 4. Real-Time Info (Last Price, Best Limits)
app.get('/api/tse/info/:symbolId', async (req, res) => {
  const { symbolId } = req.params;
  const insCode = SYMBOL_MAP[symbolId];

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

  } catch (error) {
    console.error(`Error fetching info for ${symbolId}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch info' });
  }
});

// 5. Deep Training (Strategy Optimization)
app.post('/api/train', (req, res) => {
  const symbol = req.body.symbol || 'SAF1403';
  console.log(`Starting deep training for ${symbol}...`);

  try {
    const result = optimizeStrategy(symbol);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/train:', error);
    res.status(500).json({ error: 'Training failed' });
  }
});

// 6. Generic Market Mock (Legacy support for Professional branch clients if any)
app.get('/api/market/history', (req, res) => {
  const symbol = req.query.symbol || 'SAF1403';
  const data = generateHistoricalData(symbol);
  res.json(data);
});

app.listen(port, () => {
  console.log(`Robot Trader Unified Server running on http://localhost:${port}`);
});
