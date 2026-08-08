# Intelligences-Trader

A research and simulation platform for Iranian commodity-market analytics. The repository combines a React terminal, a Node.js analysis service, a market-data/WebSocket gateway, and a Python PPO/TCN research pipeline.

> **Important:** this is not a production brokerage or high-frequency execution system. It does not place live orders. Generated candles, simulated order books, macro values, and experimental engines are labelled research/demo data and must not be used as verified exchange data.

## Architecture

```mermaid
graph LR
  UI[React terminal :5173] -->|same-origin /api| ML[Analysis API :3000]
  UI -->|same-origin /ws| GW[Market gateway :3001]
  GW --> TSE[TSETMC history provider]
  ML --> ONNX[ONNX WASM inference]
  PY[Python research pipeline] --> MODEL[Versioned ONNX artifact]
```

| Area | Path | Purpose |
|---|---|---|
| Terminal | `robot trader/` | Dashboard, risk controls, indicators, backtesting, worker pool |
| Analysis API | `robot trader/server/` | Rule analysis, model inference, research training endpoints |
| Gateway | `server/` | TSETMC history adapter, explicitly labelled fallback simulation, WebSocket feed |
| Python ML | `ml_service/` | TCN actor-critic, PPO training, HMM regimes, safety circuit breaker |

The frontend uses relative `/api` and `/ws` URLs. Vite proxies these routes during development, while the production Nginx template proxies them inside Docker/Kubernetes. Browser code does not depend on `localhost` service URLs.

## Quick start

### Node services and terminal

Requirements: Node.js 22 and npm 10+.

```bash
npm ci
npm run typecheck
npm test --workspaces --if-present
npm run build
```

Run the three processes in separate shells:

```bash
npm start --workspace tse-proxy-server
npm start --workspace server
npm run dev --workspace app
```

Open `http://localhost:5173`. Digital-twin fallback is enabled in the default client configuration so the research UI remains usable when TSETMC is unavailable. The UI settings can disable it.

### Python ML checks

Requirements: Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
cd ml_service
uv sync --locked
uv run pytest -q
```

Training dependencies are optional because PyTorch/ONNX are large:

```bash
uv sync --locked --extra training
uv run python train.py
```

## Docker Compose

```bash
docker compose up --build
```

The frontend is exposed on port 5173 and reverse-proxies the internal services. Set `PUBLIC_ORIGIN` when the browser origin is not `http://localhost:5173`.

Authentication for expensive/mutating analysis routes is opt-in:

```bash
AUTH_REQUIRED=true \
JWT_SECRET='a-long-random-secret' \
REFRESH_SECRET='another-long-random-secret' \
ADMIN_USERNAME='admin' \
ADMIN_PASSWORD='use-a-secret-manager' \
docker compose up --build
```

Never commit these values. Experimental simulated ensemble/federated/HPO endpoints return HTTP 501 unless `ENABLE_EXPERIMENTAL_SIMULATIONS=true` is explicitly set.

## Validation and safety improvements

- Stateful drawdown tracking and a sticky kill switch; balance updates no longer recreate the risk engine.
- Position sizing is capped by both fractional Kelly risk and maximum notional exposure.
- WebSocket payload validation, order-book normalization, bounded reconnect backoff, heartbeat, and backpressure handling.
- Strict OHLCV/model-input validation and honest out-of-sample metrics (no hard-coded performance floors).
- Causal TCN convolutions and consistent PPO direction encoding (`0=short`, `1=hold`, `2=long`).
- HMM short-history fallback, finite-value checks, authenticated AES-256-GCM secret encryption, rate limits, CORS allowlists, and request-size limits.
- Reproducible root lockfile, zero npm audit findings, verified Python test commands, and deterministic Docker workspace builds.

See [`AUDIT_REPORT.md`](./AUDIT_REPORT.md) for the detailed audit, fixes, and remaining limitations.

## API highlights

- Analysis: `GET /api/status`, `POST /api/analyze`, `POST /api/predict`, `POST /api/train`
- Gateway: `GET /api/status`, `GET /api/market/:symbol`, `GET /api/orderbook/:symbol`
- Streaming: `ws://host/ws?symbol=GOLD-FUT`
- Metrics: `GET /metrics` on both Node services

### P2 Paper-Trading endpoints

- Execution & ML: `POST /api/paper-trading/p2/execute-ml`, `POST /api/paper-trading/p2/strategy`
- Analytics: `GET /api/paper-trading/p2/metrics`, `POST /api/paper-trading/p2/report`
- Backtest: `POST /api/paper-trading/p2/backtest`
- Order book: `GET|POST /api/paper-trading/p2/orderbook`, `POST /api/paper-trading/p2/orderbook/order|cancel`
- Order state machine: `GET|POST /api/paper-trading/p2/orders`, `POST /api/paper-trading/p2/orders/cancel|fill`
- Data feed: `POST /api/paper-trading/p2/data/ohlcv`, `GET|POST /api/paper-trading/p2/data/tick`
- Persistence: `POST /api/paper-trading/p2/trades/save`, `GET /api/paper-trading/p2/trades`

See [`PHASE2_CHANGES.md`](./PHASE2_CHANGES.md) for the Phase 2 build-out details.

## Disclaimer

Educational and research use only. Financial markets involve substantial risk. Validate data licenses, model provenance, exchange rules, security controls, and broker behavior independently before considering any real-world integration.
