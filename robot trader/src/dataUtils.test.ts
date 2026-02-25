
// @ts-ignore
import { describe, it } from 'node:test';
// @ts-ignore
import assert from 'node:assert';
import { analyzeMarketMTF } from './dataUtils';
import { MarketCandle } from './types';

// Helper to create candles
const createCandles = (count: number, trend: 'UP' | 'DOWN' | 'FLAT' | 'VOLATILE'): MarketCandle[] => {
    const candles: MarketCandle[] = [];
    let price = 10000;
    for (let i = 0; i < count; i++) {
        let change = 0;
        if (trend === 'UP') change = 10;
        else if (trend === 'DOWN') change = -10;
        else if (trend === 'VOLATILE') change = (Math.random() - 0.5) * 2000; // Extreme volatility
        else change = (Math.random() - 0.5) * 2;

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

describe('dataUtils', () => {
    it('should detect TRENDING_UP regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'UP');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        assert.strictEqual(result.regime, 'TRENDING_UP');
    });

    it('should detect TRENDING_DOWN regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'DOWN');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        assert.strictEqual(result.regime, 'TRENDING_DOWN');
    });

    it('should detect HIGH_VOLATILITY regime indirectly via analyzeMarketMTF', () => {
        const candles = createCandles(100, 'VOLATILE');
        const mtfData = {
            '1m': [],
            '15m': [],
            '1h': candles,
            '1d': candles
        };

        const result = analyzeMarketMTF(mtfData, 'TEST_SYMBOL');
        const volatility = result.indicators.atr / result.entryPrice;
        // console.log('Volatile Test - ATR:', result.indicators.atr, 'Price:', result.entryPrice, 'Vol:', volatility);

        // Ensure volatility is high enough for the test
        if (volatility <= 0.03) {
            console.warn('Test warning: Generated data was not volatile enough. Retrying or adjusting test expectations might be needed.');
            // We can assert that volatility matches what we expect, or just fail with a better message
        }
        assert.strictEqual(result.regime, 'HIGH_VOLATILITY');
    });
});
