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
- venue-certified matching parity against a licensed exchange event feed (the deterministic research backtester is implemented);
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

## Phase 3 — deterministic backtesting engine

Implemented (`robot trader/server/modules/backtesting/`):

1. Immutable, hashed Phase-1 dataset snapshots with point-in-time loading and quality reports.
2. Event-driven replay with a monotonic simulation clock, next-bar execution, multi-instrument timestamp batching, cancellation, and resource limits.
3. Shared Rule/ML strategy contract with pinned ONNX artifact/session, feature-schema, and causal-normalizer provenance.
4. Historical, volatility, trend, gap, and liquidity-stress scenarios with deterministic hashes and OHLC invariants.
5. BAR and ORDER_BOOK execution, partial fills, latency, maker/taker fees, slippage, portfolio-wide risk limits, and fill-only accounting.
6. Sharpe, Sortino, max drawdown, win rate, profit factor, return/risk/cost analytics, and regime attribution.
7. PostgreSQL-backed run/dataset repository, lifecycle REST API, comparison/artifact endpoints, full dashboard, and golden/no-look-ahead/API/ONNX tests.

Exit criterion met: identical snapshot + canonical config + model + seed produces identical orders, fills, equity, metrics, and `resultHash`; all PnL is derived from price-path fills net of costs.

See [`PHASE3_CHANGES.md`](./PHASE3_CHANGES.md) and [`docs/BACKTESTING_ENGINE_ARCHITECTURE.md`](./docs/BACKTESTING_ENGINE_ARCHITECTURE.md).

## Phase 4 — model governance

1. Add signed artifact promotion with dataset hash, training commit, holdout metrics, calibration, and approval status beyond the runtime pinning already enforced by Phase 3.
2. Use embargoed purged cross-validation, confidence intervals, and formal overfitting tests for promotion decisions.
3. Run candidate models in non-executing shadow mode against the paper OMS.
4. Add independent model-risk approval and rollback workflows.

Exit criterion: predeclared risk/performance gates pass on untouched data and sustained shadow operation.

## Phase 5 — production platform hardening

1. Require external identity/authentication and centralized secrets.
2. Add Prometheus/OTLP telemetry, SLOs, alerting, and remote immutable audit logs.
3. Add TLS ingress, network policies, pod security, backups, restore drills, and environment overlays.
4. Perform independent security, data-license, model-risk, and operational reviews.

Live trading should not be considered until all prior exit criteria are met and reviewed by qualified legal, compliance, security, and quantitative-risk stakeholders.
