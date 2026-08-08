import { readFile } from 'node:fs/promises';
import { sha256 } from '../domain/canonical.js';
import {
  MODEL_FEATURE_SCHEMA,
  MODEL_FEATURE_SCHEMA_HASH,
  MODEL_NORMALIZER,
  MODEL_NORMALIZER_HASH,
} from '../domain/FeaturePipeline.js';

/** Pin the existing ModelManager behind the backtesting model port. */
export class OnnxModelAdapter {
  constructor(modelManager, metadata = {}) {
    this.modelManager = modelManager;
    this.metadataOverrides = metadata;
    this.pinnedMetadata = null;
    this.pinnedSession = null;
  }

  async metadata() {
    if (this.pinnedMetadata) return { ...this.pinnedMetadata };
    let artifactHash = this.metadataOverrides.artifactHash;
    if (!artifactHash && this.modelManager?.modelPath) {
      try {
        const modelBytes = await readFile(this.modelManager.modelPath);
        let externalBytes = Buffer.alloc(0);
        try { externalBytes = await readFile(`${this.modelManager.modelPath}.data`); } catch { /* single-file ONNX */ }
        artifactHash = sha256(Buffer.concat([modelBytes, externalBytes]));
      } catch {
        artifactHash = null;
      }
    }
    const metadata = {
      runtime: 'onnxruntime-web',
      modelVersion: this.modelManager?.getVersion?.() || null,
      artifactHash,
      featureSchemaVersion: MODEL_FEATURE_SCHEMA.version,
      featureSchemaHash: MODEL_FEATURE_SCHEMA_HASH,
      featureCount: MODEL_FEATURE_SCHEMA.featureCount,
      sequenceLength: MODEL_FEATURE_SCHEMA.sequenceLength,
      normalizer: MODEL_NORMALIZER,
      normalizerHash: MODEL_NORMALIZER_HASH,
      outputMapping: ['SELL', 'HOLD', 'BUY'],
      ...this.metadataOverrides,
    };
    // Do not permanently pin a transient pre-load state. Once both identity
    // fields exist, the adapter remains pinned for the lifetime of the service.
    if (metadata.modelVersion && metadata.artifactHash) {
      this.pinnedMetadata = metadata;
      this.pinnedSession = this.modelManager?.session || null;
    }
    return { ...metadata };
  }

  async assertCompatible({ modelVersion, featureSchemaHash, sequenceLength, featureCount }) {
    const metadata = await this.metadata();
    if (!this.modelManager?.session) throw new Error('ONNX model is not ready');
    if (!metadata.modelVersion || metadata.modelVersion !== modelVersion) {
      throw new Error(`Requested model ${modelVersion} is not the pinned model ${metadata.modelVersion || 'unknown'}`);
    }
    if (!metadata.artifactHash) throw new Error('ONNX artifact hash is unavailable');
    if (metadata.featureSchemaHash !== featureSchemaHash) throw new Error('Model and feature schema hashes do not match');
    if (metadata.sequenceLength !== sequenceLength || metadata.featureCount !== featureCount) {
      throw new Error('Model input shape is incompatible with the feature pipeline');
    }
    return metadata;
  }

  async predict(sequence, correlationId = 'backtest') {
    if (!Array.isArray(sequence)) throw new TypeError('Model sequence is required');
    if (this.pinnedSession && this.modelManager?.session !== this.pinnedSession) {
      throw new Error('Pinned ONNX session changed during backtest execution');
    }
    if (this.pinnedMetadata?.modelVersion !== this.modelManager?.getVersion?.()) {
      throw new Error('Pinned ONNX model version changed during backtest execution');
    }
    const predictions = await this.modelManager.predict([sequence], correlationId);
    const prediction = predictions[0];
    return {
      action: prediction.prediction,
      confidence: Math.max(...prediction.probabilities),
      probabilities: [...prediction.probabilities],
    };
  }
}
