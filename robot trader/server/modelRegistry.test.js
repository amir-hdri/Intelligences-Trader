import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRegistry } from './modules/modelRegistry.js';

describe('ModelRegistry measured metrics', () => {
  test('reports unknown evaluation metrics as null instead of fabricating values', () => {
    const registry = new ModelRegistry({ getVersion: () => 'test-v1', session: {} });
    const metrics = registry.getMetrics();
    assert.equal(metrics.modelReady, true);
    assert.equal(metrics.accuracy, null);
    assert.equal(metrics.precision, null);
    assert.equal(metrics.lastEvaluation, null);
    assert.equal(metrics.inferenceSamples, 0);
    assert.equal(metrics.inferenceLatency, 0);
  });

  test('reports only recorded inference and evaluation measurements', () => {
    const registry = new ModelRegistry({ getVersion: () => 'test-v1', session: {} });
    registry.recordInference(10);
    registry.recordInference(20);
    registry.recordEvaluation({ accuracy: 0.6, precision: 0.7, recall: 0.5, f1Score: 0.58, driftScore: 0.25, timestamp: 123 });
    const metrics = registry.getMetrics();
    assert.equal(metrics.inferenceLatency, 15);
    assert.equal(metrics.inferenceSamples, 2);
    assert.equal(metrics.accuracy, 0.6);
    assert.equal(metrics.precision, 0.7);
    assert.equal(metrics.lastEvaluation, 123);
    assert.equal(metrics.retrainRecommended, true);
  });

  test('rejects invalid measurements', () => {
    const registry = new ModelRegistry(null);
    assert.throws(() => registry.recordInference(-1), /latencyMs/);
    assert.throws(() => registry.recordEvaluation({ accuracy: 2 }), /accuracy/);
  });
});
