const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import Modules
const { generateNews } = require('./newsEngine');
const { generateHistoricalData } = require('./dataFactory');
const { optimizeStrategy } = require('./strategyOptimizer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(bodyParser.json());

// --- Endpoints ---

// 1. Status Check
app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', service: 'Robot Trader Intelligence Core', version: '2.5.0' });
});

// 2. NLP News Analysis
app.get('/api/news', (req, res) => {
  try {
    const news = generateNews(5);
    // Calculate aggregate sentiment
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

// 3. Historical Data
app.get('/api/market/history', (req, res) => {
  const symbol = req.query.symbol || 'SAF1403';
  const years = parseInt(req.query.years) || 3;
  try {
    const data = generateHistoricalData(symbol, years);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/market/history:', error);
    res.status(500).json({ error: 'Failed to generate historical data' });
  }
});

// 4. Deep Training (Strategy Optimization)
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
