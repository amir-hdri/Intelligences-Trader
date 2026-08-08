import { describe, test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelManager } from './modelManager.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(directory, 'models', 'market_model.onnx');

describe('ModelManager', () => {
  test('loads external ONNX data and predicts with the declared schema', async () => {
    const manager = new ModelManager();
    assert.strictEqual(await manager.loadModel(modelPath, 'test'), true);
    const input = [[[...Array(10)].map(() => 0)]];
    // Expand one row to the declared 30-step sequence.
    input[0] = Array.from({ length: 30 }, () => Array(10).fill(0));
    const predictions = await manager.predict(input, 'test-correlation');
    assert.strictEqual(predictions.length, 1);
    assert.ok(['BUY', 'HOLD', 'SELL'].includes(predictions[0].prediction));
    assert.ok(Math.abs(predictions[0].probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
  });

  test('rejects malformed model input before inference', async () => {
    const manager = new ModelManager();
    assert.strictEqual(await manager.loadModel(modelPath, 'test'), true);
    await assert.rejects(manager.predict([[[0]]]), /30 time steps/);
  });
});
