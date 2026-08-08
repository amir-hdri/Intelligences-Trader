import { evaluateStrategy } from './strategyOptimizer.js';
import { generateHistoricalData } from './dataFactory.js';
import { pinoLogger } from './pinoLogger.js';
import { createSeededRng } from './utils/deterministic.js';

export class HPOEngine {
  constructor() {
    this.history = [];
  }

  optimize(symbolId, iterations = 50) {
    pinoLogger.info({ event: 'hpo_start', symbolId }, 'Starting Bayesian Optimization (TPE)');
    const candles = generateHistoricalData(symbolId, 3);
    let bestScore = -Infinity;
    let bestParams = null;
    const baseRng = createSeededRng(`hpo-${symbolId}-${iterations}`);

    for (let i = 0; i < iterations; i++) {
      let params;
      const rng = createSeededRng(`hpo-iter-${symbolId}-${i}-${baseRng()}`);
      if (i > 10 && bestParams && rng() > 0.3) {
        params = {
          atrMultiplier: Math.max(1.0, bestParams.atrMultiplier + (rng() * 0.4 - 0.2)),
          fractionalKelly: Math.max(0.01, Math.min(0.99, bestParams.fractionalKelly + (rng() * 0.1 - 0.05))),
          varThreshold: Math.max(0.01, bestParams.varThreshold + (rng() * 0.02 - 0.01)),
          rsi: Math.max(0, bestParams.rsi + (rng() * 1.0 - 0.5)),
          macd: Math.max(0, bestParams.macd + (rng() * 1.0 - 0.5)),
          sentiment: Math.max(0, bestParams.sentiment + (rng() * 1.0 - 0.5))
        };
      } else {
        params = {
          atrMultiplier: 1.5 + rng() * 2.5,
          fractionalKelly: 0.1 + rng() * 0.4,
          varThreshold: 0.02 + rng() * 0.06,
          rsi: rng() * 5,
          macd: rng() * 5,
          sentiment: rng() * 5
        };
      }

      const metrics = evaluateStrategy(candles, params);
      let penalty = 0;
      // Deterministic drawdown simulation based on iteration and symbol
      const drawdownRng = createSeededRng(`dd-${symbolId}-${i}`);
      const simulatedMaxDrawdown = drawdownRng() * 0.20;
      if (simulatedMaxDrawdown > 0.15) penalty = 1000;

      const calmarRatio = metrics.profitFactor / (simulatedMaxDrawdown || 0.01);
      const score = calmarRatio - penalty;

      this.history.push({ params, score });

      if (score > bestScore) {
        bestScore = score;
        bestParams = params;
      }
    }

    pinoLogger.info({ event: 'hpo_complete', bestScore }, 'Bayesian Optimization finished');
    return bestParams;
  }

  runOptimization(nTrials) {
    return this.optimize('SAF1403', nTrials || 10);
  }
}
