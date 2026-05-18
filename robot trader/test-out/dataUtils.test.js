"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const node_test_1 = require("node:test");
// @ts-ignore
const node_assert_1 = __importDefault(require("node:assert"));
const dataUtils_1 = require("./dataUtils");
(0, node_test_1.test)('calculateMACD - returns correct structure', () => {
    const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
    const result = (0, dataUtils_1.calculateMACD)(prices);
    node_assert_1.default.ok(result !== null, 'Result should not be null');
    node_assert_1.default.strictEqual(typeof result.value, 'number', 'value should be a number');
    node_assert_1.default.strictEqual(typeof result.signal, 'number', 'signal should be a number');
    node_assert_1.default.strictEqual(typeof result.histogram, 'number', 'histogram should be a number');
});
(0, node_test_1.test)('calculateMACD - constant prices results in zero macdValue', () => {
    const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const result = (0, dataUtils_1.calculateMACD)(prices);
    // ema12 and ema26 should both be 100, so value should be 0
    node_assert_1.default.strictEqual(result.value, 0);
    node_assert_1.default.strictEqual(result.signal, 0);
    node_assert_1.default.strictEqual(result.histogram, 0);
});
(0, node_test_1.test)('calculateMACD - increasing prices results in positive macdValue', () => {
    const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130];
    const result = (0, dataUtils_1.calculateMACD)(prices);
    // With increasing prices, short EMA should be higher than long EMA
    node_assert_1.default.ok(result.value > 0, `macdValue should be positive for increasing prices, got ${result.value}`);
});
(0, node_test_1.test)('calculateMACD - calculation logic verification', () => {
    // Manual calculation for a small set
    // EMA_SHORT = 12, k_short = 2 / 13
    // EMA_LONG = 26, k_long = 2 / 27
    // prices = [100, 110]
    // ema12 = 110 * (2/13) + 100 * (11/13) = (220 + 1100) / 13 = 1320 / 13 = 101.538...
    // ema26 = 110 * (2/27) + 100 * (25/27) = (220 + 2500) / 27 = 2720 / 27 = 100.740...
    // value = 101.538 - 100.740 = 0.798...
    // signal = 0.798 * 0.9 = 0.718...
    // histogram = 0.798 - 0.718 = 0.08
    const prices = [100, 110];
    const result = (0, dataUtils_1.calculateMACD)(prices);
    const expectedEma12 = 110 * (2 / 13) + 100 * (11 / 13);
    const expectedEma26 = 110 * (2 / 27) + 100 * (25 / 27);
    const expectedValue = expectedEma12 - expectedEma26;
    const expectedSignal = expectedValue * 0.9;
    const expectedHistogram = expectedValue - expectedSignal;
    node_assert_1.default.ok(Math.abs(result.value - expectedValue) < 0.0001, `Value mismatch: got ${result.value}, expected ${expectedValue}`);
    node_assert_1.default.ok(Math.abs(result.signal - expectedSignal) < 0.0001, `Signal mismatch: got ${result.signal}, expected ${expectedSignal}`);
    node_assert_1.default.ok(Math.abs(result.histogram - expectedHistogram) < 0.0001, `Histogram mismatch: got ${result.histogram}, expected ${expectedHistogram}`);
});
(0, node_test_1.test)('calculateMACD - handles single price element', () => {
    const prices = [100];
    const result = (0, dataUtils_1.calculateMACD)(prices);
    node_assert_1.default.strictEqual(result.value, 0);
    node_assert_1.default.strictEqual(result.signal, 0);
    node_assert_1.default.strictEqual(result.histogram, 0);
});
// ========================================
// Helper to create candles
// ========================================
const createCandles = (count, trend) => {
    const candles = [];
    let price = 10000;
    for (let i = 0; i < count; i++) {
        let change = 0;
        if (trend === 'UP')
            change = 10;
        else if (trend === 'DOWN')
            change = -10;
        else if (trend === 'VOLATILE')
            change = (Math.random() - 0.5) * 2000; // Extreme volatility
        else
            change = (Math.random() - 0.5) * 2;
        price = Math.max(100, price + change); // Keep price positive
        const range = trend === 'VOLATILE' ? 500 : 5;
        candles.push({
            timestamp: Date.now() - (count - i) * 60000,
            open: price,
            high: price + range,
            low: price - range,
            close: price,
            volume: 1000
        });
    }
    return candles;
};
// ========================================
// Test Suite: Market Regime Detection
// ========================================
(0, node_test_1.describe)('dataUtils - Market Regime Detection', () => {
    (0, node_test_1.it)('should detect TRENDING_UP regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'UP');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };
        const result = (0, dataUtils_1.analyzeMarketMTF)(mtfData, 'TEST_SYMBOL');
        node_assert_1.default.strictEqual(result.regime, 'TRENDING_UP');
    });
    (0, node_test_1.it)('should detect TRENDING_DOWN regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'DOWN');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };
        const result = (0, dataUtils_1.analyzeMarketMTF)(mtfData, 'TEST_SYMBOL');
        node_assert_1.default.strictEqual(result.regime, 'TRENDING_DOWN');
    });
    (0, node_test_1.it)('should detect HIGH_VOLATILITY regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'VOLATILE');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };
        const result = (0, dataUtils_1.analyzeMarketMTF)(mtfData, 'TEST_SYMBOL');
        const volatility = result.indicators.atr / result.entryPrice;
        // Ensure volatility is high enough for the test
        if (volatility <= 0.03) {
            console.warn('Test warning: Generated data was not volatile enough. Retrying or adjusting test expectations might be needed.');
        }
        node_assert_1.default.strictEqual(result.regime, 'HIGH_VOLATILITY');
    });
});
// ========================================
// Test Suite: TseApiClient
// ========================================
(0, node_test_1.describe)('TseApiClient', () => {
    let originalFetch;
    let originalConsoleError;
    (0, node_test_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
        originalConsoleError = console.error;
        // Suppress console.error for expected failures
        console.error = () => { };
    });
    (0, node_test_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
    });
    (0, node_test_1.test)('fetchMarketData fetches from proxy when configured and connected', async () => {
        const mockResponse = [{
                timestamp: 12345,
                open: 100,
                high: 110,
                low: 90,
                close: 105,
                volume: 1000
            }];
        // Mock fetch success
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({ data: mockResponse }),
        });
        const config = {
            proxyUrl: 'http://proxy.com',
            apiKey: 'key',
            isConnected: true,
            useDigitalTwin: false,
        };
        const client = new dataUtils_1.TseApiClient(config);
        const data = await client.fetchMarketData('TEST');
        node_assert_1.default.deepStrictEqual(data, mockResponse);
    });
    (0, node_test_1.test)('fetchMarketData falls back to Digital Twin on fetch error after retries', async () => {
        // Mock fetch failure
        globalThis.fetch = async () => {
            throw new Error('Network Error');
        };
        const config = {
            proxyUrl: 'http://proxy.com',
            apiKey: 'key',
            isConnected: true,
            useDigitalTwin: false,
        };
        const client = new dataUtils_1.TseApiClient(config);
        const data = await client.fetchMarketData('TEST');
        node_assert_1.default.ok(Array.isArray(data));
        node_assert_1.default.strictEqual(data.length, 0); // Should return empty array when useDigitalTwin is false
    });
    (0, node_test_1.test)('fetchMarketData falls back to Digital Twin when no proxy URL configured', async () => {
        const config = {
            proxyUrl: undefined,
            apiKey: 'key',
            isConnected: true,
            useDigitalTwin: false,
        };
        const client = new dataUtils_1.TseApiClient(config);
        const data = await client.fetchMarketData('TEST');
        node_assert_1.default.ok(Array.isArray(data));
        node_assert_1.default.strictEqual(data.length, 0); // Should return empty array when useDigitalTwin is false
    });
});
(0, node_test_1.test)('calculateATR - returns 0 if candles length is less than 2', () => {
    const result0 = (0, dataUtils_1.calculateATR)([]);
    node_assert_1.default.strictEqual(result0, 0);
    const result1 = (0, dataUtils_1.calculateATR)([
        { timestamp: 1, open: 10, high: 15, low: 5, close: 12, volume: 100 }
    ]);
    node_assert_1.default.strictEqual(result1, 0);
});
(0, node_test_1.test)('calculateATR - correct ATR calculation with default and custom periods', () => {
    const candles = [
        { timestamp: 1, open: 10, high: 20, low: 10, close: 15, volume: 100 }, // TR = 10
        { timestamp: 2, open: 15, high: 25, low: 12, close: 20, volume: 100 }, // prevClose=15, TR = max(25-12, abs(25-15), abs(12-15)) = max(13, 10, 3) = 13
        { timestamp: 3, open: 20, high: 22, low: 18, close: 21, volume: 100 }, // prevClose=20, TR = max(22-18, abs(22-20), abs(18-20)) = max(4, 2, 2) = 4
    ];
    // Period 14 but only 3 candles -> calculates ATR for 3 candles
    // trs: [10, 13, 4] -> sum = 27 -> ATR = 27 / 3 = 9
    const resultDefault = (0, dataUtils_1.calculateATR)(candles);
    node_assert_1.default.strictEqual(resultDefault, 9);
    // Period 2 -> takes last 2 candles
    // Note: with slice(-2), we take candles[1] and candles[2]
    // In calculateATR, if i===0 for the slice, it just takes c.high - c.low.
    // slice(-2)[0] is candles[1] (high: 25, low: 12 -> TR = 13)
    // slice(-2)[1] is candles[2] (high: 22, low: 18 -> prevClose = candles[1].close = 20 -> TR = 4)
    // trs: [13, 4] -> sum = 17 -> ATR = 17 / 2 = 8.5
    const resultPeriod2 = (0, dataUtils_1.calculateATR)(candles, 2);
    node_assert_1.default.strictEqual(resultPeriod2, 8.5);
});
