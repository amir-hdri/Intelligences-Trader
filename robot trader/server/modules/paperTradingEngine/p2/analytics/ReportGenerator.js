import { PerformanceAnalytics } from './PerformanceAnalytics.js';

/**
 * Daily / Weekly / Monthly Report Generator
 */
export class ReportGenerator {
  constructor(trades = []) {
    this.analytics = new PerformanceAnalytics(trades);
  }

  generateReport(period = 'daily') {
    const metrics = this.analytics.getMetrics();
    const now = new Date();

    return {
      period,
      generatedAt: now.toISOString(),
      metrics,
      summary: `P2 Paper Trading ${period} Report — Win Rate: ${(metrics.winRate * 100).toFixed(1)}% | Sharpe: ${metrics.sharpe.toFixed(2)}`,
      recommendations: this._generateRecommendations(metrics),
    };
  }

  _generateRecommendations(metrics) {
    const recs = [];
    if (metrics.sharpe < 0.8) recs.push('Consider tightening risk parameters');
    if (metrics.maxDrawdown > 0.15) recs.push('Reduce position size or add stop-loss rules');
    if (metrics.winRate < 0.55) recs.push('Review signal threshold or model retraining needed');
    return recs.length ? recs : ['Strategy performing within acceptable range'];
  }
}
