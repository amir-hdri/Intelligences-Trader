import { API_BASE_URL } from './constants';
import { MarketCandle } from './types';

/**
 * Fetches real historical market data from the backend proxy.
 * Replaces the previous static mocked data generation.
 *
 * @param symbolId The ID of the symbol to fetch (e.g. 'SAF-NGN-FUT', 'GOLD-FUT')
 * @param proxyUrl The base URL of the OMS proxy server
 * @returns A promise that resolves to an array of MarketCandle data
 */
export const fetchHistoricalData = async (
  symbolId: string,
  proxyUrl: string = API_BASE_URL
): Promise<MarketCandle[]> => {
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
  } catch (error) {
    console.error(`Failed to fetch historical data for ${symbolId}:`, error);
    return [];
  }
};

/**
 * Helper to fetch Saffron Futures data
 */
export const fetchSaffronData = async (proxyUrl?: string): Promise<MarketCandle[]> => {
  return fetchHistoricalData('SAF-NGN-FUT', proxyUrl);
};

/**
 * Helper to fetch Gold Futures data
 */
export const fetchGoldData = async (proxyUrl?: string): Promise<MarketCandle[]> => {
  return fetchHistoricalData('GOLD-FUT', proxyUrl);
};
