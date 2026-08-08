# Intelligences-Trader roadmap

## Current state: research simulator

Implemented and tested:

- React analytics terminal with worker-offloaded indicator/backtest calculations.
- Same-origin API/WebSocket routing for local, Compose, and Kubernetes-style deployments.
- Rule-based analysis, ONNX WASM inference boundary, risk limits, and explicitly labelled digital-twin fallback.
- Python PPO/TCN research code, HMM regime classification, feature engineering, and independent circuit breaker.
- Locked Node/Python dependencies, CI checks, container builds, vulnerability scan, SBOM, and signing workflow.

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

1. Build a discrete-event order-book simulator with spread, queue priority, slippage, latency, fees, price limits, margin, and partial fills.
2. Add an idempotent order state machine with reconcile/cancel/replace/recovery behavior.
3. Integrate only a broker sandbox, behind the independent circuit breaker.
4. Add chaos tests for duplicate, delayed, reordered, and missing broker/feed events.

Exit criterion: all recovery invariants pass under fault injection and restarts.

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
