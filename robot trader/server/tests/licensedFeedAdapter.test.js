import { describe, test } from 'node:test';
import assert from 'node:assert';
import { LicensedFeedAdapter } from '../modules/paperTradingEngine/p2/data/LicensedFeedAdapter.js';

const record = (over = {}) => ({
  symbol: 'BTC-USDT',
  sequence: 1,
  sourceTimestamp: 1_700_000_000_000,
  payload: { price: 42.5, size: 1 },
  ...over,
});

describe('LicensedFeedAdapter — happy path', () => {
  test('accepts well-formed records in order and exposes the latest', () => {
    const feed = new LicensedFeedAdapter({ name: 'test-vendor' });
    const base = record().sourceTimestamp;
    assert.deepStrictEqual(feed.ingest(record(), { now: base }), { accepted: true, stale: false, gap: false });
    feed.ingest(record({ sequence: 2 }), { now: base + 10 });
    const latest = feed.getLatest();
    assert.strictEqual(latest.sequence, 2);
    assert.strictEqual(latest.payload.price, 42.5);
    const report = feed.qualityReport(base + 20);
    assert.strictEqual(report.accepted, 2);
    assert.strictEqual(report.rejected.total, 0);
    assert.strictEqual(report.staleNow, false);
  });

  test('getLatest returns a defensive copy', () => {
    const feed = new LicensedFeedAdapter({});
    feed.ingest(record());
    const snapshot = feed.getLatest();
    snapshot.payload.price = 'tampered';
    assert.strictEqual(feed.getLatest().payload.price, 42.5);
  });
});

describe('LicensedFeedAdapter — sequence discipline', () => {
  test('duplicate and out-of-order records are rejected with reasons', () => {
    const feed = new LicensedFeedAdapter({});
    const t = record().sourceTimestamp;
    feed.ingest(record({ sequence: 5 }), { now: t });
    assert.strictEqual(feed.ingest(record({ sequence: 5 }), { now: t }).reason, 'duplicate_sequence');
    assert.strictEqual(feed.ingest(record({ sequence: 3 }), { now: t }).reason, 'out_of_order');
    assert.strictEqual(feed.lastSequence, 5);
  });

  test('sequence gaps are accepted but raise alarms and are counted', () => {
    const alarms = [];
    const feed = new LicensedFeedAdapter({ onAlarm: a => alarms.push(a) });
    const t = record().sourceTimestamp;
    feed.ingest(record({ sequence: 1 }), { now: t });
    const result = feed.ingest(record({ sequence: 6 }), { now: t });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.gap, true);
    const report = feed.qualityReport(t);
    assert.strictEqual(report.gapCount, 1);
    assert.strictEqual(report.missingRecords, 4);
    assert.ok(alarms.some(a => a.kind === 'sequence_gap' && a.missing === 4));
  });

  test('first record may carry any positive sequence without a gap alarm', () => {
    const alarms = [];
    const feed = new LicensedFeedAdapter({ onAlarm: a => alarms.push(a) });
    feed.ingest(record({ sequence: 900 }), { now: record().sourceTimestamp });
    assert.strictEqual(feed.gapCount, 0);
    assert.strictEqual(alarms.length, 0);
  });
});

describe('LicensedFeedAdapter — staleness budget', () => {
  test('records older than the budget are flagged stale and raise an alarm', () => {
    const alarms = [];
    const feed = new LicensedFeedAdapter({ stalenessMs: 1_000, onAlarm: a => alarms.push(a) });
    const src = 1_700_000_000_000;
    const result = feed.ingest(record({ sourceTimestamp: src }), { now: src + 5_001 });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.stale, true);
    assert.ok(alarms.some(a => a.kind === 'stale_data'));
  });

  test('isStale is true before any data and beyond the budget afterwards', () => {
    const feed = new LicensedFeedAdapter({ stalenessMs: 100 });
    assert.strictEqual(feed.isStale(1), true);
    const src = 1_700_000_000_000;
    feed.ingest(record({ sourceTimestamp: src }), { now: src });
    assert.strictEqual(feed.isStale(src + 99), false);
    assert.strictEqual(feed.isStale(src + 101), true);
  });

  test('faulty onAlarm listeners cannot break ingestion', () => {
    const feed = new LicensedFeedAdapter({ onAlarm: () => { throw new Error('listener bug'); } });
    const src = 1_700_000_000_000;
    const result = feed.ingest(record({ sourceTimestamp: src - 60_000 }), { now: src });
    assert.strictEqual(result.accepted, true);
  });
});

describe('LicensedFeedAdapter — malformed input rejection', () => {
  test('every malformed shape is rejected with a counted reason', () => {
    const feed = new LicensedFeedAdapter({});
    const cases = [
      [null, 'malformed_record'],
      ['nope', 'malformed_record'],
      [record({ symbol: '' }), 'invalid_symbol'],
      [record({ symbol: 'x'.repeat(65) }), 'invalid_symbol'],
      [record({ sequence: 0 }), 'invalid_sequence'],
      [record({ sequence: 1.5 }), 'invalid_sequence'],
      [record({ sequence: NaN }), 'invalid_sequence'],
      [record({ sourceTimestamp: 'yesterday' }), 'invalid_source_timestamp'],
      [record({ payload: null }), 'missing_payload'],
      [record({ payload: { price: NaN } }), 'invalid_price'],
      [record({ payload: { price: 0 } }), 'invalid_price'],
      [record({ payload: { price: -3 } }), 'invalid_price'],
    ];
    for (const [input, reason] of cases) {
      assert.strictEqual(feed.ingest(input).reason, reason);
    }
    const report = feed.qualityReport(0);
    assert.strictEqual(report.rejected.total, cases.length);
    assert.strictEqual(report.accepted, 0);
  });

  test('constructor validates its own configuration', () => {
    assert.throws(() => new LicensedFeedAdapter({ name: '' }), /name/);
    assert.throws(() => new LicensedFeedAdapter({ name: 'x', stalenessMs: -1 }), /stalenessMs/);
  });
});
