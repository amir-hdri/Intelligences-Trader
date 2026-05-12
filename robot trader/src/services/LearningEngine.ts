import { StoredPrediction } from './PredictionHistoryService';
import { StrategyWeights, DEFAULT_WEIGHTS } from '../dataUtils';

export class LearningEngine {

  /**
   * Analyzes the history of predictions to adjust strategy weights dynamically.
   * If a specific indicator strongly signaled a trade that resulted in a WIN, its weight is increased.
   * If it signaled a trade that resulted in a LOSS, its weight is decreased.
   */
  calculateAdaptiveWeights(history: StoredPrediction[]): StrategyWeights {
    // 1. Filter for completed trades only
    const completedTrades = history.filter(p => p.status === 'WIN' || p.status === 'LOSS');

    // If not enough data, return default weights
    if (completedTrades.length < 5) {
      return { ...DEFAULT_WEIGHTS };
    }

    // 2. Start with default weights
    const adaptiveWeights: StrategyWeights = { ...DEFAULT_WEIGHTS };

    // 3. Analyze last 50 trades (focus on recent market regime)
    const recentTrades = completedTrades.slice(0, 50);

    recentTrades.forEach(trade => {
      const isWin = trade.status === 'WIN';
      const multiplier = isWin ? 0.1 : -0.1; // 10% adjustment per trade

      // Analyze RSI Impact
      // If BUY and RSI < 35 (Oversold), RSI contributed to signal.
      // If SELL and RSI > 65 (Overbought), RSI contributed to signal.
      if ((trade.action === 'BUY' && trade.indicators.rsi < 35) ||
          (trade.action === 'SELL' && trade.indicators.rsi > 65)) {
        adaptiveWeights.rsi += multiplier;
      }

      // Analyze MACD Impact
      // If BUY and MACD Hist > 0 (Bullish), MACD contributed.
      // If SELL and MACD Hist < 0 (Bearish), MACD contributed.
      if ((trade.action === 'BUY' && trade.indicators.macdHistogram > 0) ||
          (trade.action === 'SELL' && trade.indicators.macdHistogram < 0)) {
        adaptiveWeights.macd += multiplier;
      }

      // Analyze Sentiment Impact
      // We don't store raw sentiment score in indicators object (my bad in previous step, but I have reason string)
      // I'll check the reason string for "NLP" keyword which indicates sentiment was a factor
      if (trade.reason.includes('NLP')) {
        adaptiveWeights.sentiment += multiplier;
      }

      // Analyze Order Book
      if (trade.reason.includes('Order Book')) {
        adaptiveWeights.orderBook += multiplier;
      }

       // Analyze Correlation
      if (trade.reason.includes('Fair Value') || trade.reason.includes('Bubble')) {
        adaptiveWeights.correlation += multiplier;
      }
    });

    // 4. Normalize/Clamp weights to reasonable bounds (0.5 to 5.0)
    (Object.keys(adaptiveWeights) as Array<keyof StrategyWeights>).forEach(key => {
      adaptiveWeights[key] = Math.max(0.5, Math.min(5.0, adaptiveWeights[key]));
    });

    return adaptiveWeights;
  }

  /**
   * Calculates a confidence modifier based on recent win rate.
   * If the system is on a losing streak, it lowers confidence to reduce risk.
   */
  calculateConfidenceModifier(history: StoredPrediction[]): number {
    const completedTrades = history.filter(p => p.status === 'WIN' || p.status === 'LOSS');
    if (completedTrades.length < 5) return 1.0;

    const recentTrades = completedTrades.slice(0, 10);
    const wins = recentTrades.filter(t => t.status === 'WIN').length;
    const winRate = wins / recentTrades.length;

    // If Win Rate is high (>60%), boost confidence slightly (up to 1.1x)
    if (winRate > 0.6) return 1.0 + (winRate - 0.6) * 0.5;

    // If Win Rate is low (<40%), reduce confidence significantly (down to 0.5x)
    if (winRate < 0.4) return Math.max(0.5, winRate / 0.4);

    return 1.0;
  }

  /**
   * Returns a summary of what the engine has learned.
   */
  getLearningSummary(weights: StrategyWeights): string[] {
    const changes: string[] = [];
    (Object.keys(weights) as Array<keyof StrategyWeights>).forEach(key => {
      const diff = weights[key] - DEFAULT_WEIGHTS[key];
      if (diff > 0.5) changes.push(`Increased trust in ${key.toUpperCase()} (+${diff.toFixed(1)})`);
      if (diff < -0.5) changes.push(`Decreased trust in ${key.toUpperCase()} (${diff.toFixed(1)})`);
    });
    return changes.length > 0 ? changes : ['System gathering more data...'];
  }
}

export const learningEngine = new LearningEngine();
