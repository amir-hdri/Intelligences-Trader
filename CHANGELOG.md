# Changelog

All notable changes to the Intelligences-Trader project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.9.2] - 2026-10-31

### Security
- **Dependency vulnerabilities closed on the default branch**: the Node lockfile is upgraded to the patched
  releases of every advisory package (`axios` 1.21.0, `body-parser` 2.4.0, `follow-redirects` 1.16.2,
  `ip-address` 10.7.5, `proxy-addr` 2.0.8, `qs` 6.17.1, `source-map-js` 1.2.2, `undici` 7.30.1) and the
  Python lockfile is upgraded for the four pip advisories (`pillow` 13.0.0, `filelock` 4.2.5, `setuptools`
  84.2.1, `torch` 2.15.0). `npm audit` reports 0 vulnerabilities and `uv lock --check` reports the lockfile in
  sync with `pyproject.toml`.
- **Unmaintained exchange client removed**: `tsetmc-client` is dropped from the `robot trader/server`
  workspace. The snapshot endpoint now calls the exchange CDN itself, so the dependency no longer ships.
- **Unused coverage dependency removed**: `c8` was declared in the frontend workspace but no script, test or CI
  job used it. It was the only reason the vulnerable `glob`/`minimatch`/`test-exclude` chain was in the tree, so
  it is deleted rather than pinned to a version with an open advisory.
- **Remaining Dependabot bumps applied to the proxy server**: `dotenv` 18.0.9 and `nock` 15.0.5 replace the
  versions the bot had queued in pull requests #225 and #224.
- **Dependabot now watches every workspace**: the npm ecosystem covers the repository root (the production
  `server` workspace) in addition to `robot trader`, and the `uv` ecosystem covers `ml_service`. The two
  unmonitored manifests were the reason the advisory queue kept stale rows alive after the lockfiles were fixed.

### Fixed
- **The tape badge no longer claims a live feed**: the frontend dropped the `source`/`simulated` labels that
  `GET /api/tse/:id` returns and decided the badge from the connection mode alone, so a synthetic series was
  presented as an exchange feed. The market fetch now returns its provenance alongside the candles, the hook
  keeps the label per timeframe, and the badge reports `IME SIMULATION TAPE` for every simulated or unlabelled
  series, `IME LIVE TAPE` only when the backend states the data is not simulated, and `IME FEED UNKNOWN` while
  the provenance is still unknown. The intraday frames (1h/15m/1m) are generated in the browser and are
  therefore always labelled as simulation.

### Changed
- **`GET /api/tse/:id` states what it serves**: the endpoint reads the instrument history from the TSETMC CDN
  with a 5-second timeout, anchors the snapshot to the real last daily bar and labels the surrounding synthetic
  history as such (`source: TSETMC_SNAPSHOT_WITH_SYNTHETIC_HISTORY`, `simulated: true`). Symbols outside the
  instrument allowlist are rejected with `400 Unknown symbol` instead of an upstream failure, and when the CDN
  is unreachable the response is the labelled digital twin (`source: DIGITAL_TWIN`) rather than a 500.
- **Documentation truth**: `API_DOCS.md` describes the endpoint as it now behaves, and the test totals in
  `README.md`, `TEST_GUIDE.md`, `FULL_STACK_AUDIT_REPORT.md`, `robot trader/server/README.md` and the delivery
  acceptance report match the executed counts (285 in total, 151 in the core backend).

### Verified
- **Full-Stack Test Verification**: 285 of 285 automated tests passing with 100% green status (73 Python tests, 212 Node tests, 0 TypeScript compiler diagnostics).
- **Dependency audit**: `npm audit` → 0 vulnerabilities (was 4 moderate after the lockfile upgrade); `uv lock --check` → the lockfile matches the manifest.
- **Browser end-to-end**: 7 passed, 1 skipped (`npm run test:e2e --workspace app`).

## [2.9.1] - 2026-10-30

### Fixed
- **Fabricated live ticker tape (critical)**: `AppShell.tsx` shipped a module-level `TICKER_ITEMS` list of
  static prices under an "IME LIVE TAPE" label. The constant is deleted and the tape now renders the selected
  instrument's actual last candle — price, change, WebSocket state and as-of time — labelled
  `IME SIMULATION TAPE` while the digital twin is active and `IME LIVE TAPE` only when the real feed is set.
- **Kill switch persisted unsaved risk limits (critical)**: the emergency toggle committed the whole risk-limit
  edit buffer, so a cleared field could persist `0` drawdown limits and latch the engine into a permanent
  lockout. The toggle now merges only the `stopAllTrading` flag, `RiskEngine.validateLimits` rejects
  non-positive limits, and a risk-triggered halt is latched separately from the manual halt and released only
  by the panel's explicit **Reset Halt** action.
- **Arbitrage panel disclosure**: the "Simulated Signal — Execution Disabled" label is restored, the badge reads
  `SIMULATED FEED`, and the invented live routing, latency and scan-cycle strings are removed.
- **Orphan-module guard**: the guard now computes reachability from the entry points instead of only counting
  importers, so mutually-importing orphan islands are detected; it understands dynamic `import()` and Vite query
  suffixes, and carries fixture regression tests. It fails `npm test`, not `npm run build`.
- **Documentation-count guard**: `npm run verify` is part of the root `check` script and runs as its own CI job
  with `uv` available. The guard compares passed-of-total claims against executed passes and counts skipped or
  deselected cases as scheduled-but-not-passing.
- **Risk panel enforcement claim**: the panel no longer claims that every limit is auto-enforced. It states that
  the open-trade cap, the drawdown breakers and the manual halt are enforced on the execution path, while the
  max position size feeds the Kelly sizing suggestion.
- **Focus management**: the shared `Modal` and the command palette move focus into the dialog, trap `Tab`,
  restore focus to the opener, restore the previous body scroll lock and use a unique title id.
- **Health monitor truthfulness**: "API Uptime" became "Session Uptime", the never-measured gateway-latency card
  was removed, the worker card shows "Worker Pool Capacity", and the offload sentence matches the actual worker
  usage.
- **Regime classifier naming**: the rule-based EMA/ATR regime detector is no longer presented as a Hidden Markov
  Model; the panel reads "Regime Classifier" and the badge reads "Signal Score".
- **Quantity quick-set controls**: the buttons are labelled 25/50/75/100 lots instead of percentages of an
  arbitrary constant.
- **Dead redesign paths**: the never-supplied emergency callback is replaced by the real reset action, the
  never-rendered one-click trade buttons are removed, and the status bar no longer invents a "0.8ms" gateway
  latency.
- **Worker test execution**: `src/workers/marketAnalyzer.worker.test.ts` is compiled and executed, and
  `npm test` clears `test-out` before compiling so stale output cannot inflate the counts.

### Changed
- **Documentation truth**: `robot trader/README.md`, `robot trader/server/README.md`, `API_DOCS.md`,
  `GAP_ANALYSIS_2026-08-24.md`, `DELIVERY/راهنمای-راه‌اندازی-و-بهره‌برداری.md`, both audit reports, the
  delivery acceptance report and this changelog now describe the code as it is: the frontend tape, the
  simulated-feed labels, the session uptime, the advisory position-size limit, the seeded ensemble/federated/XAI
  engines, the drift *recommendation* instead of automatic retraining, and the current test counts.
- **Root `check` script**: `npm run check` now ends with `npm run verify`, so a drifting test count fails the
  same command CI runs.

### Verified
- **Full-Stack Test Verification**: 279 of 279 automated tests passing with 100% green status (73 Python tests, 206 Node tests, 0 TypeScript compiler diagnostics).
- **Browser end-to-end**: 7 passed, 1 skipped (`npm run test:e2e --workspace app`).

## [2.9.0] - 2026-10-29

### Fixed
- **Build repair — neutral badge tone**: `MarketRegimeTimeline.tsx` and `SentimentMonitor.tsx` passed a
  `neutral` tone that the shared `Badge` component never had; both now use the existing `slate` tone, and
  `npm run typecheck` reports zero diagnostics.
- **Browser end-to-end execution**: the Playwright base URL (`http://127.0.0.1:5173`) was missing from the
  market proxy's WebSocket origin allowlist, so every upgrade was closed with 1008 "Origin not allowed" and
  the chaos spec matched the substring `DISCONNECTED` inside `CONNECTED`. The e2e origin is now injected
  through the Playwright web-server environment and the connection state is asserted through the badge's
  accessible name, so the case proves a real connection.

### Added
- **Terminal navigation contract**: all 22 sidebar ids render their own labelled destination
  (`<section aria-label="…">`), the scrolling content container is a named `role="region"`
  (`Terminal content`) while the `<main>` landmark stays intact, and `tests/audit/navigation.spec.ts`
  walks the command palette and asserts every label lands on a visible, non-empty region.
- **ONNX contract pinning**: `ml_service/test_model_contract.py` and
  `robot trader/server/modelArtifactContract.test.js` pin the input/output names, shapes and SHA-256
  digests of both shipped artifacts, and assert that the Python research artifact (5 features, 2 outputs)
  and the Node serving artifact (10 features, 1 output) are distinct — the contract mismatch is now proven
  instead of implied. The `ml_service/main.py` docstring no longer claims the Node serving artifact is
  produced by the Python pipeline.
- **Orphan-module guard**: `robot trader/src/orphanGuard.test.ts` walks `src/`, resolves the static import
  graph (worker entries included), and fails when a production module has no production importer — the next
  orphan fails the test suite instead of a later audit.
- **Documentation-count guard**: `scripts/verify-doc-counts.mjs` (wired as `npm run verify`) runs the Node
  workspaces and the Python suite, parses the executed case counts out of their output and fails when
  `README.md`, `CHANGELOG.md` or `DELIVERY/گزارش-پذیرش-نهایی.md` advertise a different total.

### Changed
- **One API configuration surface**: the redesign's inline panel moved into
  `components/dashboard/ApiSettingsPanel.tsx` and `App.tsx` now renders that component, passing `onLogin`,
  `onLogout` and `onTestConnection` so the live `BackendApiService` session path and `apiConfig.apiKey` are
  unchanged. The published names (`API Proxy & Integration`, `Save & Test Connection`,
  `Connection Verified ✓`) are preserved.
- **Retired dead modules**: `components/charts/WalkForwardChart.tsx` (a pure pass-through to
  `ProfessionalChart`), `stressEngine.ts` (no importer, no test, and an input contract `SystemMetrics`
  cannot supply without invented performance figures) and the legacy `services/api.ts` client are deleted.
  Re-introducing stress testing is a feature request with its own input contract.

### Verified
- **Full-Stack Test Verification**: 279 of 279 automated tests passing with 100% green status (73 Python tests, 206 Node tests, 0 TypeScript compiler diagnostics).

## [2.8.0] - 2026-08-29

### Changed
- **"Cybernetic Quant" terminal redesign**: the trading terminal was rebuilt around a dark, instrument-panel
  aesthetic — a new design-token layer (surface containers, telemetry cyan, vibrant emerald, crimson loss,
  amber warning, mono/sans pairing), a shared UI primitive set (`Card`, `Badge`, `Button`, `StatusDot`,
  `Gauge`, `Empty`, `Alert`, `Modal`, `Skeleton`) and a reworked application shell (grouped sidebar,
  command palette with `Ctrl+K` navigation, mobile drawer, bottom navigation and a status bar). Every
  dashboard and analytics panel — order book, correlations, sentiment, arbitrage, regime timeline, learning,
  paper trading, backtesting, performance, risk, trade ticket, system telemetry — was restyled on the new
  primitives, and the API destination gained its own proxy, credential and connection-test surface.

## [2.7.0] - 2026-08-27

### Added
- **Full System Knowledge Graph (`graphify-out/`)**: Extracted complete AST and functional relationship graph with 1,546 nodes, 2,798 edges, and 111 functional communities via Graphify.
- **Interactive Visual Architecture Artifact (`graphify-out/graph.html`)**: Interactive SVG/canvas graph explorer with community clustering and God-node isolation.
- **Dual-Verification Architecture Specifications**: Detailed Mermaid workflows and verified state machines across Frontend Terminal, Backend/Gateway, and AI/ML engine.

### Fixed
- **Python 3.12 / pandas Series bitwise warning cleanup (`ml_service/strategy_engine.py`)**: Fixed 1,200+ deprecation warnings caused by bitwise inversion on boolean Series by using `shift(1, fill_value=False)` and proper boolean negation.
- **Frontend Risk & Formatting Bug Fixes**:
  - `RiskControlPanel.tsx`: Fixed maintenance requirement display ratio formatting (e.g. `0.15` $\to$ `15%`).
  - `TradeTicket.tsx`: Standardized currency presentation to IRR and guarded against `NaN` or zero division.
  - `FullPaperTradingDashboard.tsx`: Fixed cumulative PnL memoization and timeline calculation ordering.
  - `riskEngine.ts`: Added finite value guards on drawdown and liquidation distance calculations.
- **WebSocket Gateway Crash Protection (`server/index.js`)**: Added client-side socket error listeners and safe send callback handling to prevent unhandled EventEmitter crashes during abrupt client disconnects.
- **Backend Error Handling**: Wrapped `/api/tse/history/:symbolId` and analysis engines with structured try/catch fallbacks.

### Verified
- **Full-Stack Test Verification**: 221 of 221 automated tests passing with 100% green status (69 Python tests, 152 Node/Gateway tests, 0 TypeScript compiler diagnostics).

## [2.6.0] - 2026-08-23

### Added
- **Database layer** (`robot trader/server/db/`): a real relational persistence layer using the built-in `node:sqlite` module (zero native dependencies). Includes idempotent migrations (`migrations/001_init.sql`), an auto-seed, and repositories for `predictions`, `trades`, `audit_events`, `settings`, and `market_snapshots`.
- **Authentication** (`robot trader/server/auth/`): `register` / `login` / `refresh` endpoints with `crypto.scrypt` password hashing (salted + timing-safe), JWT access/refresh tokens, and `requireAuth` / `requireAdmin` / `requireDb` middleware.
- **Persistence endpoints**: `GET/POST /api/predictions`, `POST /api/predictions/evaluate`, `DELETE /api/predictions`, `GET/POST /api/trades`, `POST /api/trades/:id/close`, `GET /api/audit` (admin-only).
- **Frontend API client** (`robot trader/src/services/api.ts`): JWT token management + authenticated fetch helpers.
- **Login form** in the Settings panel (Account Authentication).
- **Integration test** (`robot trader/server/integration.test.js`): boots the real server and verifies the register → login → persist → evaluate → authorization flow.
- **DB unit tests** (`robot trader/server/db/database.test.js`).
- **Environment examples** (`.env.example`) for both backends.
- **Secret generation script** (`scripts/generate-secrets.sh`).
- **`.dockerignore`** files for all three build contexts.
- **Kubernetes Secret template** (`k8s/secret.yaml`) with placeholder values.

### Fixed
- **Missing database**: predictions, trades and audit events were previously localStorage/env-only; now persisted and queryable.
- **Dummy authentication**: login previously compared against plain env vars; now backed by scrypt-hashed users in SQLite.
- **Fabricated metrics**: `/api/train` no longer clamps accuracy/Sharpe/drawdown/calibration to artificial floors/ceilings.
- **Fabricated drift**: `modelManager.monitorDrift` no longer adds a deterministic `+0.05 * n` fudge factor.
- **Fake auto-retrain / hot-reload**: `triggerAutoRetrain` no longer fakes a model version bump.
- **`candles` undefined bug**: `/api/tse/history/:symbolId` position-sizing now reads `historyData` (was always throwing and falling back).
- **Shadow-mode field mismatch**: `analysis.action` → `analysis.prediction`.
- **Startup crash**: `pinoLogger` falls back when `pino-pretty` is absent; `logger` uses a real `ConsoleSpanExporter` (was passing a Winston transport).
- **Hardcoded port**: ML backend now honors `process.env.PORT`.
- **Frontend env access**: Vite env vars (`VITE_BACKEND_URL`, `VITE_PROXY_URL`, `VITE_WS_URL`) now injected via `define` (previously `process.env` never resolved in the browser).
- **Frontend routing**: `/api/tse`, `/api/analyze`, `/api/news`, `/api/train` now target the ML backend (3000) instead of the proxy or relative paths.
- **Fake trade result**: the trade panel no longer settles outcomes with `Math.random()`; orders are posted to `/api/trades`.
- **MACD signal**: signal line is now a proper EMA-9 of the MACD line (was `value * 0.9`).
- **Docker Compose**: secrets/env via `.env`, correct model path, `wget`-based healthchecks (curl is absent in alpine), persisted DB volume.
- **Node base image pinned** to `node:22.14-alpine` (required for `node:sqlite`).
- **`ml_service/main.py`**: now a real entry point that runs the PPO training pipeline.

### Changed
- README: added Node 22.13+ prerequisite, environment setup, and a Database & Authentication section.
- `.gitignore`: ignores `secrets/`, SQLite files, `data/`, `.cluster/`, and the agent workspace files.

### Known open items
- ONNX model contract: the Python and Node ONNX models have incompatible signatures (needs a single model contract + real training data).
- PPO action-space mismatch (discrete vs continuous direction).
- CI/CD has no deploy step (images are built but not rolled out to Kubernetes).
- Terraform/EKS provisioning is incomplete (needs infra credentials).
- Live TSETMC data still falls back to simulation in the sandbox.
