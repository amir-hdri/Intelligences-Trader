"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGoldData = exports.fetchSaffronData = exports.fetchHistoricalData = void 0;
/**
 * Fetches real historical market data from the backend proxy.
 * Replaces the previous static mocked data generation.
 *
 * @param symbolId The ID of the symbol to fetch (e.g. 'SAF-NGN-FUT', 'GOLD-FUT')
 * @param proxyUrl The base URL of the OMS proxy server
 * @returns A promise that resolves to an array of MarketCandle data
 */
const fetchHistoricalData = async (symbolId, proxyUrl = 'http://localhost:3000') => {
    try {
        const response = await fetch(`${proxyUrl}/api/tse/history/${symbolId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            return data;
        }
        if (data.data && Array.isArray(data.data)) {
            return data.data;
        }
        return [];
    }
    catch (error) {
        console.error(`Failed to fetch historical data for ${symbolId}:`, error);
        return [];
    }
};
exports.fetchHistoricalData = fetchHistoricalData;
/**
 * Helper to fetch Saffron Futures data
 */
const fetchSaffronData = async (proxyUrl) => {
    return (0, exports.fetchHistoricalData)('SAF-NGN-FUT', proxyUrl);
};
exports.fetchSaffronData = fetchSaffronData;
/**
 * Helper to fetch Gold Futures data
 */
const fetchGoldData = async (proxyUrl) => {
    return (0, exports.fetchHistoricalData)('GOLD-FUT', proxyUrl);
};
exports.fetchGoldData = fetchGoldData;
