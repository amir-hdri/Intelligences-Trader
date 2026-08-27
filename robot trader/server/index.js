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

// --- Database & authentication layer (node:sqlite, zero native deps) ---
import { createDatabase } from './db/database.js';
import { createUser, findUserByUsername, recordAudit } from './auth/authService.js';
import {
  insertPrediction, listPredictions, updatePredictionStatus,
  insertTrade, closeTrade, listTrades,
  listAuditEvents,
} from './db/repositories.js';

// Initialize the database (graceful degradation if node:sqlite is unavailable).
let db = null;
try {
  ({ db } = createDatabase());
  logger.info(`Database ready (${process.env.DB_PATH || './data/trader.db'})`);
} catch (dbErr) {
  logger.error('Database unavailable — auth/persistence endpoints will return 503.', dbErr.message);
}

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
import {
  BacktestRepository,
  BacktestService,
  DataCatalog,
  OnnxModelAdapter,
  createBacktestRouter,
} from './modules/backtesting/index.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const modelManager = new ModelManager();
const modelPath = process.env.MODEL_PATH || path.join(serviceDirectory, 'models', 'market_model.onnx');
modelManager.loadModel(modelPath, process.env.MODEL_VERSION || '1.0.0').catch(error => {
  logger.error('Initial model load failed', { error: error.message });
});

const backtestRepository = new BacktestRepository();
const backtestDataCatalog = new DataCatalog(backtestRepository);
const backtestModelAdapter = new OnnxModelAdapter(modelManager);
export const backtestService = new BacktestService({
  repository: backtestRepository,
  dataCatalog: backtestDataCatalog,
  modelAdapter: backtestModelAdapter,
  maxConcurrent: Number.parseInt(process.env.BACKTEST_MAX_CONCURRENT || '2', 10),
  maxQueued: Number.parseInt(process.env.BACKTEST_MAX_QUEUED || '100', 10),
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
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
}
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});
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


// Authentication fails closed when explicitly enabled and never uses fallback secrets.
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const authSetting = process.env.AUTH_REQUIRED?.trim().toLowerCase();
if (authSetting && !['true', 'false'].includes(authSetting)) {
  throw new Error('AUTH_REQUIRED must be true or false');
}
const AUTH_REQUIRED = authSetting ? authSetting === 'true' : process.env.NODE_ENV === 'production';

if (AUTH_REQUIRED && (
  !JWT_SECRET || JWT_SECRET.length < 32 ||
  !REFRESH_SECRET || REFRESH_SECRET.length < 32 ||
  !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD
)) {
  throw new Error('AUTH_REQUIRED=true needs 32+ character JWT/refresh secrets and configured admin credentials');
}

// Rate limiter: max 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  message: { error: 'Too many requests; retry after one minute' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: { error: 'Too many authentication attempts; retry later' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);

const authenticateToken = (req, res, next) => {
  if (req.path === '/status') return next();
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === 'string' ? /^Bearer\s+([^\s]+)$/.exec(authHeader) : null;
  if (!match) return res.status(401).json({ error: 'Bearer access token required' });

  jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] }, (error, user) => {
    if (error || !user || typeof user.name !== 'string') {
      return res.status(403).json({ error: 'Access token is invalid or expired' });
    }
    req.user = { name: user.name, role: user.role };
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Guard: if the database is unavailable, stateful endpoints cannot serve.
const requireDb = (req, res, next) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable (requires Node 22.13+ with node:sqlite)' });
  next();
};

const secureCredentialMatch = (supplied, expected) => {
  const left = crypto.createHash('sha256').update(String(supplied)).digest();
  const right = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(left, right);
};

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  if (!JWT_SECRET || !REFRESH_SECRET || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Authentication is not configured' });
  }
  const { username, password } = req.body || {};
  const validShape = typeof username === 'string' && username.length <= 128
    && typeof password === 'string' && password.length <= 1024;
  const validCredentials = validShape
    && secureCredentialMatch(username, process.env.ADMIN_USERNAME)
    && secureCredentialMatch(password, process.env.ADMIN_PASSWORD);
  if (!validCredentials) {
    auditLogger.log('LOGIN_FAILED', req.ip, typeof username === 'string' ? username.slice(0, 128) : 'invalid');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = { name: username, role: 'admin' };
  const accessToken = jwt.sign(user, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  const refreshToken = jwt.sign(user, REFRESH_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  auditLogger.log('LOGIN_SUCCESS', req.ip, username);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 });
});

app.post('/api/auth/register', requireDb, (req, res) => {
  const { username, password, role } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 chars (letters, digits, . _ -)' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (findUserByUsername(db, username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  // Only an authenticated admin may create an admin; otherwise default to trader.
  const requestedRole = role === 'admin' ? 'admin' : 'trader';
  let finalRole = 'trader';
  if (requestedRole === 'admin') {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Admin creation requires authentication' });
    let isAdmin = false;
    try { isAdmin = jwt.verify(token, JWT_SECRET).role === 'admin'; } catch { isAdmin = false; }
    if (!isAdmin) return res.status(403).json({ error: 'Only an admin can create an admin account' });
    finalRole = 'admin';
  }

  const created = createUser(db, { username, password, role: finalRole });
  recordAudit(db, { eventType: 'REGISTER', username, ip: req.ip, correlationId: req.correlationId });
  res.status(201).json({ id: created.id, username: created.username, role: created.role });
});

app.post('/api/auth/refresh', (req, res) => {
  if (!JWT_SECRET || !REFRESH_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
  const { token } = req.body || {};
  if (typeof token !== 'string' || token.length > 4096) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] }, (error, user) => {
    if (error || !user || typeof user.name !== 'string') {
      return res.status(403).json({ error: 'Refresh token is invalid or expired' });
    }
    const accessToken = jwt.sign(
      { name: user.name, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' },
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ accessToken, tokenType: 'Bearer', expiresIn: 900 });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// In secured deployments every API route is protected except health and the
// two authentication endpoints, which were registered above this middleware.
if (AUTH_REQUIRED) app.use('/api', authenticateToken);

// Phase 3 deterministic, point-in-time backtesting API.
app.use('/api/backtests', createBacktestRouter(backtestService));

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
               modelRegistryInstance.recordInference(Date.now() - tcnStart);
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




app.get('/metrics', (req, res) => {
  const averageDuration = requestMetrics.total > 0 ? requestMetrics.durationMs / requestMetrics.total : 0;
  res.type('text/plain').send([
    '# TYPE http_requests_total counter',
    `http_requests_total ${requestMetrics.total}`,
    '# TYPE http_request_errors_total counter',
    `http_request_errors_total ${requestMetrics.errors}`,
    '# TYPE http_request_duration_milliseconds gauge',
    `http_request_duration_milliseconds ${averageDuration.toFixed(3)}`,
    '# TYPE backtest_runs_running gauge',
    `backtest_runs_running ${backtestService.running}`,
    '# TYPE backtest_runs_queued gauge',
    `backtest_runs_queued ${backtestService.queue.length}`,
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
    // Generate explicitly-labelled synthetic history anchored to the real last price.
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
  try {
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
  } catch (error) {
    logger.error('Error in /api/tse/history:', error);
    res.status(500).json({ error: 'Failed to fetch historical analysis' });
  }
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

// 5. Bounded research training (single process-local job at a time)
let trainingInProgress = false;
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

  if (trainingInProgress) {
    return res.status(409).json({ error: 'A research training job is already running' });
  }
  trainingInProgress = true;
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
    let xTrain, yTrainLabels, yTrain, xVal, preds, model;
    try {
      xTrain = tf.tensor3d(xTrainFlat, [numTrain, windowSize, 1]);

      const xValFlat = new Float32Array(numVal * windowSize);
      for (let i = 0; i < numVal; i++) {
        const idx = valIndices[i];
        const offset = i * windowSize;
        for (let j = 0; j < windowSize; j++) {
          xValFlat[offset + j] = fracDiffClose[idx + j];
        }
      }
      xVal = tf.tensor3d(xValFlat, [numVal, windowSize, 1]);

      yTrainLabels = tf.tensor1d(trainIndices.map(idx => Y[idx]), 'int32');
      yTrain = tf.oneHot(yTrainLabels, numClasses);
      const yVal = valIndices.map(idx => Y[idx]);

      // Build and train TCN
      model = buildTCN([windowSize, 1], numClasses);

      await model.fit(xTrain, yTrain, {
        epochs: 5, // Small number for quick execution
        batchSize: 32,
        verbose: 0
      });

      // Predict on validation set
      preds = model.predict(xVal);
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
      modelRegistryInstance.recordEvaluation({
        accuracy: outOfSampleAccuracy,
        precision: null,
        recall: null,
        f1Score: null,
        driftScore: calibrationError,
        timestamp: Date.now(),
      });

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
    } finally {
      // Dispose every created tensor/model even when training fails midway,
      // otherwise repeated failures accumulate GPU/WASM memory.
      for (const tensor of [xTrain, yTrainLabels, yTrain, xVal, preds]) {
        try { tensor?.dispose(); } catch { /* already disposed */ }
      }
      try { model?.dispose(); } catch { /* already disposed */ }
    }
  } catch (error) {
    logger.error("Training error:", error);
    res.status(500).json({ error: 'Internal server error during training' });
  } finally {
    trainingInProgress = false;
  }
});
// Helper to generate explicitly-labelled synthetic history anchored to real price
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
    res.json({ source: 'DIGITAL_TWIN_HISTORY', simulated: true, data });
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
    modelRegistryInstance.recordInference(inferenceTimeMs);
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

        // Online learning: only feed a finite outcome in [-1, 1]; anything
        // else would poison every model weight with NaN until restart.
        if (req.body?.actualOutcome !== undefined) {
            const outcome = Number(req.body.actualOutcome);
            if (!Number.isFinite(outcome) || outcome < -1 || outcome > 1) {
                return res.status(400).json({ error: 'actualOutcome must be a finite number between -1 and 1' });
            }
            ensembleEngine.updateWeights(outcome);
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
        // Clamp hard: each trial evaluates strategies over the full candle
        // history synchronously, so an unbounded value would block the event loop.
        const MAX_HPO_TRIALS = 200;
        const requestedTrials = Number(nTrials);
        const safeTrials = Number.isFinite(requestedTrials)
            ? Math.min(MAX_HPO_TRIALS, Math.max(1, Math.floor(requestedTrials)))
            : 10;
        const result = hpoEngine.runOptimization(safeTrials);
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
// Persistence endpoints (auth required)
// ==========================================

const validAction = (a) => ['BUY', 'SELL', 'HOLD'].includes(a);
const validSymbol = (s) => typeof s === 'string' && /^[A-Z0-9-]{1,32}$/.test(s);

// Predictions
app.get('/api/predictions', authenticateToken, requireDb, (req, res) => {
  const { symbol, status } = req.query;
  const rows = listPredictions(db, {
    symbol: validSymbol(symbol) ? symbol : null,
    status: ['PENDING', 'WIN', 'LOSS', 'CANCELLED'].includes(status) ? status : null,
    limit: 1000,
  });
  res.json({ predictions: rows });
});

app.post('/api/predictions', authenticateToken, requireDb, (req, res) => {
  const { symbol, action, entryPrice, targetPrice, stopLoss, confidence, indicators, reason, weights } = req.body || {};
  if (!validSymbol(symbol) || !validAction(action)) {
    return res.status(400).json({ error: 'Invalid symbol or action' });
  }
  for (const v of [entryPrice, targetPrice, stopLoss]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return res.status(400).json({ error: 'entryPrice/targetPrice/stopLoss must be finite numbers' });
    }
  }
  const id = insertPrediction(db, {
    symbol, action,
    entryPrice, targetPrice, stopLoss,
    confidence: typeof confidence === 'number' ? confidence : 0.5,
    indicators, reason, weights,
  });
  res.status(201).json({ id });
});

app.post('/api/predictions/evaluate', authenticateToken, requireDb, (req, res) => {
  const { symbol, currentPrice } = req.body || {};
  if (!validSymbol(symbol) || typeof currentPrice !== 'number') {
    return res.status(400).json({ error: 'symbol and numeric currentPrice are required' });
  }
  const pending = listPredictions(db, { symbol, status: 'PENDING', limit: 1000 });
  let settled = 0;
  for (const p of pending) {
    if (p.action === 'BUY' && currentPrice >= p.targetPrice) {
      updatePredictionStatus(db, p.id, 'WIN', currentPrice); settled++;
    } else if (p.action === 'BUY' && currentPrice <= p.stopLoss) {
      updatePredictionStatus(db, p.id, 'LOSS', currentPrice); settled++;
    } else if (p.action === 'SELL' && currentPrice <= p.targetPrice) {
      updatePredictionStatus(db, p.id, 'WIN', currentPrice); settled++;
    } else if (p.action === 'SELL' && currentPrice >= p.stopLoss) {
      updatePredictionStatus(db, p.id, 'LOSS', currentPrice); settled++;
    }
  }
  res.json({ settled });
});

app.delete('/api/predictions', authenticateToken, requireDb, (req, res) => {
  db.prepare('DELETE FROM predictions').run();
  res.json({ cleared: true });
});

// Trades
app.get('/api/trades', authenticateToken, requireDb, (req, res) => {
  const { symbol } = req.query;
  res.json({ trades: listTrades(db, { symbol: validSymbol(symbol) ? symbol : null, limit: 1000 }) });
});

app.post('/api/trades', authenticateToken, requireDb, (req, res) => {
  const { symbol, side, quantity, entryPrice, strategy } = req.body || {};
  if (!validSymbol(symbol) || !['BUY', 'SELL'].includes(side)) {
    return res.status(400).json({ error: 'Invalid symbol or side' });
  }
  if (typeof entryPrice !== 'number' || !Number.isFinite(entryPrice)) {
    return res.status(400).json({ error: 'entryPrice must be a finite number' });
  }
  const id = insertTrade(db, {
    symbol, side,
    quantity: typeof quantity === 'number' ? quantity : 0,
    entryPrice, strategy,
  });
  recordAudit(db, { eventType: 'TRADE_OPEN', username: req.user?.name, ip: req.ip, correlationId: req.correlationId, details: { id, symbol, side } });
  res.status(201).json({ id });
});

app.post('/api/trades/:id/close', authenticateToken, requireDb, (req, res) => {
  const id = Number(req.params.id);
  const { exitPrice, status } = req.body || {};
  if (!Number.isInteger(id) || typeof exitPrice !== 'number' || !Number.isFinite(exitPrice)) {
    return res.status(400).json({ error: 'valid id and numeric exitPrice are required' });
  }
  const closed = closeTrade(db, id, { exitPrice, status: status || 'CLOSED' });
  if (!closed) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: closed });
});

// Audit events (admin only)
app.get('/api/audit', authenticateToken, requireAdmin, requireDb, (req, res) => {
  res.json({ events: listAuditEvents(db, { limit: 500 }) });
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
    res.json({
      success: true,
      source: 'PROCESS_LOCAL_PAPER_POSITION_LEDGER',
      simulated: true,
      simulationType: 'PAPER_TRADING',
      data: positions,
      count: positions.length,
    });
  } catch (error) {
    logger.error('Error in /api/positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

app.get('/api/positions/all', (req, res) => {
  try {
    const positions = positionLedger.getAllPositions();
    res.json({ success: true, source: 'PROCESS_LOCAL_PAPER_POSITION_LEDGER', simulated: true, simulationType: 'PAPER_TRADING', data: positions });
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
    res.json({ success: true, source: 'PROCESS_LOCAL_PAPER_ORDER_LEDGER', simulated: true, simulationType: 'PAPER_TRADING', data: orders });
  } catch (error) {
    logger.error('Error in /api/orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/orders/all', (req, res) => {
  try {
    const orders = orderLedger.getAllOrders();
    res.json({ success: true, source: 'PROCESS_LOCAL_PAPER_ORDER_LEDGER', simulated: true, simulationType: 'PAPER_TRADING', data: orders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Performance - Trade Ledger
app.get('/api/performance', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'SAF1403');
    if (!/^[A-Z0-9-]+$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const perf = performanceLedger.getPerformance(symbol, paperTradingEngine.getTrades(), 1_000_000);
    res.json({
      success: true,
      source: 'REALIZED_PAPER_TRADE_LEDGER',
      simulated: true,
      simulationType: 'PAPER_TRADING',
      data: perf,
    });
  } catch (error) {
    logger.error('Error in /api/performance:', error);
    res.status(500).json({ error: 'Failed to calculate performance' });
  }
});

app.post('/api/performance/calculate', (req, res) => {
  try {
    const { trades, initialCapital } = req.body || {};
    if (!Array.isArray(trades) || trades.length > 10_000) {
      return res.status(400).json({ error: 'trades must be an array with at most 10,000 items' });
    }
    const perf = performanceLedger.calculatePerformanceFromTrades(trades, initialCapital ?? 1_000_000);
    res.json({ success: true, data: perf });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to calculate performance' });
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
    res.json({ success: true, source: 'DETERMINISTIC_RESEARCH_FIXTURE', simulated: true, simulationType: 'RESEARCH', data });
  } catch (error) {
    logger.error('Error in /api/learning:', error);
    res.status(500).json({ error: 'Failed to fetch learning data' });
  }
});

app.get('/api/learning/weights', (req, res) => {
  try {
    const data = learningPipeline.getLearningData();
    res.json({ success: true, source: 'DETERMINISTIC_RESEARCH_FIXTURE', simulated: true, weights: data.currentWeights, history: data.history.slice(0,20) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weights' });
  }
});

const normalizeLegacyPaperTrade = body => {
  const { order, forecast } = body || {};
  if (!order || typeof order !== 'object' || !forecast || typeof forecast !== 'object') {
    throw new TypeError('order and forecast objects are required');
  }
  const action = String(order.action || '').toUpperCase();
  const symbol = String(order.symbol || '').toUpperCase();
  if (!['BUY', 'SELL'].includes(action)) throw new TypeError('order.action must be BUY or SELL');
  if (!/^[A-Z0-9-]{1,64}$/.test(symbol)) throw new TypeError('order.symbol is invalid');
  const numeric = (value, name, { min = 0, max = 1e15, required = true } = {}) => {
    if (value == null && !required) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= min || parsed > max) throw new TypeError(`${name} is invalid`);
    return parsed;
  };
  const entry = numeric(order.entry ?? body.marketPrice, 'order.entry');
  const qty = numeric(order.qty, 'order.qty', { max: 1e9 });
  const leverage = numeric(order.leverage ?? 1, 'order.leverage', { max: 100 });
  const stopLoss = numeric(order.stopLoss, 'order.stopLoss', { required: false });
  const takeProfit = numeric(order.takeProfit, 'order.takeProfit', { required: false });
  if (stopLoss != null && takeProfit != null) {
    const validBracket = action === 'BUY'
      ? stopLoss < entry && takeProfit > entry
      : stopLoss > entry && takeProfit < entry;
    if (!validBracket) throw new TypeError('stop-loss/take-profit bracket is inconsistent with order side');
  }
  const forecastAction = String(forecast.action || 'HOLD').toUpperCase();
  if (!['BUY', 'SELL', 'HOLD'].includes(forecastAction)) throw new TypeError('forecast.action is invalid');
  const confidence = Number(forecast.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new TypeError('forecast.confidence must be in [0, 1]');
  return {
    order: { ...order, action, symbol, qty, entry, leverage, stopLoss, takeProfit },
    forecast: { ...forecast, action: forecastAction, confidence },
    marketPrice: numeric(body.marketPrice ?? entry, 'marketPrice'),
  };
};

// Legacy deterministic paper outcome simulator. It is explicitly labelled as
// simulated; P2 execution should be used when fill-level behavior is required.
app.post('/api/paper-trading/execute', (req, res) => {
  try {
    const { order, forecast, marketPrice } = normalizeLegacyPaperTrade(req.body);
    const result = paperTradingEngine.executeTrade(order, forecast, marketPrice);
    res.json({ success: true, source: 'DETERMINISTIC_PAPER_SIMULATOR', simulated: true, simulationType: 'PAPER_TRADING', data: result });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    logger.error('Error in paper trading execute:', error);
    return res.status(500).json({ error: 'Failed to execute paper trade' });
  }
});

// P2 Advanced endpoints (ML signal + realistic execution)
app.post('/api/paper-trading/p2/execute-ml', (req, res) => {
  try {
    const { signal, symbol, marketPrice, size, confidenceThreshold } = req.body || {};
    if (!signal || !symbol) return res.status(400).json({ error: 'signal and symbol required' });
    paperTradingEngine._ensureP2();
    const result = paperTradingEngine.mlBridge.signalToOrder(signal, symbol, marketPrice, {
      ...(size != null ? { size } : {}),
      ...(confidenceThreshold != null ? { confidenceThreshold } : {}),
    });
    res.json({ success: true, source: 'P2_ML_BRIDGE', simulated: true, simulationType: 'PAPER_TRADING', data: result });
  } catch (error) {
    logger.error('Error in P2 ML execute:', error);
    res.status(500).json({ error: 'Failed to execute ML-driven paper trade' });
  }
});

app.get('/api/paper-trading/p2/metrics', (req, res) => {
  try {
    paperTradingEngine.analytics.updateTrades(paperTradingEngine.getTrades());
    const metrics = paperTradingEngine.analytics.getMetrics();
    res.json({ success: true, source: 'P2_ANALYTICS', simulated: true, simulationType: 'PAPER_TRADING', data: metrics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate P2 metrics' });
  }
});

// P2 Report Generator
import { ReportGenerator } from './modules/paperTradingEngine/p2/analytics/ReportGenerator.js';

app.post('/api/paper-trading/p2/report', (req, res) => {
  try {
    const { period = 'daily' } = req.body || {};
    const generator = new ReportGenerator(paperTradingEngine.getTrades());
    const report = generator.generateReport(period);
    res.json({ success: true, source: 'P2_REPORT_SIMULATOR', simulated: true, simulationType: 'PAPER_TRADING', data: report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// P2 Backtest Harness
import { BacktestHarness } from './modules/paperTradingEngine/p2/backtest/BacktestHarness.js';
import { DataNormalizer } from './modules/paperTradingEngine/p2/data/DataNormalizer.js';
import { TickByTickProcessor } from './modules/paperTradingEngine/p2/data/TickByTickProcessor.js';
import { HistoricalDataProvider } from './modules/paperTradingEngine/p2/data/HistoricalDataProvider.js';

const p2TickProcessor = new TickByTickProcessor();
const p2HistoricalProvider = new HistoricalDataProvider();

app.post('/api/paper-trading/p2/backtest', async (req, res) => {
  try {
    const { candles, signals } = req.body || {};
    if (!Array.isArray(candles) || candles.length === 0) {
      return res.status(400).json({ error: 'candles must be a non-empty array' });
    }
    if (!Array.isArray(signals) || signals.length === 0) {
      return res.status(400).json({ error: 'signals must be a non-empty array' });
    }
    paperTradingEngine._ensureP2();
    const result = paperTradingEngine.backtestHarness.run(candles, signals);
    res.json({ success: true, source: 'P2_BACKTEST', simulated: true, simulationType: 'PAPER_TRADING', data: result });
  } catch (error) {
    logger.error('Error in P2 backtest:', error);
    res.status(500).json({ error: 'Failed to run backtest' });
  }
});

// P2 Order Book Simulator
app.get('/api/paper-trading/p2/orderbook', (req, res) => {
  try {
    paperTradingEngine._ensureP2();
    const depth = paperTradingEngine.orderBook.depth(Number(req.query.levels) || 5);
    res.json({ success: true, source: 'P2_ORDER_BOOK', simulated: true, simulationType: 'PAPER_TRADING', data: depth });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read order book' });
  }
});

app.post('/api/paper-trading/p2/orderbook', (req, res) => {
  try {
    const { bids, asks } = req.body || {};
    if (!Array.isArray(bids) || !Array.isArray(asks)) {
      return res.status(400).json({ error: 'bids and asks arrays required' });
    }
    if (bids.length + asks.length > 10_000) {
      return res.status(400).json({ error: 'order book accepts at most 10,000 combined levels' });
    }
    const isValidLevel = (l) => l && Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.qty) && l.qty > 0;
    if (!bids.every(isValidLevel) || !asks.every(isValidLevel)) {
      return res.status(400).json({ error: 'each level requires finite positive price and qty' });
    }
    paperTradingEngine._ensureP2();
    paperTradingEngine.orderBook.updateBook(bids, asks);
    res.json({ success: true, data: paperTradingEngine.orderBook.depth() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order book' });
  }
});

app.post('/api/paper-trading/p2/orderbook/order', (req, res) => {
  try {
    const { side, qty, type = 'MARKET', price, id } = req.body || {};
    if (!['BUY', 'SELL'].includes(side)) return res.status(400).json({ error: 'side must be BUY or SELL' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'qty must be positive' });
    if (!['MARKET', 'LIMIT'].includes(type)) return res.status(400).json({ error: 'type must be MARKET or LIMIT' });
    if (type === 'LIMIT' && (!Number.isFinite(price) || price <= 0)) {
      return res.status(400).json({ error: 'LIMIT orders require a finite positive price' });
    }
    paperTradingEngine._ensureP2();
    const result = type === 'LIMIT'
      ? paperTradingEngine.orderBook.placeLimitOrder(side, price, qty)
      : paperTradingEngine.orderBook.marketOrder(side, qty);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to place order' });
  }
});

app.post('/api/paper-trading/p2/orderbook/cancel', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    paperTradingEngine._ensureP2();
    const result = paperTradingEngine.orderBook.cancelOrder(id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// P2 Order State Machine
app.get('/api/paper-trading/p2/orders', (req, res) => {
  try {
    paperTradingEngine._ensureP2();
    res.json({ success: true, source: 'P2_ORDER_STATE_MACHINE', simulated: true, simulationType: 'PAPER_TRADING', data: paperTradingEngine.orderStateMachine.getAllOrders() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/api/paper-trading/p2/orders', (req, res) => {
  try {
    const { clientOrderId, symbol, action, qty, type = 'MARKET', price, stopPrice } = req.body || {};
    if (!['BUY', 'SELL'].includes(action)) return res.status(400).json({ error: 'action must be BUY or SELL' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'qty must be positive' });
    if (typeof symbol !== 'string' || !/^[A-Z0-9-]{1,64}$/.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol format' });
    }
    if (!['MARKET', 'LIMIT', 'STOP'].includes(type)) return res.status(400).json({ error: 'type must be MARKET, LIMIT or STOP' });
    if (type === 'LIMIT' && (!Number.isFinite(price) || price <= 0)) {
      return res.status(400).json({ error: 'LIMIT orders require a finite positive price' });
    }
    if (type === 'STOP' && (!Number.isFinite(stopPrice) || stopPrice <= 0)) {
      return res.status(400).json({ error: 'STOP orders require a finite positive stopPrice' });
    }
    paperTradingEngine._ensureP2();
    const order = paperTradingEngine.orderStateMachine.createOrder({
      clientOrderId, symbol, action, qty, type, price, stopPrice,
    });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.post('/api/paper-trading/p2/orders/cancel', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    paperTradingEngine._ensureP2();
    const result = paperTradingEngine.orderStateMachine.cancelOrder(id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

app.post('/api/paper-trading/p2/orders/fill', (req, res) => {
  try {
    const { id, filledQty, fillPrice } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (!Number.isFinite(filledQty) || filledQty < 0) return res.status(400).json({ error: 'filledQty must be a non-negative finite number' });
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) return res.status(400).json({ error: 'fillPrice must be a finite positive number' });
    paperTradingEngine._ensureP2();
    const result = paperTradingEngine.orderStateMachine.recordFill(id, filledQty, fillPrice);
    if (!result) return res.status(404).json({ error: 'Order not found or fill not permitted in current state' });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record fill' });
  }
});

// P2 Data feed: historical OHLCV + cache + tick processing
app.post('/api/paper-trading/p2/data/ohlcv', async (req, res) => {
  try {
    const { symbol, timeframe = '1h', limit = 500, refresh = false } = req.body || {};
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    paperTradingEngine._ensureP2();

    let data = refresh ? null : await paperTradingEngine.cache.getOHLCV(symbol, timeframe);
    let source = 'CACHE';
    if (!data) {
      data = await p2HistoricalProvider.fetchHistorical(symbol, timeframe, null, limit);
      source = 'PROVIDER';
      if (data && data.length) await paperTradingEngine.cache.setOHLCV(symbol, timeframe, data);
    }
    if (!data || !data.length) {
      return res.status(502).json({ error: 'No market data available from provider' });
    }
    const normalized = DataNormalizer.normalize(data);
    res.json({ success: true, source, raw: data, normalized });
  } catch (error) {
    logger.error('Error in P2 OHLCV:', error);
    res.status(500).json({ error: 'Failed to fetch OHLCV' });
  }
});

app.post('/api/paper-trading/p2/data/tick', (req, res) => {
  try {
    const { price, volume = 0, timestamp } = req.body || {};
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'price must be positive' });
    p2TickProcessor.addTick({ price, volume, timestamp });
    res.json({ success: true, data: { vwap: p2TickProcessor.getVWAP(), recentTicks: p2TickProcessor.getRecentTicks(10) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process tick' });
  }
});

app.get('/api/paper-trading/p2/data/tick', (req, res) => {
  try {
    res.json({
      success: true,
      data: { vwap: p2TickProcessor.getVWAP(), recentTicks: p2TickProcessor.getRecentTicks(100) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read ticks' });
  }
});

// P2 Trade persistence (PostgreSQL with in-memory fallback)
app.post('/api/paper-trading/p2/trades/save', async (req, res) => {
  try {
    const { trade } = req.body || {};
    if (!trade || !trade.id) return res.status(400).json({ error: 'trade with id required' });
    paperTradingEngine._ensureP2();
    await paperTradingEngine.tradeRepository.saveTrade(trade);
    res.json({ success: true, data: { saved: true, count: await paperTradingEngine.tradeRepository.count() } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save trade' });
  }
});

app.get('/api/paper-trading/p2/trades', async (req, res) => {
  try {
    paperTradingEngine._ensureP2();
    const trades = await paperTradingEngine.tradeRepository.getRecentTrades(Number(req.query.limit) || 100);
    res.json({ success: true, source: 'P2_TRADE_REPOSITORY', simulated: true, simulationType: 'PAPER_TRADING', data: trades });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch persisted trades' });
  }
});

// P2 Strategy Configuration
app.post('/api/paper-trading/p2/strategy', (req, res) => {
  try {
    const { model, size, stopLoss, takeProfit, confidenceThreshold } = req.body || {};
    paperTradingEngine._ensureP2();
    const config = paperTradingEngine.setStrategyConfig({
      model, size, stopLoss, takeProfit, confidenceThreshold,
    });
    res.json({ success: true, message: 'Strategy parameters saved', config });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update strategy' });
  }
});

app.get('/api/paper-trading/p2/strategy', (req, res) => {
  try {
    paperTradingEngine._ensureP2();
    res.json({ success: true, config: paperTradingEngine.getStrategyConfig() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy' });
  }
});

app.get('/api/paper-trading/trades', (req, res) => {
  try {
    const trades = paperTradingEngine.getTrades();
    const stats = paperTradingEngine.getStats();
    res.json({ success: true, source: 'DETERMINISTIC_PAPER_SIMULATOR', simulated: true, simulationType: 'PAPER_TRADING', data: { trades, stats } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch paper trades' });
  }
});

app.get('/api/paper-trading/stats', (req, res) => {
  try {
    const stats = paperTradingEngine.getStats();
    res.json({ success: true, source: 'DETERMINISTIC_PAPER_SIMULATOR', simulated: true, simulationType: 'PAPER_TRADING', data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Public liveness/readiness status with measured model-registry values.
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
    database: db ? 'connected' : 'unavailable',
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
  if (!AUTH_REQUIRED) {
    logger.warn('AUTH IS DISABLED: every /api route (training, HPO, order state, persistence) is open. '
      + 'Set AUTH_REQUIRED=true with JWT/refresh secrets and admin credentials for any shared or non-local deployment.');
  }
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
