import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelManager } from './modelManager.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(directory, 'models', 'market_model.onnx');
const artifactSha256 = '3a4f512cade7c39b73d54325650fca29bfb6cd28ea36f2f19ac9eb985391c006';

async function loadManager() {
  const manager = new ModelManager();
  assert.strictEqual(await manager.loadModel(modelPath, 'contract'), true);
  return manager;
}

describe('Node serving model artifact contract', () => {
  test('the shipped artifact is the pinned serving model', async () => {
    const digest = createHash('sha256').update(await readFile(modelPath)).digest('hex');
    assert.strictEqual(digest, artifactSha256);
  });

  test('the artifact declares one input and one output', async () => {
    const manager = await loadManager();
    assert.deepStrictEqual(manager.session.inputNames, ['input']);
    assert.deepStrictEqual(manager.session.outputNames, ['output']);
  });

  test('the serving layer consumes 30 steps of 10 features and returns 3 class probabilities', async () => {
    const manager = await loadManager();
    const input = [Array.from({ length: 30 }, () => Array(10).fill(0))];
    const predictions = await manager.predict(input, 'contract');
    assert.strictEqual(predictions.length, 1);
    assert.strictEqual(predictions[0].probabilities.length, 3);
  });

  test('the serving layer rejects the 5-feature schema of the Python research artifact', async () => {
    const manager = await loadManager();
    const fiveFeatureInput = [Array.from({ length: 30 }, () => Array(5).fill(0))];
    await assert.rejects(manager.predict(fiveFeatureInput, 'contract'), /10 finite features/);
  });
});
