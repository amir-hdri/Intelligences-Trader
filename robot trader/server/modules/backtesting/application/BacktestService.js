import crypto from 'node:crypto';
import { sha256, cloneJson } from '../domain/canonical.js';
import { validateRunConfig, BacktestValidationError } from '../domain/validation.js';
import { BacktestEngine, BacktestCancelledError } from './BacktestEngine.js';
import { MODEL_FEATURE_SCHEMA, MODEL_FEATURE_SCHEMA_HASH } from '../domain/FeaturePipeline.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED']);

export class BacktestService {
  constructor({ repository, dataCatalog, modelAdapter = null, maxConcurrent = 2, maxQueued = 100 } = {}) {
    if (!repository || !dataCatalog) throw new TypeError('BacktestService requires repository and dataCatalog');
    this.repository = repository;
    this.dataCatalog = dataCatalog;
    this.modelAdapter = modelAdapter;
    this.engine = new BacktestEngine({ modelAdapter });
    this.maxConcurrent = Number.isInteger(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 2;
    this.maxQueued = Number.isInteger(maxQueued) && maxQueued > 0 ? maxQueued : 100;
    this.queue = [];
    this.running = 0;
    this.records = new Map();
    this.tokens = new Map();
    this.completions = new Map();
  }

  async registerDataset(input) {
    return this.dataCatalog.registerSnapshot(input);
  }

  async health() {
    await this.repository.ready;
    return {
      status: 'OPERATIONAL',
      persistence: this.repository.dbEnabled ? 'POSTGRESQL' : 'MEMORY_FALLBACK',
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued,
      mlAdapterConfigured: Boolean(this.modelAdapter),
    };
  }

  async createRun(inputConfig) {
    if (this.queue.length >= this.maxQueued) throw new Error('Backtest queue is full');
    const metadata = await this.dataCatalog.metadata(inputConfig?.datasetSnapshotId);
    if (!metadata) throw new BacktestValidationError(`Dataset snapshot not found: ${inputConfig?.datasetSnapshotId || 'missing'}`);
    const config = validateRunConfig(inputConfig, metadata);

    if (config.strategy.type === 'ML') {
      if (!this.modelAdapter) throw new BacktestValidationError('ML backtests are unavailable because no model adapter is configured');
      await this.modelAdapter.assertCompatible({
        modelVersion: config.strategy.modelVersion,
        featureSchemaHash: MODEL_FEATURE_SCHEMA_HASH,
        sequenceLength: MODEL_FEATURE_SCHEMA.sequenceLength,
        featureCount: MODEL_FEATURE_SCHEMA.featureCount,
      });
    }

    const now = Date.now();
    const run = {
      id: `bt-${crypto.randomUUID()}`,
      schemaVersion: '1.0',
      status: 'QUEUED',
      progress: 0,
      config,
      configHash: sha256(config),
      dataset: metadata,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };
    this.records.set(run.id, run);
    const token = { cancelled: false };
    this.tokens.set(run.id, token);
    let resolveCompletion;
    const promise = new Promise(resolve => { resolveCompletion = resolve; });
    this.completions.set(run.id, { promise, resolve: resolveCompletion });
    await this.repository.saveRun(run);
    this.queue.push(run.id);
    queueMicrotask(() => this._drain());
    return cloneJson(run);
  }

  async _drain() {
    while (this.running < this.maxConcurrent && this.queue.length) {
      const runId = this.queue.shift();
      this.running += 1;
      this._execute(runId).finally(() => {
        this.running -= 1;
        queueMicrotask(() => this._drain());
      });
    }
  }

  async _execute(runId) {
    const run = this.records.get(runId) || await this.repository.getRun(runId);
    const token = this.tokens.get(runId) || { cancelled: false };
    if (!run) return;
    if (token.cancelled || await this.repository.isCancellationRequested(runId)) {
      token.cancelled = true;
      run.cancellationRequested = true;
      await this._finish(run, 'CANCELLED');
      return;
    }

    run.status = 'VALIDATING';
    run.startedAt = Date.now();
    token.deadline = run.startedAt + run.config.limits.maxRuntimeMs;
    run.updatedAt = run.startedAt;
    await this.repository.saveRun(run);
    let progressWrite = Promise.resolve();

    try {
      const loadedDataset = await this.dataCatalog.load(run.config);
      if (token.cancelled) throw new BacktestCancelledError();
      run.status = 'RUNNING';
      run.updatedAt = Date.now();
      await this.repository.saveRun(run);
      let lastPersistedProgress = 0;
      const result = await this.engine.run({
        runId,
        config: run.config,
        loadedDataset,
        cancellationToken: token,
        shouldCancel: () => this.repository.isCancellationRequested(runId),
        onProgress: progress => {
          run.progress = progress;
          run.updatedAt = Date.now();
          if (progress - lastPersistedProgress >= 0.05) {
            lastPersistedProgress = progress;
            const progressSnapshot = cloneJson(run);
            progressWrite = progressWrite
              .then(() => this.repository.saveRun(progressSnapshot))
              .catch(() => undefined);
          }
        },
      });
      await progressWrite;
      run.status = 'FINALIZING';
      run.progress = 0.99;
      run.updatedAt = Date.now();
      run.result = result;
      await this.repository.saveRun(run);
      await this._finish(run, 'COMPLETED');
    } catch (error) {
      await progressWrite;
      if (error instanceof BacktestCancelledError || token.cancelled) {
        run.cancellationRequested = true;
        await this._finish(run, 'CANCELLED');
      } else {
        run.error = {
          code: error instanceof BacktestValidationError ? 'VALIDATION_ERROR' : 'BACKTEST_FAILED',
          message: error.message,
          ...(error.details?.length ? { details: error.details } : {}),
        };
        await this._finish(run, error instanceof BacktestValidationError ? 'REJECTED' : 'FAILED');
      }
    }
  }

  async _finish(run, status) {
    run.status = status;
    run.progress = status === 'COMPLETED' ? 1 : run.progress;
    run.completedAt = Date.now();
    run.updatedAt = run.completedAt;
    await this.repository.saveRun(run);
    this.tokens.delete(run.id);
    const completion = this.completions.get(run.id);
    if (completion) completion.resolve(cloneJson(run));
    this.completions.delete(run.id);
    this.records.delete(run.id);
  }

  async getRun(runId) {
    const run = this.records.get(runId) || await this.repository.getRun(runId);
    return cloneJson(run);
  }

  async listRuns(options) {
    const persisted = await this.repository.listRuns(options);
    const byId = new Map(persisted.map(run => [run.id, run]));
    for (const run of this.records.values()) byId.set(run.id, cloneJson(run));
    return [...byId.values()]
      .filter(run => !options?.status || run.status === options.status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, Math.min(200, Number(options?.limit) || 50)));
  }

  async cancelRun(runId) {
    const run = this.records.get(runId) || await this.repository.getRun(runId);
    if (!run) return null;
    if (TERMINAL_STATUSES.has(run.status)) return cloneJson(run);
    await this.repository.requestCancellation(runId);
    run.cancellationRequested = true;
    const isLocal = this.records.has(runId);
    if (isLocal) {
      const token = this.tokens.get(runId) || { cancelled: false };
      token.cancelled = true;
      this.tokens.set(runId, token);
    }
    if (run.status === 'QUEUED') {
      if (isLocal) this.queue = this.queue.filter(id => id !== runId);
      await this._finish(run, 'CANCELLED');
    }
    return cloneJson(run);
  }

  async waitForRun(runId, timeoutMs = 30_000) {
    const existing = await this.getRun(runId);
    if (!existing) return null;
    if (TERMINAL_STATUSES.has(existing.status)) return existing;
    const completion = this.completions.get(runId);
    if (!completion) return existing;
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Timed out waiting for backtest')), timeoutMs);
      timeout.unref?.();
    });
    try {
      return await Promise.race([completion.promise, timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async artifact(runId, name) {
    const run = await this.getRun(runId);
    if (!run?.result) return null;
    const mapping = {
      equity: run.result.equityCurve,
      orders: run.result.orders,
      'order-events': run.result.orderEvents,
      fills: run.result.fills,
      trades: run.result.trades,
      signals: run.result.signals,
      quality: run.result.quality,
    };
    return Object.prototype.hasOwnProperty.call(mapping, name) ? mapping[name] : null;
  }

  async compare(runIds) {
    if (!Array.isArray(runIds) || runIds.length < 2 || runIds.length > 20) {
      throw new BacktestValidationError('runIds must contain between 2 and 20 ids');
    }
    const runs = await Promise.all(runIds.map(id => this.getRun(id)));
    if (runs.some(run => !run || run.status !== 'COMPLETED')) throw new BacktestValidationError('All compared runs must be completed');
    const datasetHashes = new Set(runs.map(run => run.result.provenance.datasetHash));
    if (datasetHashes.size !== 1) throw new BacktestValidationError('Compared runs must use the same dataset hash');
    return {
      datasetHash: runs[0].result.provenance.datasetHash,
      runs: runs.map(run => ({
        runId: run.id,
        configHash: run.configHash,
        scenario: run.result.scenario.type,
        strategy: run.config.strategy.name,
        resultHash: run.result.resultHash,
        metrics: run.result.metrics,
      })),
    };
  }

  async close() {
    await this.repository.close();
  }
}
