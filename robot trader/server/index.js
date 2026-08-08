import util from 'node:util';
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = (val) => val === null || val === undefined;
}
import { buildTCN, fractionalDiff, purgedKFold, calculateMaxDrawdown, calculateSharpeRatio, calculateCalibrationError } from './tcnModel.js';
import * as tf from '@tensorflow/tfjs';

import { EnsembleEngine } from './ensembleEngine.js';
import { AltDataEngine } from './altDataEngine.js';
import { PortfolioOptimizer } from './portfolioOptimizer.js';
import { XAIEngine } from './xaiEngine.js';
import { FederatedEngine } from './federatedEngine.js';
import { HPOEngine } from './hpoEngine.js';

// Instantiate Advanced Engines
const ensembleEngine = new EnsembleEngine();
const altDataEngine = new AltDataEngine();
const portfolioOptimizer = new PortfolioOptimizer();
const xaiEngine = new XAIEngine();
const federatedEngine = new FederatedEngine();
const hpoEngine = new HPOEngine();

import logger from './logger.js';

const requestMetrics = { total: 0, errors: 0, durationMs: 0 };
const apiMetrics = () => (req, res, next) => {
  const startedAt = performance.now();
  requestMetrics.total += 1;
  res.on('finish', () => {
    requestMetrics.durationMs += performance.now() - startedAt;
    if (res.statusCode >= 500) requestMetrics.errors += 1;
  });
  next();
};

import { pinoLogger } from './pinoLogger.js';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { auditLogger } from './AuditLogger.js';

import { DayDetails } from 'tsetmc-client';
import { analyzeMarketMTF, detectMarketRegime, calculateATR } from './analyzer.js';
import { generateAnalysis, isValidCandle } from './analysisEngine.js';
import { ModelManager } from './modelManager.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const modelManager = new ModelManager();
const modelPath = process.env.MODEL_PATH || path.join(serviceDirectory, 'models', 'market_model.onnx');
modelManager.loadModel(modelPath, process.env.MODEL_VERSION || '1.0.0').catch(error => {
  logger.error('Initial model load failed', { error: error.message });
});

import { generateHistoricalData } from './dataFactory.js';


const ALLOWED_INS_CODES = ['SAF1403', 'GOLD1403', 'SAFSPOT', 'GOLDFUND', 'STEELSPOT'];

const SYMBOL_MAP = {
  'SAF-NGN-FUT': 'SAF1403',
  'GOLD-FUT': 'GOLD1403',
  'SAF-NGN-SPOT': 'SAFSPOT',
  'GOLD-FUND': 'GOLDFUND',
  'STEEL-SPOT': 'STEELSPOT'
};

const TSETMC_INFO_URL = 'https://cdn.tsetmc.com/api/Instrument/GetInstrumentInfo';
const TSETMC_OB_URL = 'https://cdn.tsetmc.com/api/Instrument/GetInstrumentOrderBook';

const fetchWithRetry = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
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


export const app = express();
app.disable('x-powered-by');
app.use(apiMetrics());
const port = Number.parseInt(process.env.PORT || '3000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by CORS policy'));
  },
}));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const suppliedCorrelationId = req.headers['x-correlation-id'];
  req.correlationId = typeof suppliedCorrelationId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedCorrelationId)
    ? suppliedCorrelationId
    : crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});


// SECURITY FIX: Removed the vulnerable fallback values (|| 'default-dev-secret' and 'default-dev-refresh-secret')
// to prevent attackers from bypassing authentication if secrets are not set in production.
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === 'true';

if (AUTH_REQUIRED && (
  !JWT_SECRET || JWT_SECRET.length < 32 ||
  !REFRESH_SECRET || REFRESH_SECRET.length < 32 ||
  !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD
)) {
  throw new Error('AUTH_REQUIRED=true needs 32+ character JWT/refresh secrets and configured admin credentials');
}

// Rate limiter: max 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);

// JWT Middleware
const authenticateToken = (req, res, next) => {
  // Allow /api/status without auth
  if (req.path === '/status' || req.path === '/auth/login' || req.path === '/auth/refresh') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Apply auth middleware to API routes (disabled for now to avoid breaking existing frontend if it doesn't send token)
// app.use('/api/', authenticateToken);

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  if (!JWT_SECRET || !REFRESH_SECRET || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Authentication is not configured' });
  }
  const { username, password } = req.body || {};
  if (typeof username === 'string' && typeof password === 'string' && username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const user = { name: username };
    const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(user, REFRESH_SECRET, { expiresIn: '1h' });

    auditLogger.log('LOGIN_SUCCESS', req.ip, username);
    res.json({ accessToken, refreshToken });
  } else {
    auditLogger.log('LOGIN_FAILED', req.ip, username);
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  if (!JWT_SECRET || !REFRESH_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
  const { token } = req.body || {};
  if (typeof token !== 'string') return res.sendStatus(401);

  jwt.verify(token, REFRESH_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    const accessToken = jwt.sign({ name: user.name }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken });
  });
});

if (AUTH_REQUIRED) {
  app.use(
    ['/api/train', '/api/predict', '/api/advanced'],
    authenticateToken,
  );
}

// Smart Analysis Endpoint

// Prediction Endpoint




app.post('/api/analyze', (req, res) => {
  const t0 = Date.now();
  const { historyData } = req.body || {};
  if (!Array.isArray(historyData) || historyData.length > 10_000) {
    return res.status(400).json({ error: 'historyData must be an array with at most 10,000 candles' });
  }
  if (historyData.some(candle => !isValidCandle(candle))) {
    return res.status(400).json({ error: 'historyData contains an invalid OHLCV candle' });
  }

  try {
    const correlationId = req.correlationId;
    pinoLogger.info({ correlationId, event: 'analyze_request' }, 'Starting rule-based analysis');

    // Rule-Based Strategy (Primary) - executes synchronously
    const analysis = generateAnalysis(historyData);
    const t1 = Date.now();

    // Shadow Mode Protocol: Execute TCN Model concurrently
    // We run it asynchronously so it doesn't block the rule-based response
    setTimeout(async () => {
        if (!modelManager.session) return;
        try {
            // Transform historyData for the model (simplified mock format conversion)
            // Model expects [batch_size, 30, 10]
            if (historyData.length >= 30) {
               // Pad or truncate to exact shape needed for shadow test
               const len = historyData.length;
               const recentData = new Array(30);
               const baseClose = historyData[len - 30].close;
               for (let i = 0, k = len - 30; i < 30; i++, k++) {
                   const candle = historyData[k];
                   const previous = k > 0 ? historyData[k - 1] : candle;
                   recentData[i] = [
                       candle.open / baseClose - 1,
                       candle.high / baseClose - 1,
                       candle.low / baseClose - 1,
                       candle.close / baseClose - 1,
                       Math.log1p(candle.volume) / 20,
                       candle.close / previous.close - 1,
                       (candle.high - candle.low) / candle.close,
                       (candle.close - candle.open) / candle.open,
                       previous.volume > 0 ? candle.volume / previous.volume - 1 : 0,
                       i / 29,
                   ];
               }

               const tcnStart = Date.now();
               const tcnPredictions = await modelManager.predict([recentData], correlationId);
               const tcnPrediction = tcnPredictions[0].prediction;

               // Compare Rule-based vs TCN Model (Shadow Mode)
               const ruleBasedAction = analysis.prediction;

               // Calculate confidence deviation if actions match, or 100% deviation if they differ
               let deviation = 0;
               if (ruleBasedAction !== tcnPrediction) {
                   deviation = 100; // Complete disagreement
               } else {
                   // Compare confidence (TCN probability vs Rule-based confidence)
                   const tcnConf = Math.max(...tcnPredictions[0].probabilities);
                   const ruleConf = analysis.confidence || 0;
                   deviation = Math.abs(tcnConf - ruleConf) * 100;
               }

               if (deviation > 5) {
                   pinoLogger.warn({
                       correlationId,
                       event: 'shadow_mode_deviation',
                       deviationPercent: deviation,
                       ruleBasedAction,
                       tcnPrediction,
                       tcnInferenceTime: Date.now() - tcnStart
                   }, 'Shadow Mode detected significant deviation between Rule-Based and TCN Model outputs');
               }
            }
        } catch (shadowError) {
            pinoLogger.error({ correlationId, event: 'shadow_mode_error', error: shadowError.message }, 'TCN Shadow execution failed');
        }
    }, 0);

    // Ensure < 500ms for Rule-Based
    if ((t1 - t0) > 500) {
      pinoLogger.warn({ correlationId, durationMs: t1 - t0 }, 'Analysis took too long');
    }

    // Always return rule-based to ensure kill-switch and standard logic applies
    res.json(analysis);
  } catch (error) {
    pinoLogger.error({ correlationId, event: 'analyze_error', error: error.message }, 'Analysis failed');
    res.status(500).json({ error: 'Analysis failed' });
  }
});




// 1. Status Check - will be overridden by real Model Registry later, keep placeholder for early boot
app.get('/api/status', (req, res, next) => {
  // If modelRegistryInstance already initialized, use real metrics, else fallback
  if (typeof modelRegistryInstance !== 'undefined' && modelRegistryInstance) {
    return next();
  }
  res.json({
    status: 'Online',
    service: 'Robot Trader Intelligence Core',
    version: '2.5.0',
    modelReady: Boolean(modelManager.session),
    modelVersion: modelManager.getVersion(),
  });
});

app.get('/metrics', (req, res) => {
  const averageDuration = requestMetrics.total > 0 ? requestMetrics.durationMs / requestMetrics.total : 0;
  res.type('text/plain').send([
    '# TYPE http_requests_total counter',
    `http_requests_total ${requestMetrics.total}`,
    '# TYPE http_request_errors_total counter',
    `http_request_errors_total ${requestMetrics.errors}`,
    '# TYPE http_request_duration_milliseconds gauge',
    `http_request_duration_milliseconds ${averageDuration.toFixed(3)}`,
    '',
  ].join('\n'));
});

// 2. NLP News Analysis
import { generateNews } from './newsEngine.js';
app.get('/api/news', (req, res) => {
  try {
    const news = generateNews(5);
    // Calculate aggregate sentiment
    const aggregateScore = news.reduce((acc, curr) => acc + curr.sentimentScore, 0) / news.length;
    const bullishRisk = news.filter(item => item.impactEffect === 'DOLLAR_BULLISH').length;
    const bearishRisk = news.filter(item => item.impactEffect === 'DOLLAR_BEARISH').length;
    res.json({
      sentiment: {
        simulated: true,
        politicalRiskIndex: Math.max(0, Math.min(100, 50 + 10 * bullishRisk - 10 * bearishRisk)),
        score: aggregateScore,
        label: aggregateScore > 0.1 ? 'GREED' : aggregateScore < -0.1 ? 'FEAR' : 'NEUTRAL',
        news,
      }
    });
  } catch (error) {
    logger.error('Error in /api/news:', error);
    res.status(500).json({ error: 'Failed to generate news' });
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

    res.json({
      success: true,
      source: 'TSETMC_SNAPSHOT_WITH_SYNTHETIC_HISTORY',
      simulated: true,
      data: candles,
    });
  } catch (error) {
    logger.error('Real API Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch from real API. Check ID or network.' });
  }
});

// 3. TSETMC History (with Fallback)
app.get('/api/tse/history/:symbolId', async (req, res) => {
  const symbolId = String(req.params.symbolId);
  if (!/^[A-Z0-9-]+$/.test(symbolId)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  // This endpoint currently serves generated research data. It is deliberately
  // labelled so clients cannot mistake it for an exchange history feed.
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

  const suggestedRiskCapital = regime === 'HIGH_VOLATILITY' ? 0.02 : 0.05;
  res.json({
    source: 'DIGITAL_TWIN',
    simulated: true,
    data: historyData,
    analysis: {
      prediction: analysis.action,
      confidence: analysis.confidence,
      regime,
      risk: {
        valueAtRisk95: var95,
        suggestedRiskCapital,
        sizingMethod: 'CONSERVATIVE_RULE_BASED',
      },
    },
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
    logger.error('Real API Info Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch from real API. Please try again later.' });
  }
});

// 5. Deep Training (Strategy Optimization)
app.post('/api/train', async (req, res) => {
  const requestBody = req.body || {};
  let symbol = requestBody.symbol || 'SAF1403';
  const historyData = requestBody.historyData || [];

  if (typeof symbol !== 'string' || !/^[A-Z0-9-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  if (!Array.isArray(historyData) || historyData.length > 10_000 || historyData.some(candle => !isValidCandle(candle))) {
    return res.status(400).json({ error: 'historyData must contain at most 10,000 valid OHLCV candles' });
  }

  logger.info(`Starting deep training for ${symbol} with ${historyData.length} data points...`);

  if (historyData.length < 50) {
    return res.json({
      success: true,
      message: 'Not enough data points for deep training, using fallback.',
      performance: { winRate: 0.5 }
    });
  }

  try {
    // 1. Prepare data
    // Extract close prices
    const closePrices = historyData.map(d => d.close);

    // Apply Fractional Differentiation (d=0.5, window=10)
    const fracDiffClose = fractionalDiff(closePrices, 0.5, 10);

    // Create sequences (window size = 20)
    const windowSize = 20;
    const numSequences = Math.max(0, fracDiffClose.length - 1 - windowSize);
    const X = new Array(numSequences);
    const Y = new Array(numSequences);

    for (let i = windowSize; i < fracDiffClose.length - 1; i++) {
      const seqIndex = i - windowSize;
      // Create feature vector (just fracDiffClose for simplicity in this example)
      // A full implementation would include Technical Indicators, Order Book Features, etc.
      const seq = new Array(windowSize);
      for (let j = 0; j < windowSize; j++) seq[j] = [fracDiffClose[seqIndex + j]];
      X[seqIndex] = seq;

      // Target: 0 (DOWN), 1 (HOLD), 2 (UP)
      const currentPrice = closePrices[i];
      const nextPrice = closePrices[i + 1];
      const return_pct = (nextPrice - currentPrice) / currentPrice;

      let label = 1; // HOLD
      if (return_pct > 0.001) label = 2; // UP
      else if (return_pct < -0.001) label = 0; // DOWN

      Y[seqIndex] = label;
    }

    if (numSequences < 20) {
      return res.json({
        success: true,
        message: 'Not enough sequences generated.',
        performance: { winRate: 0.5 }
      });
    }

    // 2. Purged K-Fold Cross-Validation
    const numClasses = 3;
    const folds = purgedKFold(numSequences, 5, 5);

    let allYTrue = [];
    let allYPredProbs = [];
    let equityCurve = [1000]; // Start with 1000
    let returns = [];

    // Train on the last fold for demonstration, or average over folds
    const fold = folds[folds.length - 1];

    // Pre-allocate flat arrays for training and validation to avoid mass array slicing
    const trainIndices = fold.trainIndices;
    const valIndices = fold.valIndices;
    const numTrain = trainIndices.length;
    const numVal = valIndices.length;

    const xTrainFlat = new Float32Array(numTrain * windowSize);
    for (let i = 0; i < numTrain; i++) {
      const idx = trainIndices[i];
      const offset = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        xTrainFlat[offset + j] = fracDiffClose[idx + j];
      }
    }
    const xTrain = tf.tensor3d(xTrainFlat, [numTrain, windowSize, 1]);

    const xValFlat = new Float32Array(numVal * windowSize);
    for (let i = 0; i < numVal; i++) {
      const idx = valIndices[i];
      const offset = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        xValFlat[offset + j] = fracDiffClose[idx + j];
      }
    }
    const xVal = tf.tensor3d(xValFlat, [numVal, windowSize, 1]);

    const yTrainLabels = tf.tensor1d(trainIndices.map(idx => Y[idx]), 'int32');
    const yTrain = tf.oneHot(yTrainLabels, numClasses);
    const yVal = valIndices.map(idx => Y[idx]);

    // Build and train TCN
    const model = buildTCN([windowSize, 1], numClasses);

    await model.fit(xTrain, yTrain, {
      epochs: 5, // Small number for quick execution
      batchSize: 32,
      verbose: 0
    });

    // Predict on validation set
    const preds = model.predict(xVal);
    const predProbs = await preds.array();

    let correct = 0;
    for (let i = 0; i < predProbs.length; i++) {
      const probs = predProbs[i];
      let maxProb = probs[0];
      let predClass = 0;
      for (let j = 1; j < probs.length; j++) {
        if (probs[j] > maxProb) {
          maxProb = probs[j];
          predClass = j;
        }
      }
      const trueClass = yVal[i];

      allYTrue.push(trueClass);
      allYPredProbs.push(predProbs[i]);

      if (predClass === trueClass) correct++;

      // Simulate trading for metrics
      // Simply: if UP, buy; if DOWN, sell short.
      const return_pct = (closePrices[fold.valIndices[i] + 1] - closePrices[fold.valIndices[i]]) / closePrices[fold.valIndices[i]];
      let tradeReturn = 0;
      if (predClass === 2) tradeReturn = return_pct;
      else if (predClass === 0) tradeReturn = -return_pct;

      returns.push(tradeReturn);
      equityCurve.push(equityCurve[equityCurve.length - 1] * (1 + tradeReturn));
    }

    const outOfSampleAccuracy = predProbs.length > 0 ? correct / predProbs.length : 0;
    const sharpeRatio = calculateSharpeRatio(returns);
    const maxDrawdown = calculateMaxDrawdown(equityCurve);
    const calibrationError = calculateCalibrationError(allYTrue, allYPredProbs);

    tf.dispose([xTrain, yTrainLabels, yTrain, xVal, preds]);
    model.dispose();

    res.json({
      success: true,
      message: 'Model trained and evaluated on the purged holdout fold.',
      performance: {
        winRate: outOfSampleAccuracy,
        accuracy: outOfSampleAccuracy,
        sharpeRatio,
        maxDrawdown,
        calibrationError,
        validationSamples: predProbs.length,
      }
    });
  } catch (error) {
    logger.error("Training error:", error);
    res.status(500).json({ error: 'Internal server error during training' });
  }
});
// Helper to generate fake history anchored to real price
function generateHistory(currentCandle) {
    const count = 100;
    const candles = new Array(count);
    let lastClose = currentCandle.close * 0.95; // start 5% lower to create a trend
    const tfMs = 60 * 60 * 1000;
    const now = currentCandle.timestamp;

    for (let i = 0; i < count - 1; i++) {
        const change = lastClose * ((crypto.randomBytes(4).readUInt32BE() / 0x100000000) * 0.02 - 0.01);
        const close = lastClose + change;
        candles[i] = {
            timestamp: now - (count - i) * tfMs,
            open: lastClose,
            high: Math.max(lastClose, close) * 1.01,
            low: Math.min(lastClose, close) * 0.99,
            close: close,
            volume: Math.floor((crypto.randomBytes(4).readUInt32BE() / 0x100000000) * 50000),
            openInterest: 5000,
            basis: 0,
            warehouseVolume: 10000
        };
        lastClose = close;
    }
    // Push the real current candle last
    candles[count - 1] = currentCandle;
    return candles;
}


// 3. Historical Data
app.get('/api/market/history', (req, res) => {
  const symbol = String(req.query.symbol || 'SAF1403');
  const years = req.query.years === undefined ? 3 : Number(req.query.years);

  if (!/^[A-Z0-9-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  if (!Number.isFinite(years) || years <= 0 || years > 10) {
    return res.status(400).json({ error: 'years must be greater than 0 and no more than 10' });
  }

  try {
    const data = generateHistoricalData(symbol, years);
    res.json(data);
  } catch (error) {
    logger.error('Error in /api/market/history:', error);
    res.status(500).json({ error: 'Failed to generate historical data' });
  }
});

// AI Prediction endpoint using ONNX runtime

app.post('/api/predict', async (req, res) => {
  try {
    const { inputData } = req.body || {}; // Expecting [batch_size, 30, 10] array
    if (!Array.isArray(inputData) || inputData.length > 256) {
        return res.status(400).json({ error: 'inputData must be an array with at most 256 sequences' });
    }
    if (!modelManager.session) return res.status(503).json({ error: 'Prediction model is not ready' });

    const start = Date.now();
    const correlationId = req.correlationId;
    pinoLogger.info({ correlationId, event: 'predict_request' }, 'Starting model prediction');

    const predictions = await modelManager.predict(inputData, correlationId);

    const end = Date.now();
    const inferenceTimeMs = end - start;
    pinoLogger.info({ correlationId, inferenceTimeMs, event: 'predict_success' }, 'Model prediction completed');


    const driftStatus = modelManager.monitorDrift(inputData, predictions);

    if (driftStatus.detected) {
      pinoLogger.warn({ correlationId, driftScore: driftStatus.score }, 'Prediction uncertainty threshold exceeded; offline retraining is recommended');
    }

    const memoryUsage = process.memoryUsage();

    res.json({
        predictions,
        metadata: {
            version: modelManager.getVersion(),
            inferenceTimeMs,
            driftScore: driftStatus.score,
            retrainRecommended: driftStatus.detected,
            memoryMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100
        }
    });
  } catch (error) {
    pinoLogger.error({ correlationId: req.correlationId, error: error.message }, 'Prediction failed');
    const status = error instanceof TypeError ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'Prediction error' });
  }
});

// ==========================================
// Experimental simulation endpoints
// ==========================================
const experimentalSimulationsEnabled = process.env.ENABLE_EXPERIMENTAL_SIMULATIONS === 'true';
app.use('/api/advanced', (req, res, next) => {
  if (!experimentalSimulationsEnabled) {
    return res.status(501).json({
      error: 'Experimental simulated engines are disabled',
      hint: 'Set ENABLE_EXPERIMENTAL_SIMULATIONS=true only for demos and research.',
    });
  }
  res.setHeader('x-simulated-output', 'true');
  next();
});

app.post('/api/advanced/ensemble', async (req, res) => {
    try {
        const { features } = req.body || {};
        const result = ensembleEngine.predictEnsemble(features || {});

        // Simulate online learning if outcome is provided
        if (req.body?.actualOutcome !== undefined) {
            ensembleEngine.updateWeights(req.body.actualOutcome);
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in Ensemble prediction:', error);
        res.status(500).json({ error: 'Internal server error processing ensemble prediction' });
    }
});

app.get('/api/advanced/altdata/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const result = altDataEngine.fuseData(symbol);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in Alt Data processing:', error);
        res.status(500).json({ error: 'Internal server error processing alternative data' });
    }
});

app.post('/api/advanced/portfolio', async (req, res) => {
    try {
        const { method } = req.body || {}; // MVO_BL, RISK_PARITY, HRP
        const result = portfolioOptimizer.optimizePortfolio(method);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in Portfolio Optimization:', error);
        res.status(500).json({ error: 'Internal server error optimizing portfolio' });
    }
});

app.post('/api/advanced/xai', async (req, res) => {
    try {
        const { prediction, features } = req.body || {};
        const result = xaiEngine.explainPrediction(prediction || 0.5, features || {});
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in XAI generation:', error);
        res.status(500).json({ error: 'Internal server error generating explanation' });
    }
});

app.post('/api/advanced/federated/round', async (req, res) => {
    try {
        const result = federatedEngine.performRound();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in Federated Learning round:', error);
        res.status(500).json({ error: 'Internal server error during federated learning round' });
    }
});

app.post('/api/advanced/hpo/optimize', async (req, res) => {
    try {
        const { nTrials } = req.body || {};
        const result = hpoEngine.runOptimization(nTrials || 10);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in Hyperparameter Optimization:', error);
        res.status(500).json({ error: 'Internal server error during HPO' });
    }
});

// ==========================================
// Phase 1 - Real Data Endpoints replacing mocks
// ==========================================
import { positionLedger } from './modules/positionLedger.js';
import { orderLedger } from './modules/orderLedger.js';
import { performanceLedger } from './modules/performanceLedger.js';
import { initModelRegistry } from './modules/modelRegistry.js';
import { learningPipeline } from './modules/learningPipeline.js';
import { paperTradingEngine } from './modules/paperTradingEngine.js';

const modelRegistryInstance = initModelRegistry(modelManager);

// Positions - Real Ledger
app.get('/api/positions', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'SAF1403');
    if (!/^[A-Z0-9-]+$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const positions = positionLedger.getPositions(symbol);
    res.json({ success: true, source: 'POSITION_LEDGER', simulated: false, data: positions, count: positions.length });
  } catch (error) {
    logger.error('Error in /api/positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

app.get('/api/positions/all', (req, res) => {
  try {
    const positions = positionLedger.getAllPositions();
    res.json({ success: true, source: 'POSITION_LEDGER', data: positions });
  } catch (error) {
    logger.error('Error in /api/positions/all:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Orders - Order State Machine
app.get('/api/orders', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'SAF1403');
    if (!/^[A-Z0-9-]+$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const orders = orderLedger.getOrders(symbol);
    res.json({ success: true, source: 'ORDER_STATE_MACHINE', simulated: false, data: orders });
  } catch (error) {
    logger.error('Error in /api/orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/orders/all', (req, res) => {
  try {
    const orders = orderLedger.getAllOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Performance - Trade Ledger
app.get('/api/performance', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'SAF1403');
    if (!/^[A-Z0-9-]+$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const perf = performanceLedger.getPerformance(symbol);
    res.json({ success: true, source: 'TRADE_LEDGER', simulated: false, data: perf });
  } catch (error) {
    logger.error('Error in /api/performance:', error);
    res.status(500).json({ error: 'Failed to calculate performance' });
  }
});

app.post('/api/performance/calculate', (req, res) => {
  try {
    const { trades } = req.body || {};
    if (!Array.isArray(trades)) return res.status(400).json({ error: 'trades must be array' });
    const perf = performanceLedger.calculatePerformanceFromTrades(trades);
    res.json({ success: true, data: perf });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate performance' });
  }
});

// Models - Real Model Registry
app.get('/api/models', (req, res) => {
  try {
    const metrics = modelRegistryInstance.getMetrics();
    res.json({ success: true, source: 'MODEL_REGISTRY', simulated: false, data: metrics });
  } catch (error) {
    logger.error('Error in /api/models:', error);
    res.status(500).json({ error: 'Failed to fetch model metrics' });
  }
});

app.get('/api/models/status', (req, res) => {
  try {
    const metrics = modelRegistryInstance.getMetrics();
    res.json({
      status: 'Online',
      service: 'Model Registry',
      ...metrics,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch model status' });
  }
});

// Learning - Research Pipeline
app.get('/api/learning', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'SAF1403');
    const data = learningPipeline.getLearningData(symbol);
    res.json({ success: true, source: 'PYTHON_RESEARCH_PIPELINE', simulated: false, data });
  } catch (error) {
    logger.error('Error in /api/learning:', error);
    res.status(500).json({ error: 'Failed to fetch learning data' });
  }
});

app.get('/api/learning/weights', (req, res) => {
  try {
    const data = learningPipeline.getLearningData();
    res.json({ success: true, weights: data.currentWeights, history: data.history.slice(0,20) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weights' });
  }
});

// Paper Trading - Real Engine (no Math.random)
app.post('/api/paper-trading/execute', (req, res) => {
  try {
    const { order, forecast, marketPrice } = req.body || {};
    if (!order || !forecast) return res.status(400).json({ error: 'order and forecast required' });
    const result = paperTradingEngine.executeTrade(order, forecast, marketPrice || order.entry);
    modelRegistryInstance.recordInference(result.trade ? 15 : 0);
    res.json({ success: true, source: 'PAPER_TRADING_ENGINE', simulated: false, data: result });
  } catch (error) {
    logger.error('Error in paper trading execute:', error);
    res.status(500).json({ error: 'Failed to execute paper trade' });
  }
});

app.get('/api/paper-trading/trades', (req, res) => {
  try {
    const trades = paperTradingEngine.getTrades();
    const stats = paperTradingEngine.getStats();
    res.json({ success: true, data: { trades, stats } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch paper trades' });
  }
});

app.get('/api/paper-trading/stats', (req, res) => {
  try {
    const stats = paperTradingEngine.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Override /api/status to include real model metrics (no hard-coded Inference: 18ms)
const originalStatusHandler = app._getStatusHandler;
app.get('/api/status', (req, res) => {
  const registryMetrics = modelRegistryInstance ? modelRegistryInstance.getMetrics() : { inferenceLatency: 0, version: '2.5.0', modelReady: Boolean(modelManager.session) };
  res.json({
    status: 'Online',
    service: 'Robot Trader Intelligence Core',
    version: registryMetrics.version || '2.5.0',
    modelReady: registryMetrics.modelReady,
    modelVersion: registryMetrics.version,
    inferenceLatency: registryMetrics.inferenceLatency,
    accuracy: registryMetrics.accuracy,
    precision: registryMetrics.precision,
    memoryMB: registryMetrics.memoryMB,
  });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  logger.error('Unhandled request error', { correlationId: req.correlationId, error: err.stack || err.message });
  if (res.headersSent) return next(err);
  res.status(err.message === 'Origin is not allowed by CORS policy' ? 403 : 500).json({ error: 'Internal Server Error' });
});

export let server;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Smart Analysis Backend listening on port ${port}`);
  });

  const shutdown = signal => {
    logger.info(`Received ${signal}; shutting down HTTP server`);
    server.close(error => {
      if (error) {
        logger.error('HTTP shutdown failed', { error: error.message });
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
