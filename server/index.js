import logger from './logger.js';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { WebSocket, WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSeededRng, hashString } from './utils/deterministic.js';

dotenv.config();

const configuredPort = Number.parseInt(process.env.PORT || '3001', 10);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const requestMetrics = { total: 0, errors: 0, durationMs: 0 };
const marketCache = new Map();
const CACHE_TTL_MS = 15_000;
const TSETMC_URL = 'https://cdn.tsetmc.com/api/Instrument/GetInstrumentHistory/';
const SYMBOL_PATTERN = /^[A-Z0-9-]{1,64}$/;

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const startedAt = performance.now();
  requestMetrics.total += 1;
  res.on('finish', () => {
    requestMetrics.durationMs += performance.now() - startedAt;
    if (res.statusCode >= 500) requestMetrics.errors += 1;
  });
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by CORS policy'));
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api/', rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests; retry after one minute' },
}));

const requireSymbol = (req, res, next) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) return res.status(400).json({ error: 'Invalid symbol format' });
  req.marketSymbol = symbol;
  next();
};

const instrumentIdForSymbol = symbol => symbol.includes('GOLD')
  ? '35425587644337450'
  : '65883838195688438';

const fetchRealMarketData = async symbol => {
  const cached = marketCache.get(symbol);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.data;

  try {
    const response = await axios.get(`${TSETMC_URL}${instrumentIdForSymbol(symbol)}`, {
      timeout: 5_000,
      maxContentLength: 5 * 1024 * 1024,
      headers: { 'User-Agent': 'Intelligences-Trader/2.5 (+educational-market-client)' },
      validateStatus: status => status === 200,
    });
    marketCache.set(symbol, { cachedAt: Date.now(), data: response.data });
    return response.data;
  } catch (error) {
    logger.warn('Real market fetch failed; using explicitly-labelled simulation', {
      symbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const generateSimulation = (symbol, count = 100) => {
  const now = Date.now();
  const data = [];
  let price = symbol.includes('GOLD') ? 35_000_000 : 1_200_000;
  let openInterest = 5_000;
  // Deterministic RNG seeded by symbol
  const baseRng = createSeededRng(`sim-${symbol}-${Math.floor(now/86400000)}`);

  for (let index = 0; index < count; index++) {
    const timestamp = now - (count - index) * 86_400_000;
    const rng = createSeededRng(`sim-${symbol}-${index}-${baseRng()}`);
    const limitEvent = rng();
    const change = limitEvent > 0.97 ? 0.05 : limitEvent < 0.03 ? -0.05 : (rng() - 0.5) * 0.02;
    const close = Math.max(1, Math.floor(price * (1 + change)));
    const open = Math.max(1, Math.floor(price * (1 + (rng() - 0.5) * 0.005)));
    const high = Math.max(open, close, Math.floor(price * (1 + Math.abs(change) + 0.005)));
    const low = Math.max(1, Math.min(open, close, Math.floor(price * (1 - Math.abs(change) - 0.005))));
    openInterest = Math.max(0, openInterest + Math.floor((rng() - 0.4) * 500));
    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: Math.floor(rng() * 100_000) + 5_000,
      openInterest,
      basis: symbol.includes('FUT') ? close * (rng() * 0.04 - 0.02) : 0,
    });
    price = close;
  }
  return data;
};

const generateOrderBook = (basePrice, seedSuffix = '') => {
  const bids = [];
  const asks = [];
  const rng = createSeededRng(`ob-${basePrice}-${seedSuffix}-${Date.now() % 10000}`);
  for (let level = 1; level <= 5; level++) {
    bids.push({ price: basePrice - level * 100, quantity: Math.floor(rng() * 50), count: Math.floor(rng() * 5) + 1 });
    asks.push({ price: basePrice + level * 100, quantity: Math.floor(rng() * 50), count: Math.floor(rng() * 5) + 1 });
  }
  return { timestamp: Date.now(), bids, asks, isSpoofing: rng() > 0.98 };
};

app.get('/api/market/:symbol', requireSymbol, async (req, res) => {
  const symbol = req.marketSymbol;
  const realData = await fetchRealMarketData(symbol);
  if (Array.isArray(realData?.instrumentHistory)) {
    const formatted = realData.instrumentHistory
      .map(item => ({
        timestamp: Number(item.date),
        open: Number(item.openPrice),
        high: Number(item.highPrice),
        low: Number(item.lowPrice),
        close: Number(item.closingPrice),
        volume: Number(item.volume),
        count: Number(item.count),
      }))
      .filter(item => [item.open, item.high, item.low, item.close, item.volume].every(Number.isFinite));
    if (formatted.length > 0) return res.json({ source: 'TSETMC_API', simulated: false, data: formatted });
  }
  return res.json({ source: 'DIGITAL_TWIN', simulated: true, data: generateSimulation(symbol) });
});

app.get('/api/orderbook/:symbol', requireSymbol, (req, res) => {
  const basePrice = req.marketSymbol.includes('GOLD') ? 35_000_000 : 1_200_000;
  res.json(generateOrderBook(basePrice, req.marketSymbol));
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', service: 'TSE Proxy Gateway Server', version: '1.1.0' });
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
  ].join('\\n'));
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  logger.error('Unhandled proxy request error', { error: error.stack || error.message });
  if (res.headersSent) return next(error);
  res.status(error.message === 'Origin is not allowed by CORS policy' ? 403 : 500).json({ error: 'Internal Server Error' });
});

export let server;
export let wss;
export let interval;
export let broadcastInterval;

const heartbeat = function heartbeat() {
  this.isAlive = true;
};

export const startServer = (port = configuredPort) => {
  if (server?.listening) return server;
  server = app.listen(port, '0.0.0.0', () => logger.info(`Proxy Backend listening on port ${port}`));
  wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

  wss.on('connection', (ws, req) => {
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', `ws://${req.headers.host || 'localhost'}`);
    } catch {
      ws.close(1008, 'Invalid WebSocket URL');
      return;
    }
    const symbol = String(requestUrl.searchParams.get('symbol') || 'SAF1403').toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      ws.close(1008, 'Invalid symbol');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', heartbeat);
    ws.symbol = symbol;
    ws.currentPrice = symbol.includes('GOLD') ? 35_000_000 : 1_200_000;
    // Deterministic seed per client
    ws.rng = createSeededRng(`ws-${symbol}-${Date.now()}`);
    logger.info('WebSocket client connected', { symbol });
  });

  interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 30_000);

  broadcastInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1024 * 1024) continue;
      const change = (ws.rng() - 0.5) * 1_000;
      ws.currentPrice = Math.max(1, ws.currentPrice + change);
      const orderBook = generateOrderBook(ws.currentPrice, `${ws.symbol}-${ws.rng()}`);
      ws.send(JSON.stringify({ type: 'ORDER_BOOK', data: orderBook }));
      ws.send(JSON.stringify({
        type: 'TRADE_TICK',
        data: { price: ws.currentPrice, volume: Math.floor(ws.rng() * 100), timestamp: Date.now() },
      }));
      ws.send(JSON.stringify({
        type: 'PRICE_CHANGE',
        data: { price: ws.currentPrice, change, timestamp: Date.now() },
      }));
    }
  }, 100);
  return server;
};

export const stopServer = async () => {
  if (interval) clearInterval(interval);
  if (broadcastInterval) clearInterval(broadcastInterval);
  interval = undefined;
  broadcastInterval = undefined;

  if (wss) {
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(() => resolve()));
    wss = undefined;
  }
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server = undefined;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer();
  const shutdown = signal => {
    logger.info(`Received ${signal}; shutting down proxy`);
    stopServer().catch(error => {
      logger.error('Proxy shutdown failed', { error: error.message });
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
