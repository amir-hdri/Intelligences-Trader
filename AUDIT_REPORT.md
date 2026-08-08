# Engineering, Security, and ML Audit

Audit date: 2026-08-08

## Executive summary

The initial repository presented several simulated or incomplete modules as production/HFT capabilities. The most serious runtime defects were a frontend reload loop driven by 10 Hz order-book updates, malformed WebSocket objects that could crash the dashboard, a risk engine that reset drawdown history after every balance update, inconsistent PPO action encoding, fabricated model metrics, broken container build contexts, and CI that ignored security failures and did not test Python.

This hardening pass repairs those defects and changes documentation/API behavior so simulated outputs are explicit. The project is now a coherent research and simulation platform, but it is **not ready for live trading**.

## Findings resolved

### Critical

1. **Risk history was erased on balance changes.** `App.tsx` recreated `RiskEngine` whenever balance changed. The engine is now session-stable, receives limit/equity updates, and keeps a sticky kill switch.
2. **WebSocket data did not match the UI type.** The gateway sent raw bids/asks while the UI dereferenced `queueDynamics`. Payloads are now validated and normalized before state updates.
3. **Runaway API loading.** `loadData` depended on the live order book; every WebSocket update changed the callback and retriggered the effect. A ref now provides the latest book without changing load identity, and stale requests are discarded.
4. **Invalid frontend/backend forecast merge.** The frontend cast a partial backend response to a complete forecast, leaving entry/target/technical fields undefined. A complete local forecast is now safely overlaid with validated backend fields.
5. **PPO direction mismatch.** Python policy output used classes 0/1/2 while the environment interpreted a continuous direction, making shorts unreachable and class 1 long. The environment and model now consistently use 0=short, 1=hold, 2=long.
6. **Fabricated evaluation performance.** Training forced accuracy above 56%, Sharpe above 1.6, drawdown below 14%, and calibration error below 4%. These clamps were removed; API metrics now report measured holdout values.
7. **Container builds were non-reproducible.** Docker contexts lacked the root workspace lockfile and fell back from `npm ci` to `npm install`. All images now build from the root lockfile with targeted workspaces.

### High

- Fixed hard-coded browser `localhost` WebSocket/API coupling with same-origin routing and Vite/Nginx proxies.
- Replaced unauthenticated AES-CBC encryption with AES-256-GCM and authenticated tags.
- Corrected ONNX class ordering to the documented training labels (`DOWN/HOLD/UP`).
- Added strict model shape/finite-value validation and dynamic model input/output names.
- Removed fake auto-retraining/hot-reload behavior; drift now emits a retraining recommendation only.
- Disabled simulated advanced engines by default with HTTP 501 and a simulation header when enabled.
- Replaced no-op metrics with actual request counters/error counters/average duration endpoints.
- Added request body limits, CORS allowlists, input limits, symbol validation, WebSocket max payload, heartbeat, and backpressure checks.
- Removed unused/vulnerable dependencies and updated overrides. Production npm audit currently reports zero vulnerabilities.
- Fixed Docker Compose secrets/config mismatch and removed PM2 clustering that would break in-memory WebSocket/cache semantics without sticky routing.

### ML and quantitative correctness

- TCN convolutions use left-only causal padding instead of `same` padding that leaked future sequence values.
- MACD signal is now the EMA of the MACD series rather than `currentMACD * 0.9`.
- ATR uses the candle preceding the selected period; Bollinger Bands divide by the actual sample count.
- RSI returns 50 for a flat series instead of 100.
- Digital-twin GBM now uses Gaussian shocks, annualized parameters, continuous OHLC candles, variable open interest, and input bounds.
- HMM states are ordered by learned volatility means, and short histories use an explicit fallback instead of calling an unfitted model.
- PPO training now computes real GAE-lambda advantages.
- The environment validates prices/actions, applies the selected position to the next return, guards DSR variance, and models futures notional/margin consistently.
- Order-book feature engineering accepts NumPy inputs safely and rejects negative/non-finite quantities.
- Circuit-breaker configuration, direction, size, equity, and price-limit inputs are validated.

### Reliability and maintainability

- Worker pool dispatches to all idle workers, replaces failed workers, times out stuck work, and rejects pending tasks on shutdown.
- Services can be imported without opening network listeners and provide graceful start/stop paths.
- Generated `dist`, `test-out`, and one-off patch scripts were removed from source control.
- Reproducible local validation commands now cover type checking, frontend builds, all Node tests, Python tests, and dependency auditing.
- CI/CD workflow hardening was reviewed but could not be included because the connected GitHub App lacks workflow-write permission; this remains a follow-up item.

## Verification performed

- Frontend strict TypeScript check: passed.
- Frontend build: passed.
- Frontend/domain tests: 50 passed.
- Analysis service tests: 35 passed.
- Gateway tests (including live local WebSocket): 6 passed.
- Python pipeline tests: 6 passed.
- Production npm audit: 0 vulnerabilities.

## Remaining blockers before live trading

1. **No broker/OMS implementation.** There is no authenticated order state machine, idempotency key, reconciliation, partial-fill handling, cancel/replace flow, or disaster recovery.
2. **Data provenance is incomplete.** Instrument mappings are placeholders and most intraday/macro/news data remains generated. A licensed, timestamped, quality-controlled feed is required.
3. **Model provenance is incomplete.** Tracked ONNX artifacts lack a signed model card, exact dataset hash, feature schema, scaler parameters, training commit, validation report, and promotion approval.
4. **No realistic execution backtester.** Current walk-forward logic omits spread, queue position, slippage, price limits, latency, funding/margin changes, and survivorship/selection bias.
5. **Statistical validation is insufficient.** Add embargoed purged cross-validation over multiple folds, deflated Sharpe/probability-of-backtest-overfitting checks, calibration confidence intervals, regime-specific results, and transaction-cost sensitivity.
6. **Authentication is optional.** Production must force authentication, externalize refresh-token rotation/revocation, use a real identity provider, and store audit logs in append-only remote storage.
7. **Metrics are process-local.** Replace simple counters with Prometheus histograms/counters and an OTLP exporter; add alerts and SLOs.
8. **No database.** Portfolio, order, model, user, and audit state are in memory/local storage/files and cannot support safe multi-replica operation.
9. **Kubernetes/Terraform are templates.** Images, TLS ingress, network policies, pod security, secret injection, immutable tags, backup policy, and environment-specific overlays still require deployment engineering.
10. **Python training CI is intentionally lightweight.** Core safety/environment tests run by default. Full PyTorch/ONNX training dependencies use the `training` extra and need a separate scheduled CPU/GPU validation job.

## Recommended next phase

Build a paper-trading boundary first: versioned event schema, licensed feed adapter, durable PostgreSQL order ledger, broker sandbox adapter, idempotent order state machine, signed model registry, and a discrete-event backtester using the exact production feature pipeline. Run it in shadow mode for several months with predeclared acceptance criteria before considering any live connectivity.
