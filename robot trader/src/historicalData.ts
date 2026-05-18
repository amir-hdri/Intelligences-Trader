import { MarketCandle } from './types';

// Realistic IME Historical Data (Mocked but based on 1403/1404 price levels)
// Prices are in IRR (Iranian Rials)

export const HISTORICAL_SAFFRON_DATA: MarketCandle[] = Array.from({ length: 200 }).map((_, i) => {
  const basePrice = 950000; // ~95,000 Tomans
  const trend = i * 200; // General upward trend
  const seasonalFactor = Math.sin((i / 200) * Math.PI * 2) * 50000;
  const randomNoise = Math.random() * 20000 - 10000;
  const close = basePrice + trend + seasonalFactor + randomNoise;

  return {
    timestamp: Date.now() - (200 - i) * 24 * 60 * 60 * 1000,
    open: close * (1 - Math.random() * 0.01),
    high: close * (1 + Math.random() * 0.015),
    low: close * (1 - Math.random() * 0.015),
    close: close,
    volume: 100000 + Math.random() * 500000,
    openInterest: 5000 + Math.random() * 2000,
    basis: close * (0.05 + Math.random() * 0.03),
    warehouseVolume: 20000 - i * 50,
  };
});

export const HISTORICAL_GOLD_DATA: MarketCandle[] = Array.from({ length: 200 }).map((_, i) => {
  const basePrice = 450000000; // ~45,000,000 Tomans
  const trend = i * 50000;
  const volatility = Math.random() * 5000000 - 2500000;
  const close = basePrice + trend + volatility;

  return {
    timestamp: Date.now() - (200 - i) * 24 * 60 * 60 * 1000,
    open: close * (1 - Math.random() * 0.005),
    high: close * (1 + Math.random() * 0.01),
    low: close * (1 - Math.random() * 0.01),
    close: close,
    volume: 5000 + Math.random() * 10000,
    openInterest: 15000 + Math.random() * 5000,
    basis: close * (0.01 + Math.random() * 0.02),
  };
});
