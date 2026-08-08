# Phase 2 — Paper Trading Engine (P2) Build-Out

Date: 2026-08-08

This pass completes and hardens the Phase 2 paper-trading engine so every
component from the P2 spec is implemented, wired into the analysis API, covered
by tests, and reachable from the terminal UI.

## Critical fix

- **Broken module resolution.** `P2ExecutionEngine.js` and
  `PerformanceAnalytics.js` imported `utils/deterministic.js` and `tcnModel.js`
  from `../../../` which resolved inside `modules/` instead of `server/`,
  crashing the whole server boot. Both now import from `../../../../`. This was
  the cause of the previously failing `api.test.js` (the analysis service could
  not start).

## Missing dependencies

- Added `ccxt`, `ioredis`, and `pg` to the `server` workspace (`robot
  trader/server/package.json`). These were imported by the P2 data/storage
  modules but never declared or installed, so those modules would fail to load.

## Module completion (all in `robot trader/server/modules/paperTradingEngine/p2/`)

### Execution

- **`P2ExecutionEngine`** — Market / Limit / Stop-Loss orders now behave
  correctly: resting limit/stop orders stay `OPEN` until the market crosses
  their trigger, deterministic slippage (seeded, no `Math.random`), taker/maker
  fees, `netPnl = pnl - fee`, and the fee is reflected in the engine balance for
  honest accounting. Deterministic order ids.
- **`OrderBookSimulator`** — market orders with slippage & partial fills,
  resting limit orders, cancellation, and top-of-book depth queries.
- **`OrderStateMachine`** — idempotent create via `clientOrderId`, deterministic
  order ids, validated OPEN → PARTIAL_FILLED → FILLED/CANCELLED/REJECTED
  transitions, and `recordFill`/`cancel`.

### ML integration

- **`MLSignalBridge`** — converts PPO/TCN signals (BUY/SELL/HOLD + confidence)
  into orders, validates confidence (0–1), enforces a configurable confidence
  threshold, and supports MARKET/LIMIT/STOP_LOSS order types.
- **`FastAPIMLBridge.py`** — Node URL is configurable via `NODE_SERVICE_URL`
  (no hard-coded localhost), and uses `model_dump()` (Pydantic v2).

### Data

- **`ccxtAdapter` / `HistoricalDataProvider`** — real-time & historical OHLCV.
- **`DataNormalizer`** — OHLCV → ML-ready features.
- **`TickByTickProcessor`** — tick storage + VWAP.
- **`RedisCache`** — uses Redis when available; **in-memory fallback** with TTL
  expiry so the engine works without infrastructure.
- **`TradeRepository`** — persists to PostgreSQL when `DATABASE_URL` is
  reachable; **in-memory fallback** otherwise.

### Analytics / backtest

- **`PerformanceAnalytics`** — Sharpe, Sortino, max drawdown, win rate, profit
  factor, average win/loss, total PnL, and measured signal accuracy.
- **`ReportGenerator`** — daily/weekly/monthly reports with recommendations.
- **`BacktestHarness`** — works with both the base engine (`executeTrade`) and
  the P2 engine (`executeP2Order`), executes at next-bar close (no look-ahead),
  and returns equity curve + metrics.

## API wiring (`robot trader/server/index.js`)

New endpoints: backtest, order book (get/update/order/cancel), order state
machine (list/create/cancel/fill), OHLCV fetch+cache, tick processing,
and trade persistence. All P2 singletons are lazily initialized on the
`PaperTradingEngine` via `_ensureP2()`.

## UI (`robot trader/src/`)

- Added a **"Paper Trading (P2)"** nav tab that renders
  `FullPaperTradingDashboard` (Trade Execution / Paper Trading group).
- Rewrote `FullPaperTradingDashboard` to be deterministic (no `Math.random`),
  added a backtest runner, net-of-fee trade history, and wired it to the real
  P2 endpoints.

## Tests

- New `robot trader/server/tests/p2.test.js` — 30 tests covering normalizer,
  tick VWAP, order book, state machine, execution (market/limit/stop + fees),
  ML signal bridge, analytics, reports, backtest, resilience fallbacks, API
  integration, and engine wiring.

## Validation

- `npm run typecheck` — pass
- `npm run build` — pass
- `npm test --workspaces --if-present` — 50 (app) + 63 (analysis service) + 6 (gateway) pass
- Live runtime smoke test of all P2 endpoints — pass

## Follow-up hardening (gap audit)

- **Strategy config is now real.** `POST /api/paper-trading/p2/strategy` no
  longer just logs — it applies `model`, `size`, `stopLoss`, `takeProfit`, and
  `confidenceThreshold` to the engine and the ML bridge, so subsequent signals
  honor the active confidence threshold and default position size. Added a
  matching `GET /api/paper-trading/p2/strategy` and tests verifying the
  threshold is enforced end-to-end.
- **Unified export completed.** `p2/index.js` now also exports
  `OrderStateMachine`, `ORDER_STATES`, `ReportGenerator`,
  `HistoricalDataProvider`, and `WebSocketDataFeed`.
- **Deployment gaps closed.** `docker-compose.yml` now includes optional
  `redis` and `postgres` services (with a healthcheck and a named volume) and
  wires `REDIS_URL` / `DATABASE_URL` into `backend-ml`. Both consumers keep
  their in-memory fallbacks, so the stack runs even without those services.
- **Fixed a copy-paste env-var bug** in `TradeRepository._init()` that checked
  `REDIS_DISABLED` instead of the database flag.
- Removed a stray `__pycache__` artifact from the working tree.

Test count grew to 121 (50 app + 65 analysis service + 6 gateway); typecheck
and build stay green.

## Remaining (deferred, out of scope for this pass)

- Fault-injection/recovery chaos tests for the OMS and a licensed broker
  sandbox (see AUDIT_REPORT.md). This P2 boundary is intentionally
  simulation-only and does not place live orders.
