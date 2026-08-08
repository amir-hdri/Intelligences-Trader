# Intelligences-Trader roadmap

## Current state: research simulator

Implemented and tested:

- React analytics terminal with worker-offloaded indicator/backtest calculations.
- Same-origin API/WebSocket routing for local, Compose, and Kubernetes-style deployments.
- Rule-based analysis, ONNX WASM inference boundary, risk limits, and explicitly labelled digital-twin fallback.
- Python PPO/TCN research code, HMM regime classification, feature engineering, and independent circuit breaker.
- Locked Node/Python dependencies, repeatable validation commands, and deterministic container builds.

Not implemented:

- live broker order placement;
- durable order/portfolio database;
- licensed intraday and macro/news feeds;
- production model registry and signed model promotion;
- realistic exchange matching/backtesting;
- production identity, token revocation, and remote append-only audit storage.

## Phase 1 — trustworthy paper-trading data boundary

1. Replace placeholder instrument mappings with a versioned instrument master.
2. Add licensed feed adapters with source timestamps, sequence numbers, stale-data alarms, and quality checks.
3. Define versioned candle/order-book/feature schemas and preserve raw immutable events.
4. Add PostgreSQL for users, portfolio state, model versions, orders, fills, and audit events.

Exit criterion: deterministic replay reproduces every feature and paper decision from immutable events.

## Phase 2 — execution simulator and OMS

Implemented (`robot trader/server/modules/paperTradingEngine/p2/`):

1. **Discrete-event order-book simulator** (`OrderBookSimulator`) with market orders (slippage + partial fills), resting limit orders, cancellation, and top-of-book depth queries.
2. **Idempotent order state machine** (`OrderStateMachine`) with OPEN → PARTIAL_FILLED → FILLED / CANCELLED / REJECTED transitions, deterministic order ids, and idempotent create via `clientOrderId`.
3. **Execution engine** (`P2ExecutionEngine`) for Market / Limit / Stop-Loss orders with deterministic slippage, taker/maker fees, and honest balance accounting.
4. **ML integration** (`MLSignalBridge`) converting PPO/TCN signals (BUY/SELL/HOLD + confidence) into executable orders, with a configurable confidence threshold and a FastAPI bridge (`FastAPIMLBridge.py`).
5. **Backtesting** (`BacktestHarness`) walking candles next-bar-close to avoid look-ahead bias.
6. **Data acquisition & processing** — `ccxtAdapter`, `HistoricalDataProvider`, `DataNormalizer` (OHLCV → ML features), `TickByTickProcessor` (VWAP), `RedisCache` (with in-memory fallback).
7. **Persistence & analytics** — `TradeRepository` (PostgreSQL with in-memory fallback), `PerformanceAnalytics` (Sharpe, Sortino, drawdown, win rate, profit factor, accuracy), `ReportGenerator` (daily/weekly/monthly).
8. **API + UI** — full P2 REST endpoints wired into the analysis service, plus a `FullPaperTradingDashboard` reachable from the "Paper Trading (P2)" nav tab.

All P2 modules are covered by tests (`robot trader/server/tests/p2.test.js`, 30 tests). The order/OMS does **not** connect to a live broker — it is a simulation-only paper-trading boundary, which is the intended scope for this phase.

Remaining for full Phase-2 exit criterion (fault-injection/recovery chaos tests and a licensed broker sandbox) is intentionally deferred; see AUDIT_REPORT.md.

## Phase 3 — model governance

1. Unify Python training and Node inference feature schemas/scalers.
2. Register signed artifacts with dataset hash, training commit, metrics, calibration, and approval status.
3. Use embargoed purged cross-validation, realistic costs, confidence intervals, and overfitting tests.
4. Run candidate models in non-executing shadow mode against the paper OMS.

Exit criterion: predeclared risk/performance gates pass on untouched data and sustained shadow operation.

## Phase 4 — production platform hardening

1. Require external identity/authentication and centralized secrets.
2. Add Prometheus/OTLP telemetry, SLOs, alerting, and remote immutable audit logs.
3. Add TLS ingress, network policies, pod security, backups, restore drills, and environment overlays.
4. Perform independent security, data-license, model-risk, and operational reviews.

Live trading should not be considered until all prior exit criteria are met and reviewed by qualified legal, compliance, security, and quantitative-risk stakeholders.
