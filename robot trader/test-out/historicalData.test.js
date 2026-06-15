"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const node_test_1 = require("node:test");
// @ts-ignore
const node_assert_1 = __importDefault(require("node:assert"));
const historicalData_1 = require("./historicalData");
(0, node_test_1.describe)('historicalData', () => {
    let originalFetch;
    let originalConsoleError;
    (0, node_test_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
        originalConsoleError = console.error;
        // Suppress console.error in tests
        console.error = () => { };
    });
    (0, node_test_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
    });
    (0, node_test_1.describe)('fetchHistoricalData', () => {
        (0, node_test_1.test)('should return data when response is a direct array', async () => {
            const mockData = [{ close: 100 }, { close: 101 }];
            globalThis.fetch = async (url) => {
                node_assert_1.default.strictEqual(url, 'http://localhost:3000/api/tse/history/TEST-SYM');
                return {
                    ok: true,
                    json: async () => mockData,
                };
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM');
            node_assert_1.default.deepStrictEqual(result, mockData);
        });
        (0, node_test_1.test)('should return data when response has data array property', async () => {
            const mockData = [{ close: 100 }, { close: 101 }];
            globalThis.fetch = async (url) => {
                return {
                    ok: true,
                    json: async () => ({ data: mockData }),
                };
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM');
            node_assert_1.default.deepStrictEqual(result, mockData);
        });
        (0, node_test_1.test)('should return empty array when response is not ok', async () => {
            globalThis.fetch = async (url) => {
                return {
                    ok: false,
                    status: 404,
                };
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM');
            node_assert_1.default.deepStrictEqual(result, []);
        });
        (0, node_test_1.test)('should return empty array when response data is invalid', async () => {
            globalThis.fetch = async (url) => {
                return {
                    ok: true,
                    json: async () => ({ unexpected: 'format' }),
                };
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM');
            node_assert_1.default.deepStrictEqual(result, []);
        });
        (0, node_test_1.test)('should return empty array when fetch throws an error', async () => {
            globalThis.fetch = async () => {
                throw new Error('Network error');
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM');
            node_assert_1.default.deepStrictEqual(result, []);
        });
        (0, node_test_1.test)('should use provided proxyUrl', async () => {
            const mockData = [{ close: 50 }];
            globalThis.fetch = async (url) => {
                node_assert_1.default.strictEqual(url, 'http://custom-proxy:4000/api/tse/history/TEST-SYM');
                return {
                    ok: true,
                    json: async () => mockData,
                };
            };
            const result = await (0, historicalData_1.fetchHistoricalData)('TEST-SYM', 'http://custom-proxy:4000');
            node_assert_1.default.deepStrictEqual(result, mockData);
        });
    });
    (0, node_test_1.describe)('fetchSaffronData', () => {
        (0, node_test_1.test)('should fetch data for SAF-NGN-FUT', async () => {
            const mockData = [{ close: 200 }];
            globalThis.fetch = async (url) => {
                node_assert_1.default.strictEqual(url, 'http://localhost:3000/api/tse/history/SAF-NGN-FUT');
                return {
                    ok: true,
                    json: async () => mockData,
                };
            };
            const result = await (0, historicalData_1.fetchSaffronData)();
            node_assert_1.default.deepStrictEqual(result, mockData);
        });
    });
    (0, node_test_1.describe)('fetchGoldData', () => {
        (0, node_test_1.test)('should fetch data for GOLD-FUT', async () => {
            const mockData = [{ close: 300 }];
            globalThis.fetch = async (url) => {
                node_assert_1.default.strictEqual(url, 'http://localhost:3000/api/tse/history/GOLD-FUT');
                return {
                    ok: true,
                    json: async () => mockData,
                };
            };
            const result = await (0, historicalData_1.fetchGoldData)();
            node_assert_1.default.deepStrictEqual(result, mockData);
        });
    });
});
