import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EnsembleEngine } from '../ensembleEngine.js';

describe('EnsembleEngine', () => {
  let originalRandom;

  beforeEach(() => {
    originalRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  test('EnsembleEngine initialization', () => {
    const engine = new EnsembleEngine();
    assert.strictEqual(typeof engine.models, 'object');
    assert.ok('tcn' in engine.models);
    assert.ok('lstm' in engine.models);
    assert.ok('xgboost' in engine.models);
    assert.ok('randomForest' in engine.models);
    assert.ok('linear' in engine.models);
  });

  test('generateBasePredictions returns expected format and bounds', () => {
    const engine = new EnsembleEngine();
    const preds = engine.generateBasePredictions([1, 2, 3]);

    assert.ok('tcn' in preds);
    assert.ok('lstm' in preds);
    assert.ok('xgboost' in preds);
    assert.ok('randomForest' in preds);
    assert.ok('linear' in preds);

    assert.ok(preds.tcn >= -1 && preds.tcn <= 1);
    assert.ok(preds.lstm >= -1 && preds.lstm <= 1);
    assert.ok(preds.xgboost >= -1 && preds.xgboost <= 1);
    assert.ok(preds.randomForest >= -1 && preds.randomForest <= 1);
    assert.ok(preds.linear >= -1 && preds.linear <= 1);

    // Verify array lengths
    assert.strictEqual(engine.models.tcn.predictions.length, 1);
    assert.strictEqual(engine.models.lstm.predictions.length, 1);
    assert.strictEqual(engine.models.xgboost.predictions.length, 1);
    assert.strictEqual(engine.models.randomForest.predictions.length, 1);
    assert.strictEqual(engine.models.linear.predictions.length, 1);
  });

  test('generateBasePredictions calculates correct values with Math.random = 0.5', () => {
    const engine = new EnsembleEngine();
    Math.random = () => 0.5;

    const preds = engine.generateBasePredictions([1, 2, 3]);

    // baseVal = 0.5 * 2 - 1 = 0
    // Each prediction adds random offset which should be 0 because Math.random is 0.5
    // random() * 0.2 - 0.1 = 0
    // random() * 0.3 - 0.15 = 0
    // random() * 0.4 - 0.2 = 0
    // random() * 0.5 - 0.25 = 0
    // random() * 0.6 - 0.3 = 0
    assert.strictEqual(preds.tcn, 0);
    assert.strictEqual(preds.lstm, 0);
    assert.strictEqual(preds.xgboost, 0);
    assert.strictEqual(preds.randomForest, 0);
    assert.strictEqual(preds.linear, 0);
  });

  test('generateBasePredictions calculates correct values with Math.random = 1', () => {
    const engine = new EnsembleEngine();
    Math.random = () => 1;

    const preds = engine.generateBasePredictions([1, 2, 3]);

    // baseVal = 1 * 2 - 1 = 1
    // tcn: min(1, 1 + (0.2 - 0.1)) = min(1, 1.1) = 1
    // lstm: min(1, 1 + (0.3 - 0.15)) = min(1, 1.15) = 1
    // xgboost: min(1, 1 * 0.8 + (0.4 - 0.2)) = min(1, 0.8 + 0.2) = 1
    // randomForest: min(1, 1 * 0.9 + (0.5 - 0.25)) = min(1, 0.9 + 0.25) = 1
    // linear: min(1, 1 * 0.5 + (0.6 - 0.3)) = min(1, 0.5 + 0.3) = 0.8
    assert.strictEqual(preds.tcn, 1);
    assert.strictEqual(preds.lstm, 1);
    assert.strictEqual(preds.xgboost, 1);
    assert.strictEqual(preds.randomForest, 1);
    assert.strictEqual(preds.linear, 0.8); // 1 * 0.5 + (0.6 - 0.3) = 0.5 + 0.3 = 0.8
  });

  test('generateBasePredictions calculates correct values with Math.random = 0', () => {
    const engine = new EnsembleEngine();
    Math.random = () => 0;

    const preds = engine.generateBasePredictions([1, 2, 3]);

    // baseVal = 0 * 2 - 1 = -1
    // tcn: max(-1, -1 + (-0.1)) = max(-1, -1.1) = -1
    // lstm: max(-1, -1 + (-0.15)) = max(-1, -1.15) = -1
    // xgboost: max(-1, -1 * 0.8 + (-0.2)) = max(-1, -0.8 - 0.2) = -1
    // randomForest: max(-1, -1 * 0.9 + (-0.25)) = max(-1, -0.9 - 0.25) = -1
    // linear: max(-1, -1 * 0.5 + (-0.3)) = max(-1, -0.5 - 0.3) = -0.8
    assert.strictEqual(preds.tcn, -1);
    assert.strictEqual(preds.lstm, -1);
    assert.strictEqual(preds.xgboost, -1);
    assert.strictEqual(preds.randomForest, -1);
    assert.strictEqual(preds.linear, -0.8); // -1 * 0.5 - 0.3 = -0.5 - 0.3 = -0.8
  });

  test('generateBasePredictions keeps history bounded', () => {
    const engine = new EnsembleEngine();
    for (let i = 0; i < 150; i++) {
      engine.generateBasePredictions([1, 2, 3]);
    }

    // History should be bounded to 100
    assert.strictEqual(engine.models.tcn.predictions.length, 100);
    assert.strictEqual(engine.models.lstm.predictions.length, 100);
    assert.strictEqual(engine.models.xgboost.predictions.length, 100);
    assert.strictEqual(engine.models.randomForest.predictions.length, 100);
    assert.strictEqual(engine.models.linear.predictions.length, 100);
  });

  test('predictEnsemble returns valid prediction structure', () => {
    const engine = new EnsembleEngine();
    const result = engine.predictEnsemble([1, 2, 3]);

    assert.ok(['BUY', 'SELL', 'HOLD'].includes(result.prediction));
    assert.ok(typeof result.confidence === 'number');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(typeof result.ensemblePerformance === 'number');
    assert.ok(typeof result.modelWeights === 'object');
    assert.strictEqual(result.stabilityStatus, 'STABLE');
  });

  test('updateWeights properly adjusts weights based on actual outcome', () => {
    const engine = new EnsembleEngine();
    // Pre-populate with some predictions to set up weight update
    engine.generateBasePredictions([1, 2, 3]);

    // Force some distinct predictions to verify weight changes
    engine.models.tcn.predictions[0] = 0.9;  // TCN predicted BUY strongly
    engine.models.lstm.predictions[0] = -0.9; // LSTM predicted SELL strongly

    // Actual outcome was BUY (1)
    engine.updateWeights(1);

    const tcnError = Math.abs(1 - 0.9); // 0.1
    const lstmError = Math.abs(1 - (-0.9)); // 1.9

    assert.ok(tcnError < lstmError);
    assert.ok(engine.models.tcn.weight > engine.models.lstm.weight, 'Model with smaller error should have larger weight');

    // Check normalization
    let sum = 0;
    for (const key in engine.models) {
      sum += engine.models[key].weight;
    }
    // Float comparison
    assert.ok(Math.abs(sum - 1.0) < 0.0001, `Weights sum to ${sum}, expected 1.0`);
  });
});
