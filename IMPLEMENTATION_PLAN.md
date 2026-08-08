# Intelligence Trader — Implementation Plan

## Phase 1 — Audit (completed within this session)
Architecture preserved: `useMarketData` (MTF candles, correlation, sentiment, forecast via WebWorker pool), `useWebSocket` (symbol-scoped, auto-reconnect with jitter, ORDER_BOOK/PRICE_CHANGE), `RiskEngine` (drawdown, margin, kill-switch, Kelly), `TseApiClient`+DigitalTwin fallback, ONNX backend via `/api/analyze`, persistence via `useLocalStorage`. Existing UI inspected: 9 legacy components + WalkForwardChart.

Feature → New Location map:
- DashboardHeader → GlobalHeader + TickerStrip
- MetricCard → KPI row (PoliticalRisk/BubbleGap/Herding/Sentiment/RiskBuffer) with skeletons/error
- WalkForwardChart → IntelligenceEngine (1m/15m/1h/1d, MA/BB, forecast overlays, regime zones)
- OrderBook → Dashboard + dedicated OrderBook (compact/expanded/heatmap stubs)
- MarketCorrelation → Correlation intelligence (matrix + drill-down)
- SentimentMonitor → Sentiment (radial gauge + news feed)
- ArbitragePanel → Arbitrage (status: New/Active/Expiring/Executed)
- TradePanel → TradeTicket + ConfirmDialog (MAX LOSS/EXPECTED PROFIT/R:R, Kelly)
- TradeLogsPanel → Positions + Orders + History (filterable journal)
- RiskControlPanel → Risk Center (VaR95/99, ES, exposure gauges)
- SystemHealthMonitor → SystemHealth (API/WS/ML/DB/pipeline, CPU/MEM)
- ApiSettingsPanel → API Configuration (masked secrets, WS/ML endpoints)
- LearningDashboard → Performance/Learning/ModelDashboard (accuracy, F1, drift)
- HistoricalData utils → Data Explorer (virtualized table, filters, export)

## Phase 2 — Design System (implemented)
Tokens in `src/index.css` using @theme: #05070B bg, #0B0F17/#101620/#151C27 surfaces, rgba(255,255,255,0.07) border, Inter+JetBrains Mono tabular. Common: Button, IconButton, Input, Select, Tabs, Modal, Drawer, Tooltip, Toast, Badge, Card, MetricCard, DataTable, ChartContainer, StatusIndicator, Progress, Gauge, Skeleton (shimmer), Alert, ConfirmationDialog, PriceTicker, MarketSelector, AISignal, RiskIndicator, OrderBook, TradeTicket, PositionCard, SentimentGauge, ArbitrageCard.

## Phases 3-10 — Incremental modular build
3 AppShell (Header+Sidebar collapsible+Mobile drawer+BottomNav+StatusBar)
4 Dashboard (KPI+skeleton/error + IME chart + AISignal separation + OrderBook+Correlation)
5 Trading (TradeTicket validation+Positions cards+Orders tabs+History filters)
6 Intelligence (Hub, Regime timeline, Sentiment radial, Arbitrage compact cards)
7 AI/ML (Forecast overlay, Regime screen, Model ONNX 18ms, Learning dashboard)
8 Analytics (Backtesting walk-forward, Performance Sharpe/Sortino, Risk gauges)
9 System (Health realtime, API masked, Notifications center, ⌘K palette)
10 Responsive QA (320/375/390/430/768/1024/1280/1440/1920/ultrawide) + typecheck+build+tests

## Constraints respected
- No backend rewrite, no secret exposure, real data models first, WorkerPool kept, performance via memo/virtualization/lazy chunks.
