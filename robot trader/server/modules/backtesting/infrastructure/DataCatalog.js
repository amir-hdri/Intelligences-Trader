import { cloneJson, sha256 } from '../domain/canonical.js';
import { BacktestValidationError, timeframeMilliseconds, validateCandle } from '../domain/validation.js';

/** Adapter over the Phase-1 immutable data boundary. */
export class DataCatalog {
  constructor(repository) {
    if (!repository) throw new TypeError('DataCatalog requires a repository');
    this.repository = repository;
  }

  async registerSnapshot(input) {
    if (!input || typeof input !== 'object') throw new BacktestValidationError('Dataset snapshot must be an object');
    if (typeof input.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.id)) {
      throw new BacktestValidationError('Dataset id must use 1-128 safe characters');
    }
    if (!Array.isArray(input.candles) || input.candles.length < 2 || input.candles.length > 100_000) {
      throw new BacktestValidationError('candles must contain between 2 and 100,000 records');
    }
    const timeframe = input.timeframe || '1h';
    if (timeframeMilliseconds(timeframe) === null) throw new BacktestValidationError(`Unsupported timeframe: ${timeframe}`);
    const defaultInstrument = input.instrumentId || input.instruments?.[0];
    const candles = input.candles.map((candle, index) => validateCandle(candle, index, defaultInstrument));
    candles.sort((a, b) => a.availableAt - b.availableAt || a.eventTime - b.eventTime || a.sequence - b.sequence || a.instrumentId.localeCompare(b.instrumentId));

    const instruments = [...new Set(candles.map(candle => candle.instrumentId))].sort();
    const duplicateKeys = new Set();
    const seen = new Set();
    for (const candle of candles) {
      const key = `${candle.instrumentId}:${candle.eventTime}`;
      if (seen.has(key)) duplicateKeys.add(key);
      seen.add(key);
    }
    if (duplicateKeys.size) {
      throw new BacktestValidationError('Dataset contains duplicate instrument timestamps', [...duplicateKeys].slice(0, 20));
    }

    const content = {
      schemaVersion: input.schemaVersion || '1.0',
      timeframe,
      source: input.source || 'PHASE1_SNAPSHOT',
      synthetic: input.synthetic === true,
      instruments,
      hasOrderBook: candles.every(candle => candle.book?.bids?.length && candle.book?.asks?.length),
      candles,
      metadata: cloneJson(input.metadata || {}),
    };
    let startAt = Infinity;
    let endAt = -Infinity;
    for (const candle of candles) {
      startAt = Math.min(startAt, candle.eventTime);
      endAt = Math.max(endAt, candle.eventTime);
    }
    const dataset = {
      id: input.id,
      ...content,
      startAt,
      endAt,
      eventCount: candles.length,
      contentHash: sha256(content),
      createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
    };
    return this.repository.saveDataset(dataset);
  }

  async metadata(id) {
    const dataset = await this.repository.getDataset(id);
    if (!dataset) return null;
    const { candles: _candles, ...metadata } = dataset;
    return metadata;
  }

  async load(config) {
    const dataset = await this.repository.getDataset(config.datasetSnapshotId);
    if (!dataset) throw new BacktestValidationError(`Dataset snapshot not found: ${config.datasetSnapshotId}`);

    const { contentHash, id: _id, startAt: _startAt, endAt: _endAt, eventCount: _eventCount, createdAt: _createdAt, ...storedContent } = dataset;
    if (sha256(storedContent) !== contentHash) throw new Error(`Dataset snapshot integrity check failed: ${dataset.id}`);

    const quality = { errors: [], warnings: [], skipped: 0, gaps: 0, eventsRead: 0 };
    const events = [];
    const seen = new Set();
    for (let index = 0; index < dataset.candles.length; index += 1) {
      let event;
      try {
        event = validateCandle(dataset.candles[index], index);
      } catch (error) {
        if (config.qualityPolicy === 'WARN_AND_SKIP') {
          quality.warnings.push(error.message);
          quality.skipped += 1;
          continue;
        }
        quality.errors.push(error.message);
        throw new BacktestValidationError('Dataset quality validation failed', quality.errors);
      }
      if (!config.instruments.includes(event.instrumentId) || event.eventTime < config.startAt || event.eventTime > config.endAt) continue;
      const key = `${event.instrumentId}:${event.eventTime}`;
      if (seen.has(key)) {
        const message = `Duplicate event ${key}`;
        if (config.qualityPolicy === 'WARN_AND_SKIP') {
          quality.warnings.push(message);
          quality.skipped += 1;
          continue;
        }
        throw new BacktestValidationError('Dataset quality validation failed', [message]);
      }
      seen.add(key);
      events.push(event);
      if (events.length > config.limits.maxEvents) {
        throw new BacktestValidationError(`Dataset selection exceeds limits.maxEvents (${config.limits.maxEvents})`);
      }
    }

    events.sort((a, b) => a.availableAt - b.availableAt || a.eventTime - b.eventTime || a.sequence - b.sequence || a.instrumentId.localeCompare(b.instrumentId));
    if (events.length < 2) throw new BacktestValidationError('Dataset selection must contain at least two valid events');

    const expectedGap = timeframeMilliseconds(config.timeframe);
    if (expectedGap > 0) {
      const lastByInstrument = new Map();
      for (const event of events) {
        const previous = lastByInstrument.get(event.instrumentId);
        if (previous && event.eventTime - previous.eventTime > expectedGap * 1.5) {
          quality.gaps += 1;
          if (quality.warnings.length < 100) {
            quality.warnings.push(`Gap for ${event.instrumentId}: ${previous.eventTime} -> ${event.eventTime}`);
          }
        }
        lastByInstrument.set(event.instrumentId, event);
      }
    }
    quality.eventsRead = events.length;
    return {
      events,
      quality,
      provenance: {
        datasetSnapshotId: dataset.id,
        datasetHash: dataset.contentHash,
        datasetSchemaVersion: dataset.schemaVersion,
        source: dataset.source,
        synthetic: dataset.synthetic,
      },
    };
  }
}
