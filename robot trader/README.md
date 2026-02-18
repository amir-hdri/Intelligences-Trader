# KalayBot AI - Professional IME Trading System

A professional-grade automated trading dashboard for the Iran Mercantile Exchange (IME / Mercado Kalo).
Designed for high-frequency analysis, risk management, and algorithmic execution.

## 🚀 Key Features

### 1. **Real Market Data Pipeline**
-   **TSETMC Integration:** Uses a dedicated Node.js proxy (`../server`) to fetch **real** market data, bypassing browser CORS restrictions.
-   **High-Fidelity Simulation:** Falls back to a professional-grade simulation (Geometric Brownian Motion + Jump Diffusion) if the exchange API is unreachable.

### 2. **Professional Risk Engine**
-   **Saf Hamle (Limit Up/Down) Protection:** Automatically detects locked markets (Saf Kharid/Saf Forush) and blocks entry to prevent capital entrapment.
-   **Dynamic Margin Requirements:** Increases margin requirements (up to 50% buffer) for contracts near expiry (< 10 days).
-   **Adaptive Kelly Criterion:** Adjusts position sizing based on market regime (Trend vs Volatility).

### 3. **Intelligence Engine**
-   **Basis Trading:** Real-time monitoring of Spot vs Future spread to detect risk-free **Cash & Carry Arbitrage**.
-   **Open Interest Analysis:** Correlates Price/OI divergence to identify "New Money" (Bullish) vs "Short Covering".
-   **Fair Value Models:** Calculates theoretical fair value for Gold Futures based on Global Ounce + USD Rate + Purity.

## 🛠 Installation & Usage

### Prerequisites
-   Node.js (v18+)

### 1. Start the Data Proxy Server
The backend handles real data fetching.
```bash
cd server  # From repository root
npm install
npm start
```
*Server runs on http://localhost:3001*

### 2. Start the Trading Terminal
The frontend provides the professional dashboard.
```bash
cd "robot trader"
npm install
npm run dev
```
*Terminal runs on http://localhost:5173*

## 📊 Strategy Details
-   **Trend:** Ichimoku Cloud (Baseline/Conversion Line crossovers).
-   **Momentum:** RSI (with Regime filters) & MACD.
-   **Arbitrage:** Basis > Cost of Carry (Interest + Storage).

## ⚠️ Disclaimer
This system is for educational and analytical purposes. Trading futures on IME involves significant risk of loss. The "Real Data" mode depends on public API availability.
