# KalayBot Trading Terminal

The high-performance frontend for the Intelligences-Trader ecosystem, built with **React**, **TypeScript**, and **Vite**.

---

## 🏗 Modular Architecture

The terminal has been refactored to prioritize maintainability and performance using a modular component and hook structure.

### 1. **Custom Hooks (`/src/hooks`)**
- `useMarketData`: Orchestrates data fetching across multiple timeframes, manages analysis dispatching to workers/backend, and handles model training state.
- `useWebSocket`: Provides real-time connectivity for L2 Order Books and price ticks with automatic reconnection logic.
- `useLocalStorage`: Handles seamless state persistence for user preferences, equity balance, and risk configurations.

### 2. **Component Organization**
- **`/components/dashboard`**: High-level layout components like `DashboardHeader` and `TradePanel`.
- **`/components/analytics`**: Specialized data visualization components (OrderBook, SentimentMonitor, ArbitragePanel, MarketCorrelation).
- **`/components/common`**: Reusable UI primitives like `MetricCard`.
- **`/components/charts`**: Advanced Recharts implementations for price action and walk-forward analysis.

---

## 🎨 Design System: "Institutional Glassmorphism"

The UI implements a custom design system characterized by:
- **Depth & Transparency:** Multi-layered backdrop blurs and glass panels.
- **Dynamic Feedback:** State-aware highlight colors (Emerald for growth, Rose for risk, Amber for warnings).
- **Typography:** High-contrast monospace fonts for financial data to ensure clarity and precision.

---

## ⚙️ Key Modules

### **Alpha Execution Panel**
- Real-time visualization of Neural Signals (BUY/SELL/HOLD).
- Confidence scores and mathematical reasoning.
- Integrated **Value at Risk (VaR)** and suggested position sizing based on Kelly Criterion.

### **Sentiment Engine Monitor**
- Visualizes political risk indices.
- Real-time NLP news feed with entity tagging (NER) and impact analysis.

### **Order Book Depth L2**
- Visualizes bid/ask pressure.
- **Spoofing Detection** indicators to alert traders of potential market manipulation.

---

## 🛠 Setup & Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

---

## 🔬 Performance Optimizations

- **Web Workers:** Market analysis and strategy optimization are offloaded to background threads using a `WorkerPool` to keep the UI responsive.
- **SharedArrayBuffer:** Utilized for detecting race conditions between the main thread and analysis workers.
- **TypedArrays:** Efficient memory management for large historical datasets.
