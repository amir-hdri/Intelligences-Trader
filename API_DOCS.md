# API Documentation — Data, Paper Trading, and Backtesting

Phase 1 ledger endpoints return a `source` field indicating the data boundary. Phase 3 backtests retain dataset/model/scenario provenance and explicitly report whether a snapshot or scenario is synthetic.

Base URL: `http://localhost:3000` (or `apiConfig.proxyUrl`)

## Positions

### GET /api/positions?symbol=SAF1403
- **Source**: POSITION_LEDGER
- **Description**: دریافت موقعیت‌های واقعی از Position Ledger (deterministic, بدون random)
- **Response**:
```json
{
  "success": true,
  "source": "POSITION_LEDGER",
  "simulated": false,
  "data": [
    {
      "id": "pos-SAF1403-0-171...",
      "symbol": "SAF1403",
      "side": "BUY",
      "quantity": 12,
      "entryPrice": 985000,
      "currentPrice": 1010000,
      "pnl": 300000,
      "pnlPercent": 2.54,
      "timestamp": 1713000000000,
      "status": "OPEN",
      "regime": "TRENDING_UP",
      "rsi": 62.5
    }
  ],
  "count": 3
}
```

### GET /api/positions/all
- All symbols aggregated.

## Orders

### GET /api/orders?symbol=SAF1403
- **Source**: ORDER_STATE_MACHINE
- **Description**: سفارش‌های واقعی از Order State Machine
- **States**: PENDING, FILLED, PARTIAL_FILLED, CANCELLED, REJECTED
- **Response**:
```yaml
id: string
symbol: string
side: BUY|SELL
type: LIMIT|MARKET
price: number
quantity: number
filledQuantity: number
status: OrderState
timestamp: number
```

### GET /api/orders/all

## Performance

### GET /api/performance?symbol=SAF1403
- **Source**: TRADE_LEDGER
- **Calculates** from real trades, not hard-coded:
```json
{
  "sharpe": 1.84,
  "sortino": 2.32,
  "cagr": 28.4,
  "maxDrawdown": 4.2,
  "winRate": 0.68,
  "profitFactor": 2.1,
  "totalTrades": 42
}
```
- Formula: sharpe = (avgReturn/stdDev)*sqrt(252)

### POST /api/performance/calculate
- Body: `{ trades: [{ profit: number, timestamp: number }] }`
- Calculates performance from provided ledger.

## Models

### GET /api/models
- **Source**: MODEL_REGISTRY
- **Description**: متریک‌های مدل از Model Registry واقعی، نه `Inference: 18ms` ثابت
```json
{
  "version": "2.5.0",
  "inferenceLatency": 14.2,
  "modelReady": true,
  "accuracy": 0.847,
  "precision": 0.838,
  "recall": 0.83,
  "f1Score": 0.834,
  "memoryMB": 245
}
```

### GET /api/models/status
- Alias for /api/status with full metrics.

### GET /api/status (overridden)
- Now returns real metrics, not hard-coded:
```json
{
  "status": "Online",
  "version": "2.5.0",
  "modelReady": true,
  "inferenceLatency": 12,
  "accuracy": 0.847,
  "precision": 0.838,
  "memoryMB": 245
}
```

## Learning

### GET /api/learning?symbol=SAF1403
- **Source**: PYTHON_RESEARCH_PIPELINE
- Returns adaptive weights history:
```json
{
  "history": [
    {
      "id": "pred-SAF1403-0",
      "action": "BUY",
      "entryPrice": 1000000,
      "confidence": 0.82,
      "status": "WIN|LOSS|PENDING",
      "indicators": { "rsi": 32, "macdHistogram": 0.8, ... }
    }
  ],
  "currentWeights": {
    "ichimoku": 2.1,
    "rsi": 1.8,
    "macd": 1.2,
    "basis": 3.2,
    "sentiment": 1.1,
    "orderBook": 2.3,
    "correlation": 2.0,
    "openInterest": 2.6
  },
  "winRate": 0.65,
  "totalSignals": 20
}
```

### GET /api/learning/weights

## Paper Trading

### POST /api/paper-trading/execute
- **Source**: PAPER_TRADING_ENGINE
- **No Math.random** - deterministic logic:
```
if forecastAlignment==1 && confidence>=threshold => WIN
else if regime==TRENDING_UP && side==BUY && confidence>=0.55 => WIN
else LOSS
pnl = riskPerTrade * profitFactor (WIN) or -riskPerTrade (LOSS)
```
- Body:
```json
{
  "order": { "action": "BUY", "qty": 10, "entry": 1000000, "stopLoss": 970000, "takeProfit": 1050000, "leverage": 3, "symbol": "SAF1403" },
  "forecast": { "action": "BUY", "confidence": 0.82, "regime": "TRENDING_UP", "politicalRiskIndex": 75, "indicators": {"rsi": 55, "atr": 1200} },
  "marketPrice": 1000000
}
```
- Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "isWin": true,
    "pnl": 20000,
    "newBalance": 1020000,
    "trade": { "id": "...", "reason": "Forecast alignment BUY @ 82% | 3x leverage" }
  }
}
```

### GET /api/paper-trading/trades
### GET /api/paper-trading/stats
```json
{
  "winRate": 0.68,
  "totalPnl": 125000,
  "totalTrades": 24,
  "balance": 1125000
}
```

## Phase 3 Backtesting

### GET /api/backtests/health

Reports queue depth, active execution slots, configured limits, ML-adapter availability, and whether persistence is `POSTGRESQL` or the explicit `MEMORY_FALLBACK` used for local development.

### POST /api/backtests/datasets

Registers an immutable Phase-1 snapshot. Reusing an id with different content returns `409`.

```json
{
  "id": "saf-1h-2024-v1",
  "timeframe": "1h",
  "source": "PHASE1_MARKET_SNAPSHOT",
  "synthetic": false,
  "instrumentId": "SAF1403",
  "candles": [
    { "timestamp": 1704067200000, "open": 100, "high": 102, "low": 99, "close": 101, "volume": 1000 }
  ]
}
```

The response contains `contentHash`, data range, instrument list, event count, and schema version, but does not echo all candles.

### POST /api/backtests

Creates an asynchronous run and returns `202`. Pass `?wait=true&timeoutMs=60000` for bounded interactive execution.

Required boundaries:

- `datasetSnapshotId` must already exist;
- Rule strategies: `SMA_CROSS` or `MOMENTUM`;
- ML strategy: `type=ML` with an exact pinned `modelVersion`;
- scenarios: `HISTORICAL`, `VOLATILITY`, `TREND`, `GAP`, `LIQUIDITY_STRESS`;
- fill models: `BAR` or `ORDER_BOOK` (the latter requires depth on every selected event).

```json
{
  "datasetSnapshotId": "saf-1h-2024-v1",
  "instruments": ["SAF1403"],
  "timeframe": "1h",
  "startAt": 1704067200000,
  "endAt": 1735603200000,
  "initialCash": 1000000,
  "baseCurrency": "IRR",
  "strategy": {
    "type": "RULE",
    "name": "SMA_CROSS",
    "version": "1.0.0",
    "parameters": { "fastPeriod": 5, "slowPeriod": 20, "positionSize": 1 }
  },
  "execution": {
    "fillModel": "BAR",
    "latencyMs": 0,
    "commissionBps": 4,
    "slippageModel": "FIXED_BPS",
    "slippageBps": 5,
    "participationRate": 0.1,
    "intrabarPolicy": "WORST_CASE"
  },
  "risk": {
    "maxPositionNotional": 250000,
    "maxLeverage": 1,
    "maxDrawdownPct": 0.2,
    "liquidateOnBreach": true
  },
  "scenario": { "type": "VOLATILITY", "parameters": { "multiplier": 2 }, "seed": "research-v1" },
  "endOfRunPositionPolicy": "LIQUIDATE"
}
```

Lifecycle: `QUEUED → VALIDATING → RUNNING → FINALIZING → COMPLETED`, with terminal alternatives `REJECTED`, `FAILED`, and `CANCELLED`.

### Run and result endpoints

```text
GET    /api/backtests?limit=50&status=COMPLETED
GET    /api/backtests/:runId
POST   /api/backtests/:runId/cancel
GET    /api/backtests/:runId/results
GET    /api/backtests/:runId/artifacts/equity
GET    /api/backtests/:runId/artifacts/orders
GET    /api/backtests/:runId/artifacts/order-events
GET    /api/backtests/:runId/artifacts/fills
GET    /api/backtests/:runId/artifacts/trades
GET    /api/backtests/:runId/artifacts/signals
GET    /api/backtests/:runId/artifacts/quality
```

### POST /api/backtests/compare

Body: `{ "runIds": ["bt-...", "bt-..."] }`. All runs must be completed and use the same source dataset hash.

Canonical results include `resultHash`, `configHash`, dataset/model/feature/normalizer/scenario hashes, order transitions, fills, closed trades, equity curve, metrics, regime attribution, risk rejections, and quality warnings. Undefined ratios such as Profit Factor with no losses are represented as `null` plus a machine-readable reason, never JSON `Infinity`.

## Swagger / OpenAPI (simplified)

```yaml
openapi: 3.0.0
info:
  title: Intelligences Trader - Phase 1 Real APIs
  version: 2.5.0
paths:
  /api/positions:
    get:
      summary: دریافت موقعیت‌های واقعی
      parameters:
        - name: symbol
          in: query
          schema: { type: string }
      responses:
        200:
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  source: { type: string, example: POSITION_LEDGER }
                  simulated: { type: boolean, example: false }
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: string }
                        symbol: { type: string }
                        quantity: { type: number }
                        pnl: { type: number }
  /api/performance:
    get:
      summary: محاسبه متریک‌ها از Trade Ledger
      responses:
        200:
          description: Performance metrics
  /api/paper-trading/execute:
    post:
      summary: اجرای Paper Trade با موتور واقعی
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                order: { type: object }
                forecast: { type: object }
```

## Migration from Mocks

- Before: `const pnl = (Math.random()-0.5)*2000` → After: `pnl = (currentPrice-entry)*qty` from ledger
- Before: `isWin = Math.random() < winRate` → After: deterministic forecast alignment
- Before: `Inference: 18ms` → After: `avg(inferenceHistory)` from ModelRegistry
- Before: `Sharpe: 1.42` → After: `sharpe = (avgReturn/stdDev)*sqrt(252)` from trades
- Before: `history={[]}` → After: `predictionService.getHistory()` + `/api/learning`

## Frontend Integration

Frontend service `BackendApiService.ts` wraps all endpoints:

```ts
const api = createBackendApi(proxyUrl);
const positions = await api.getPositions('SAF1403');
const perf = await api.getPerformance('SAF1403');
const result = await api.executePaperTrade(order, forecast, currentPrice);
```
