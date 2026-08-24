# Gap Analysis & Remediation — 2026-08-24

Full-stack review pass (senior full-stack + ML audit) performed against
`main` at commit `2f13b80`. Method: three parallel deep reviews (Node
security/correctness, infrastructure/CI, ML service/frontend), full test-suite
runs, strict typecheck, and production build verification.

## Verification after remediation

| Suite | Result |
|---|---|
| `app` workspace tests (strict TS → node:test) | 41 passed |
| Analysis API tests (`robot trader/server`) | 98 passed |
| Gateway tests (`server/`) | 7 passed |
| Python pipeline (`ml_service`, pytest) | 69 passed |
| Frontend strict typecheck | passed |
| Frontend production build (vite) | passed |

## Resolved findings

### P0 — CD pipeline could never produce an image

1. **Build contexts pointed at workspace folders while every Dockerfile COPYs
   repo-root-relative paths** (`.github/workflows/cd.yml`). Every image build
   failed immediately. All three matrix jobs now use the repository root as
   build context, matching `docker-compose.yml`.
2. **Invalid GitHub Actions expression `${{ github.repository | lower }}`**
   used four times; Actions has no pipe filters or `lower()`. A lowercase image
   repository is now computed once into `IMAGE_REPOSITORY` via shell parameter
   expansion.
3. **"Regenerate lock files" step deleted the committed lockfile before builds**
   that run `npm ci` — images were built from an uncommitted dependency tree.
   The step was removed; images build reproducibly from the root lockfile.
4. **Trivy action pinned to mutable `@master`** → pinned to release `0.28.0`.

### P1 — Deployment & availability

5. **`k8s/secret.yaml` was missing** although both Deployments use
   `envFrom: secretRef: kalaybot-secrets` (pods would fail with
   `CreateContainerConfigError`). Added a template Secret with placeholder
   values, provisioning instructions (`kubectl create secret …`), and optional
   empty `DATABASE_URL` / `REDIS_URL` keys.
6. **Kubernetes image names did not match anything CD publishes**
   (`kalaybot-ml:latest` vs `ghcr.io/<owner>/<repo>/<service>:<sha>`).
   Deployment images now reference the CD-published registry paths with a
   clearly marked tag placeholder and kustomize guidance.
7. **Unbounded HPO trials → synchronous event-loop DoS**
   (`POST /api/advanced/hpo/optimize` forwarded raw `nTrials`; each trial
   evaluates ~26k candles). Trials are now clamped to `[1, 200]`.
8. **Frontend regime history fabrication** (`MarketRegimeTimeline.tsx`) invented
   past regimes, confidences, durations, and timestamps while labelling them
   "Real Detection". The component now renders only observed detections and an
   honest "Awaiting regime history" state.
9. **Risk limit unit mismatch (percent vs fraction)** between `riskEngine.ts`
   (drawdowns stored ×100, limits in percent) and `RiskControlPanel.tsx`
   (re-multiplied displays by 100 and divided saved inputs by 100 — saving
   "2%" stored 0.02 and tripped the sticky kill switch on any ≥0.02% loss).
   The panel now uses percent units end-to-end.
10. **Restored `scripts/generate-secrets.sh`** (referenced by docs, lost in a
    branch divergence) and rewrote it for the current env-var contract:
    prints/merges `AUTH_REQUIRED`, `JWT_SECRET`, `REFRESH_SECRET`,
    `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MASTER_ENCRYPTION_KEY` into `.env`.

### P2 — Correctness & resource safety

11. **pg.Pool instances had no `'error'` listener** — an idle-client backend
    failure crashed the whole process. Listeners added in
    `BacktestRepository` and `TradeRepository`.
12. **One request permanently poisoned EnsembleEngine weights**: raw body
    `actualOutcome` reached `updateWeights()` unvalidated; non-numeric input
    produced NaN weights for all five models until restart. Input is now
    validated to finite `[-1, 1]` (400 otherwise).
13. **Gateway market cache grew without bound** (client-chosen symbols, up to
    5 MB retained per entry). Capped FIFO at 128 entries.
14. **In-memory fallback stores grew forever** (dataset snapshots up to 100k
    candles; trade ledger; order maps). Caps added: backtest datasets 50,
    runs 200, paper trades 5000 (FIFO), terminal order states pruned beyond
    5000, order-book trades 1000, resting orders 5000 (terminal evicted first).
15. **`TradeRepository` fabricated credentials**: defaulted to
    `postgres://user:pass@localhost:5432/paper_trading`. Empty/unset
    `DATABASE_URL` now means memory mode — no fake DSN dialing.
16. **Kelly sizing displayed nonsense percentage** (`quantity * 100 + "%"`).
    Card now renders the returned unit quantity honestly.
17. **Realized-VIX annualization understated by ~24×** (hourly variance scaled
    by `252 × 1h/24h`). Now scales by `252 × 24`; the >40 VIX dampening branch
    is reachable again.
18. **Permanent "risk-free arbitrage" card with dead button**: digital-twin
    basis always exceeded the carry threshold and "Execute Multi-Leg Spread"
    had no handler. Copy no longer claims risk-free; button replaced with an
    explicit "Simulated Signal — Execution Disabled" tag.
19. **Look-ahead bias in preprocessing**: `data_loader.preprocess_data` used
    `ffill().bfill()`, propagating future prices backwards. Now forward-fill
    only, leading NaN rows dropped.
20. **Timeframe fallback could relabel daily data as hourly** (fallback list
    skipped only the exact match, so `1d→1h` upsampling was possible).
    Candidates are now strictly finer timeframes (unknown coarse codes such as
    `1w` may resample from any listed one).
21. **Synthetic data timestamps keyed to wall clock** broke date-filtered
    reproducibility across days. Generation is anchored to a fixed epoch
    (configurable via `SYNTHETIC_DATA_EPOCH_MS`).
22. **Sharpe annualization assumed daily bars regardless of timeframe** in
    `strategy_engine._compute_metrics`. `simulate_orders`/`execute_strategy`
    accept `periods_per_year`, and `BacktestingEngine.run_backtest` infers it
    from the requested timeframe.
23. **Compose dropped `MODEL_PATH` / `MODEL_VERSION`** even though the analysis
    API reads them — both are now passed through to `backend-ml`.

### P3 — Hygiene & hardening

24. **CI installed dependencies with `npm install`** despite a committed
    lockfile → switched to `npm ci`.
25. **WebSocket upgrades accepted any Origin** (cross-site WebSocket
    hijacking). Upgrades now validate `Origin` against the CORS allowlist;
    non-browser clients without Origin remain allowed.
26. **TensorFlow tensors leaked when `/api/train` failed mid-training**
    (disposal only on success path). Tensor/model lifecycle moved to
    try/finally with idempotent disposal.
27. **Order/fill endpoints accepted NaN/negative prices** and arbitrary symbol
    strings. Finite-positive validation plus canonical symbol grammar
    (`^[A-Z0-9-]{1,64}$`) enforced; invalid fills return 400/404 instead of
    corrupting book ordering or persisted fills.
28. **Dead code removed**: deprecated `node:util.isNullOrUndefined` polyfill
    (analysis API), unused `performanceApi` state plus its fabricated
    `sortino = sharpe × 1.26` / invented CAGR fallback (`App.tsx`), import-time
    `SecretManager` singleton (now lazy via `getSecretManager()` so importing
    without `MASTER_ENCRYPTION_KEY` cannot crash the process).
29. **Stale async responses could clobber newer UI state** in model-status and
    ledger effects. Both effects now discard stale completions via cancellation
    flags.
30. **Paper-trading KPI cards crashed on null backend fields**
    (`metrics.sharpe.toFixed(2)` etc.). All five KPIs render `N/A` for
    non-finite values.
31. **Terraform EKS helm auth lacked `--region`**, causing wrong-region token
    errors; Argo CD chart was unpinned → pinned `7.7.12`.
32. **`server/.env.example` documented a nonexistent `JWT_SECRET` startup
    guard** and referenced the missing secrets script; rewritten to the real
    contract (`PORT`, `CORS_ORIGIN`, `TRUST_PROXY_HOPS`).

## Known limitations (documented, intentionally deferred)

- **Sharpe risk-free convention** (`performance_metrics.py`): the annual rate
  is subtracted per per-trade return observation, exactly as specified and
  tested ("intentionally not silently annualised"). This biases absolute Sharpe
  downward but applies uniformly, so strategy ranking is unaffected. Changing
  it is an API contract change requiring test/spec updates.
- **PPO train/serve feature skew**: training observations use HMM-decoded
  regime and account-equity drawdown; ONNX inference uses expanding-quantile
  volatility regime and price drawdown. Predictions are causal but not drawn
  from the training distribution — retraining with shared feature extraction
  is required before trusting PPO backtest fidelity.
- **Unauthenticated `/metrics`** on both services: acceptable for the research
  posture; bind to an internal interface/network policy before any shared
  deployment.
- **`AUTH_REQUIRED` defaults off outside production** by design (local
  research); a loud warning banner logs at startup when disabled, and the
  compose/k8s documentation shows the fail-closed configuration. Shared
  deployments must set `AUTH_REQUIRED=true`.
- **npm optional-dependency bug (#4828)**: lockfiles generated on Linux omit
  darwin platform binaries; macOS contributors need one extra install (see
  README troubleshooting).

## Addendum — same-day follow-ups

### Divergent local history resolved

A parallel local commit (`ca5b02c`, "SQLite persistence + real auth") had
diverged from origin. Resolution:

- origin/main kept as canonical: its PostgreSQL-with-fallback repositories,
  env-admin JWT auth, and audit logging cover the same problem space with a
  different architecture, and its security audit supersedes the local fixes.
- The local line was preserved on branch **`archive/local-sqlite-auth`**
  (previously `backup/local-sqlite-auth`). Nothing was ported: the SQLite
  layer conflicts with the chosen persistence architecture, and multi-user
  scrypt registration would need a real product decision before integration.
- Salvage candidates if multi-user auth is ever productised:
  `robot trader/server/auth/authService.js` (scrypt verification),
  `robot trader/server/db/` (node:sqlite migrations/repositories),
  `robot trader/server/integration.test.js`.

### CI/CD brought green (2026-08-24)

1. Trivy action pin corrected to the valid `v0.36.0` tag (merged Dependabot
   PR #215 after my initial `0.28.0` pin referenced a non-existent tag).
2. Frontend image failed to build: shell-form `COPY --from` cannot quote
   space-containing paths → JSON-array form.
3. Root cause of every platform-specific module failure (macOS vite build,
   alpine container build): the committed lockfile contained **zero**
   cross-platform optional-binary entries (npm bug #4828). Regenerated;
   all three images now build and serve `/api/status` in local Docker
   smoke runs, with fail-closed auth verified in production mode.

Status: CI ✓, CodeQL ✓, CD pending re-run after `4dd81fc`.
