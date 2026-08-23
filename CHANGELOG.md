# Changelog

All notable changes to the Intelligences-Trader project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
