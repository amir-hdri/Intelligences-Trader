"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_METRICS = exports.DEFAULT_RISK_LIMITS = exports.INDICATOR_PARAMS = exports.DEFAULT_API_CONFIG = exports.IME_SYMBOLS = void 0;
exports.IME_SYMBOLS = [
    {
        id: 'SAF-NGN-FUT',
        name: 'زعفران نگین آتی',
        fullName: 'آتی زعفران نگین سررسید مهر ۱۴۰۴',
        type: 'FUTURES',
        expiryDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
        storageCost: 50,
        priceLimit: { up: 1250000, down: 1100000 }
    },
    {
        id: 'SAF-NGN-SPOT',
        name: 'زعفران نگین نقدی',
        fullName: 'گواهی سپرده زعفران نگین',
        type: 'CERTIFICATE',
        storageCost: 30,
        priceLimit: { up: 950000, down: 880000 }
    },
    {
        id: 'GOLD-FUT',
        name: 'سکه آتی',
        fullName: 'آتی سکه تمام سررسید دی ۱۴۰۴',
        type: 'FUTURES',
        expiryDate: Date.now() + 120 * 24 * 60 * 60 * 1000,
        storageCost: 100,
        priceLimit: { up: 1850000, down: 1650000 }
    },
    {
        id: 'GOLD-FUND',
        name: 'صندوق طلا',
        fullName: 'صندوق سرمایه گذاری طلای لوتوس',
        type: 'FUND',
        priceLimit: { up: 22500, down: 21000 }
    },
    {
        id: 'STEEL-SPOT',
        name: 'فولاد مبارکه',
        fullName: 'ورق گرم فولاد مبارکه (فیزیکی)',
        type: 'SPOT',
        priceLimit: { up: 350000, down: 320000 }
    },
];
exports.DEFAULT_API_CONFIG = {
    proxyUrl: 'http://localhost:3001',
    apiKey: (typeof process !== 'undefined' ? process.env : {}).VITE_API_KEY || '',
    isConnected: true, // Default to connected for real data mode
    useDigitalTwin: false, // Disable simulation by default
};
exports.INDICATOR_PARAMS = {
    RSI_PERIOD: 14,
    ATR_PERIOD: 14,
    BOLLINGER_PERIOD: 20,
    BOLLINGER_STD: 2,
    EMA_SHORT: 12,
    EMA_LONG: 26,
    SIGNAL_PERIOD: 9,
    BASIS_THRESHOLD: 0.05,
};
exports.DEFAULT_RISK_LIMITS = {
    maxDailyDrawdown: 1.5,
    maxTotalDrawdown: 10.0,
    maxPositionSize: 20.0,
    maxOpenTrades: 15,
    stopAllTrading: false,
};
const MOCK_CORRELATION = {
    usdFree: 650000,
    usdNima: 420000,
    globalGold: 2350,
    globalCopper: 8400,
    globalBrent: 85,
    correlations: { 'USD_IME': 0.88, 'GOLD_IME': 0.92 }
};
const MOCK_SENTIMENT = {
    politicalRiskIndex: 50,
    score: 0.45,
    label: 'GREED',
    news: []
};
exports.INITIAL_METRICS = {
    uptime: '00:00:00',
    latency: 0,
    accuracy: 0.72,
    activeOrders: 0,
    profitFactor: 2.1,
    maxDrawdown: 0,
    winRate: 0.68,
    status: 'OPERATIONAL',
    marketCorrelation: MOCK_CORRELATION,
    sentiment: MOCK_SENTIMENT,
    balance: 1000000
};
