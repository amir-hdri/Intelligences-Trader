# Phase 3 — Deterministic Backtesting Engine

Date: 2026-08-08

Phase 3 implements the architecture in [`docs/BACKTESTING_ENGINE_ARCHITECTURE.md`](./docs/BACKTESTING_ENGINE_ARCHITECTURE.md) as a separate, auditable engine. It does not reuse the P2 forecast-alignment PnL shortcut.

## Implemented architecture

Location: `robot trader/server/modules/backtesting/`

- **Application layer** — bounded run queue, lifecycle/status transitions, cancellation, runtime/event limits, comparison, artifacts, and deterministic result hashes.
- **Phase-1 data boundary** — immutable named dataset snapshots, SHA-256 content hashes, integrity verification, point-in-time ordering by `availableAt`, schema/OHLC/order-book validation, duplicate detection, gap reports, and PostgreSQL persistence with an in-memory development fallback.
- **Replay core** — monotonic simulation clock, timestamp batching for multi-instrument runs, next-bar execution, and periodic event-loop yielding so long runs can be cancelled.
- **Strategies** — a shared lifecycle for SMA-cross, momentum, and trained ONNX strategies. Strategies emit target-position intents and cannot mutate balances or manufacture fills.
- **ML governance at replay time** — the adapter pins the model version, ONNX plus external-data hash, runtime session, feature schema hash, normalizer hash, sequence length, feature count, and output mapping. A hot reload during a run is rejected rather than silently changing provenance.
- **Causal features** — 30×10 sequences use only observations available at the current simulation time. No full-test-range scaler is fitted.
- **Scenarios** — historical replay, volatility scaling, trend drift, price gaps, and liquidity stress. Transformations are deterministic, preserve OHLC invariants, never overwrite source snapshots, and carry a scenario hash.
- **Execution** — BAR and ORDER_BOOK fill models, next-bar open semantics, limit/stop triggers, worst-case ambiguous stop/target handling, depth walking, partial fills, participation caps, fixed/volume-impact/book-walk slippage, latency, and maker/taker fees.
- **Risk** — per-position notional cap, portfolio-wide leverage cap, drawdown kill switch, optional forced liquidation, and rejection audit trail.
- **Accounting** — fills are the sole position/cash mutation source. The ledger tracks long/short/reversal accounting, entry/exit fees, realized net PnL, mark-to-market equity, exposure, turnover, and closed trades.
- **Analytics** — annualized Sharpe and Sortino, max drawdown details, win rate, JSON-safe profit factor, total return/PnL, CAGR, Calmar, volatility, expectancy, holding period, fees, slippage, turnover, exposure, and causal regime attribution.
- **Persistence** — `backtest_datasets` and `backtest_runs` are created automatically when `DATABASE_URL` is available; the exact canonical config, dataset provenance, order/fill audit, curves, metrics, and hashes are retained.

## REST API

```text
GET    /api/backtests/health
POST   /api/backtests/datasets
GET    /api/backtests/datasets/:datasetId
POST   /api/backtests
GET    /api/backtests
POST   /api/backtests/compare
GET    /api/backtests/:runId
POST   /api/backtests/:runId/cancel
GET    /api/backtests/:runId/results
GET    /api/backtests/:runId/artifacts/:name
```

`POST /api/backtests?wait=true` is available for bounded interactive runs. Normal clients can use the asynchronous `202 QUEUED` response and status endpoint.

When application authentication is enabled, the entire `/api/backtests` surface is protected.

## Frontend

The previously dead **Walk-Forward Backtest** navigation item now opens a dedicated dashboard that:

- snapshots the currently loaded Phase-1 market series;
- selects Rule or pinned ONNX strategy;
- configures historical/volatility/trend/gap/liquidity scenarios and execution costs;
- runs the Phase-3 API;
- displays Sharpe, max drawdown, win rate, profit factor, equity, fees/slippage, data-quality counts, and audit hashes.

The old P2 screen remains available as a clearly labelled compatibility runner.

## P2 correctness fixes found during the gap audit

- Replaced full-range min/max normalization with causal running normalization.
- Reworked the P2 compatibility backtest so PnL comes from next-bar prices and fees rather than forecast/action alignment.
- Reworked P2 analytics to use sequential equity returns, configurable initial balance, net PnL, sample deviation, annualization, and JSON-safe profit factor.

## Verification

New test suite: `robot trader/server/tests/backtesting.test.js`

Coverage includes immutable snapshots, malformed data, configuration validation, fill-based accounting, fees, partial fills, order-book walking, deterministic scenarios, causal/no-look-ahead features, metric golden cases, null profit-factor semantics, deterministic replay hashes, scenario comparison, real ONNX inference, REST registration/run/status/results/artifacts, and missing-snapshot rejection.

Validated commands:

```bash
npm ci
npm run typecheck
npm run build
npm test --workspace app
DATABASE_DISABLED=true REDIS_DISABLED=true npm test --workspace 'robot trader/server'
npm test --workspace tse-proxy-server
cd ml_service && uv sync --locked --python /usr/bin/python3 && uv run --python /usr/bin/python3 pytest -q
```

At completion: frontend typecheck/build pass, 50 frontend tests pass, 84 analysis-service tests pass, 6 gateway tests pass, and 6 Python ML tests pass.

## Safety boundary

This remains a research and simulation system. It does not place live broker orders. Synthetic scenarios and digital-twin snapshots are explicitly labelled and their hashes/provenance are retained in every result.
