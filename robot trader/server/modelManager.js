import { pinoLogger } from './pinoLogger.js';
import * as ort from 'onnxruntime-web';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export class ModelManager {
  constructor({ sequenceLength = 30, featureCount = 10, driftThreshold = 0.65 } = {}) {
    this.session = null;
    this.modelPath = null;
    this.sequenceLength = sequenceLength;
    this.featureCount = featureCount;
    this.driftScore = 0;
    this.driftThreshold = driftThreshold;
    this.newSampleCount = 0;
    this.modelVersions = [];
    this.currentVersion = null;
    this.isRetraining = false;
  }

  async loadModel(modelPath, version = '1.0.0') {
    try {
      const modelBytes = await readFile(modelPath);
      const externalDataPath = `${modelPath}.data`;
      let externalData;
      try {
        const externalBytes = await readFile(externalDataPath);
        externalData = [{ path: path.basename(externalDataPath), data: new Uint8Array(externalBytes) }];
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const session = await ort.InferenceSession.create(
        new Uint8Array(modelBytes),
        externalData ? { externalData } : undefined,
      );
      if (session.inputNames.length !== 1 || session.outputNames.length < 1) {
        throw new Error('Expected a model with one input and at least one output');
      }
      this.modelPath = modelPath;
      this.session = session;
      this.currentVersion = version;
      if (!this.modelVersions.includes(version)) this.modelVersions.push(version);
      pinoLogger.info({ modelPath, version }, 'ONNX model loaded');
      return true;
    } catch (error) {
      this.session = null;
      pinoLogger.error({ modelPath, error: error instanceof Error ? error.message : String(error) }, 'Failed to load ONNX model');
      return false;
    }
  }

  validateInput(inputData) {
    if (!Array.isArray(inputData) || inputData.length === 0) {
      throw new TypeError('inputData must be a non-empty batch array');
    }
    for (const sequence of inputData) {
      if (!Array.isArray(sequence) || sequence.length !== this.sequenceLength) {
        throw new TypeError(`Each input sequence must contain ${this.sequenceLength} time steps`);
      }
      for (const row of sequence) {
        if (!Array.isArray(row) || row.length !== this.featureCount || row.some(value => !Number.isFinite(value))) {
          throw new TypeError(`Each time step must contain ${this.featureCount} finite features`);
        }
      }
    }
  }

  async predict(inputData, correlationId = 'unknown') {
    if (!this.session) throw new Error('Model is not loaded');
    this.validateInput(inputData);

    const batchSize = inputData.length;
    const flatData = inputData.flat(2);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(flatData),
      [batchSize, this.sequenceLength, this.featureCount],
    );
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];

    pinoLogger.trace({ correlationId, event: 'onnx_session_run_start' }, 'Running ONNX session');
    const results = await this.session.run(
      { [inputName]: tensor },
      { logId: correlationId, logSeverityLevel: 3 },
    );
    pinoLogger.trace({ correlationId, event: 'onnx_session_run_end' }, 'ONNX session complete');

    const output = results[outputName];
    if (!output?.data || output.data.length !== batchSize * 3) {
      throw new Error(`Unexpected model output shape: ${output?.dims?.join('x') || 'missing'}`);
    }

    // Training labels are 0=DOWN, 1=HOLD, 2=UP.
    const labels = ['SELL', 'HOLD', 'BUY'];
    const predictions = [];
    for (let batch = 0; batch < batchSize; batch++) {
      const rawOutput = Array.from(output.data.slice(batch * 3, batch * 3 + 3), Number);
      if (rawOutput.some(value => !Number.isFinite(value))) throw new Error('Model returned non-finite values');

      const rawSum = rawOutput.reduce((sum, value) => sum + value, 0);
      const alreadyProbabilities = rawOutput.every(value => value >= 0 && value <= 1) && Math.abs(rawSum - 1) < 1e-4;
      const probabilities = alreadyProbabilities
        ? rawOutput
        : (() => {
            const maximum = Math.max(...rawOutput);
            const exponentials = rawOutput.map(value => Math.exp(value - maximum));
            const sum = exponentials.reduce((total, value) => total + value, 0);
            return exponentials.map(value => value / sum);
          })();
      const predictedClass = probabilities.indexOf(Math.max(...probabilities));
      predictions.push({ prediction: labels[predictedClass], probabilities, rawOutput });
    }
    return predictions;
  }

  monitorDrift(_inputData, predictions) {
    if (!Array.isArray(predictions) || predictions.length === 0) {
      return { score: this.driftScore, detected: false, sampleCount: this.newSampleCount };
    }
    this.newSampleCount += predictions.length;
    const normalizedEntropy = predictions.reduce((total, prediction) => {
      const entropy = prediction.probabilities.reduce(
        (sum, probability) => sum - (probability > 0 ? probability * Math.log(probability) : 0),
        0,
      );
      return total + entropy / Math.log(prediction.probabilities.length);
    }, 0) / predictions.length;

    const alpha = 0.1;
    this.driftScore = alpha * normalizedEntropy + (1 - alpha) * this.driftScore;
    return {
      score: this.driftScore,
      detected: this.newSampleCount >= 30 && this.driftScore > this.driftThreshold,
      sampleCount: this.newSampleCount,
    };
  }

  async hotReload(newModelPath, newVersion) {
    try {
      const modelBytes = await readFile(newModelPath);
      const externalDataPath = `${newModelPath}.data`;
      let externalData;
      try {
        const externalBytes = await readFile(externalDataPath);
        externalData = [{ path: path.basename(externalDataPath), data: new Uint8Array(externalBytes) }];
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const newSession = await ort.InferenceSession.create(
        new Uint8Array(modelBytes),
        externalData ? { externalData } : undefined,
      );
      this.session = newSession;
      this.modelPath = newModelPath;
      this.currentVersion = newVersion;
      if (!this.modelVersions.includes(newVersion)) this.modelVersions.push(newVersion);
      pinoLogger.info({ newModelPath, newVersion }, 'ONNX model hot reload succeeded');
      return true;
    } catch (error) {
      pinoLogger.error({ error: error instanceof Error ? error.message : String(error) }, 'ONNX model hot reload failed');
      return false;
    }
  }

  getVersion() {
    return this.currentVersion;
  }
}
