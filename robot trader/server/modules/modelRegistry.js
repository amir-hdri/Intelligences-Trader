/**
 * Runtime model registry metrics.
 *
 * Evaluation metrics remain null until an actual validation result is recorded;
 * the registry never substitutes fabricated accuracy, precision, or drift.
 */
export class ModelRegistry {
  constructor(modelManager) {
    this.modelManager = modelManager;
    this.inferenceHistory = [];
    this.evaluationHistory = [];
  }

  recordInference(latencyMs) {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new TypeError('latencyMs must be non-negative and finite');
    this.inferenceHistory.push({ timestamp: Date.now(), latencyMs });
    if (this.inferenceHistory.length > 100) this.inferenceHistory.shift();
  }

  recordEvaluation(metrics) {
    if (!metrics || typeof metrics !== 'object') throw new TypeError('evaluation metrics are required');
    const normalized = {};
    for (const field of ['accuracy', 'precision', 'recall', 'f1Score', 'driftScore']) {
      const value = metrics[field];
      if (value == null) {
        normalized[field] = null;
      } else if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError(`${field} must be null or a finite value in [0, 1]`);
      } else {
        normalized[field] = value;
      }
    }
    normalized.timestamp = Number.isFinite(metrics.timestamp) ? metrics.timestamp : Date.now();
    this.evaluationHistory.push(normalized);
    if (this.evaluationHistory.length > 50) this.evaluationHistory.shift();
    return { ...normalized };
  }

  getMetrics() {
    const modelVersion = this.modelManager?.getVersion?.() || process.env.MODEL_VERSION || 'unversioned';
    const isReady = Boolean(this.modelManager?.session);
    const avgLatency = this.inferenceHistory.length
      ? this.inferenceHistory.reduce((sum, row) => sum + row.latencyMs, 0) / this.inferenceHistory.length
      : null;
    const evaluation = this.evaluationHistory.at(-1) || null;

    return {
      version: modelVersion,
      modelVersion,
      inferenceLatency: avgLatency == null ? 0 : Number(avgLatency.toFixed(3)),
      inferenceSamples: this.inferenceHistory.length,
      modelReady: isReady,
      accuracy: evaluation?.accuracy ?? null,
      precision: evaluation?.precision ?? null,
      recall: evaluation?.recall ?? null,
      f1Score: evaluation?.f1Score ?? null,
      modelType: 'TCN-PPO-ONNX-RESEARCH',
      lastEvaluation: evaluation?.timestamp ?? null,
      driftScore: evaluation?.driftScore ?? null,
      retrainRecommended: evaluation?.driftScore != null ? evaluation.driftScore > 0.2 : null,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }

  setAccuracy(accuracy) {
    const previous = this.evaluationHistory.at(-1) || {};
    return this.recordEvaluation({ ...previous, accuracy, timestamp: Date.now() });
  }
}

export let modelRegistry = null;
export function initModelRegistry(modelManager) {
  modelRegistry = new ModelRegistry(modelManager);
  return modelRegistry;
}
