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

// Advanced Analysis Endpoint
app.post('/api/analyze', (req, res) => {
  const { historyData } = req.body; // Expects an array of MarketCandles
  if (!historyData || historyData.length < 50) {
      return res.status(400).json({ error: 'Not enough data points for analysis' });
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
  returns.sort((a,b) => a - b);
  const index = Math.floor(returns.length * 0.05);
  const var95 = returns[index] || 0; // Negative value representing potential loss%

  // Prepare enhanced response
  const advancedMetrics = {
      prediction: analysis.action,
      confidence: analysis.confidence,
      reasoning: analysis.reason,
      indicators: analysis.indicators,
      volatility: {
          atr: atr,
          regime: regime
      },
      risk: {
          valueAtRisk95: var95,
          suggestedRiskCapital: calculateSuggestedCapital(regime, var95)
      }
  };

  res.json(advancedMetrics);
});


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

function calculateSuggestedCapital(regime, var95) {
    // Dynamic position sizing logic
    // Low volatility = can risk more capital
    // High volatility = restrict capital
    const baseRisk = 0.02; // 2% account risk
    if(regime === 'HIGH_VOLATILITY') return baseRisk * 0.5;
    if(regime === 'RANGING') return baseRisk * 0.8;
    return baseRisk; // Trending
}

app.listen(port, () => {
  console.log(`Smart Analysis Backend listening on port ${port}`);
});
