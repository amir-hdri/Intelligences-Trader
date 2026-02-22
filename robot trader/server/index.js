import express from 'express';
import cors from 'cors';
import axios from 'axios';
import NodeCache from 'node-cache';

const app = express();
const port = 3000;
const cache = new NodeCache({ stdTTL: 10 }); // Cache for 10 seconds

app.use(cors());
app.use(express.json());

// TSETMC Base URL
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

// Helper to fetch data with retries
async function fetchWithRetry(url, params = {}, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
          params,
          timeout: 8000, // Increased timeout
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
      });
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// 1. Get History (OHLC)
app.get('/api/tse/history/:symbolId', async (req, res) => {
  const { symbolId } = req.params;
  const insCode = SYMBOL_MAP[symbolId];

  if (!insCode) {
    return res.status(404).json({ error: 'Symbol not found' });
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
      openInterest: 0,
    })).reverse();

    cache.set(cacheKey, candles);
    res.json(candles);
  } catch (error) {
    console.error(`Error fetching history for ${symbolId}:`, error.message);
    // Return 500 so frontend falls back to simulation
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// 2. Get Real-Time Info (Last Price, Best Limits)
app.get('/api/tse/info/:symbolId', async (req, res) => {
  const { symbolId } = req.params;
  const insCode = SYMBOL_MAP[symbolId];

  if (!insCode) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

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
    res.status(500).json({ error: 'Failed to fetch info', details: error.message });
  }
});

function parseTseDate(dateInt) {
  const str = dateInt.toString();
  const year = parseInt(str.substring(0, 4));
  const month = parseInt(str.substring(4, 6)) - 1;
  const day = parseInt(str.substring(6, 8));
  return new Date(year, month, day).getTime();
}

app.listen(port, () => {
  console.log(`TSETMC Proxy Server running on http://localhost:${port}`);
});
