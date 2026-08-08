import express from 'express';
import { BacktestValidationError } from '../domain/validation.js';

function summarizeRun(run) {
  if (!run) return run;
  return {
    ...run,
    result: run.result ? {
      resultHash: run.result.resultHash,
      configHash: run.result.configHash,
      provenance: run.result.provenance,
      scenario: run.result.scenario,
      metrics: run.result.metrics,
      quality: run.result.quality,
    } : null,
  };
}

function errorResponse(res, error) {
  if (error instanceof BacktestValidationError) {
    return res.status(400).json({ error: error.message, details: error.details || [] });
  }
  if (/immutable/.test(error.message)) return res.status(409).json({ error: error.message });
  if (/queue is full/.test(error.message)) return res.status(429).json({ error: error.message });
  if (/model|ONNX|artifact|feature schema/i.test(error.message)) return res.status(503).json({ error: error.message });
  return res.status(500).json({ error: 'Backtest operation failed' });
}

export function createBacktestRouter(service) {
  if (!service) throw new TypeError('Backtest router requires a service');
  const router = express.Router();

  router.get('/health', async (req, res) => {
    try {
      res.json({ success: true, data: await service.health() });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.post('/datasets', async (req, res) => {
    try {
      const dataset = await service.registerDataset(req.body);
      const { candles: _candles, ...metadata } = dataset;
      res.status(201).json({ success: true, data: metadata });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get('/datasets/:datasetId', async (req, res) => {
    try {
      const metadata = await service.dataCatalog.metadata(req.params.datasetId);
      if (!metadata) return res.status(404).json({ error: 'Dataset snapshot not found' });
      res.json({ success: true, data: metadata });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.post('/compare', async (req, res) => {
    try {
      const comparison = await service.compare(req.body?.runIds);
      res.json({ success: true, data: comparison });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get('/', async (req, res) => {
    try {
      const runs = await service.listRuns({ limit: req.query.limit, status: req.query.status });
      res.json({ success: true, data: runs.map(summarizeRun) });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const config = req.body?.config || req.body;
      const run = await service.createRun(config);
      if (req.query.wait === 'true') {
        const timeoutMs = Math.max(100, Math.min(60_000, Number(req.query.timeoutMs) || 30_000));
        try {
          const completed = await service.waitForRun(run.id, timeoutMs);
          const status = completed.status === 'COMPLETED' ? 200 : completed.status === 'REJECTED' ? 400 : completed.status === 'FAILED' ? 500 : 200;
          return res.status(status).json({ success: completed.status === 'COMPLETED', data: completed });
        } catch (error) {
          if (error.message === 'Timed out waiting for backtest') {
            const active = await service.getRun(run.id);
            return res.status(202).json({ success: true, data: summarizeRun(active), message: error.message });
          }
          throw error;
        }
      }
      return res.status(202).json({ success: true, data: run });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.get('/:runId/results', async (req, res) => {
    try {
      const run = await service.getRun(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Backtest run not found' });
      if (run.status !== 'COMPLETED') return res.status(409).json({ error: `Backtest is ${run.status}`, data: { status: run.status, progress: run.progress } });
      return res.json({ success: true, data: run.result });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.get('/:runId/artifacts/:name', async (req, res) => {
    try {
      const artifact = await service.artifact(req.params.runId, req.params.name);
      if (artifact == null) return res.status(404).json({ error: 'Backtest artifact not found' });
      return res.json({ success: true, data: artifact });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.post('/:runId/cancel', async (req, res) => {
    try {
      const run = await service.cancelRun(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Backtest run not found' });
      return res.json({ success: true, data: summarizeRun(run) });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.get('/:runId', async (req, res) => {
    try {
      const run = await service.getRun(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Backtest run not found' });
      return res.json({ success: true, data: summarizeRun(run) });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  return router;
}
