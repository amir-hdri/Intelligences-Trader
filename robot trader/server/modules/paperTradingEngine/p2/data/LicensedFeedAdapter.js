/**
 * Licensed Feed Adapter — foundation for licensed market-data ingestion.
 *
 * Implements the Phase-1 roadmap contract for any licensed vendor feed:
 *   - source timestamps carried separately from local receive time,
 *   - monotonic sequence numbers with gap/duplicate/out-of-order detection,
 *   - stale-data alarms against a configurable staleness budget,
 *   - per-record quality validation and an aggregated quality report.
 *
 * The adapter is vendor-neutral: plug the vendor SDK's message into
 * `ingest()` after mapping it to the canonical record shape:
 *
 *   { symbol, sequence, sourceTimestamp, payload }
 *
 * Records are validated before acceptance; nothing malformed ever reaches the
 * trading surface, and every rejection reason is counted for observability.
 */

const MAX_SYMBOL_LENGTH = 64;

export class LicensedFeedAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.name            Vendor identifier used in alarms.
   * @param {number} [opts.stalenessMs]   Max tolerated age of source timestamps.
   * @param {(alarm: object) => void} [opts.onAlarm] Callback for alarms.
   */
  constructor({ name = 'licensed-feed', stalenessMs = 5_000, onAlarm } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new TypeError('name must be a non-empty string');
    if (!Number.isFinite(stalenessMs) || stalenessMs <= 0) throw new TypeError('stalenessMs must be positive');
    this.name = name;
    this.stalenessMs = stalenessMs;
    this.onAlarm = typeof onAlarm === 'function' ? onAlarm : null;

    this.latest = null;
    this.lastSequence = null;
    this.gapCount = 0;
    this.missingRecords = 0;
    this.rejected = { total: 0, byReason: {} };
    this.accepted = 0;
    this.duplicates = 0;
    this.alarms = [];
  }

  _raise(kind, details) {
    const alarm = { adapter: this.name, kind, at: Date.now(), ...details };
    this.alarms.push(alarm);
    if (this.alarms.length > 100) this.alarms.shift(); // bounded history
    if (this.onAlarm) {
      try { this.onAlarm(alarm); } catch { /* listener faults must not break ingestion */ }
    }
    return alarm;
  }

  /**
   * Validate and ingest one canonical record.
   * @returns {{ accepted: boolean, reason?: string, stale?: boolean, gap?: boolean }}
   */
  ingest(record, { now = Date.now() } = {}) {
    const rejection = (reason) => {
      this.rejected.total += 1;
      this.rejected.byReason[reason] = (this.rejected.byReason[reason] || 0) + 1;
      return { accepted: false, reason };
    };

    if (!record || typeof record !== 'object') return rejection('malformed_record');
    const { symbol, sequence, sourceTimestamp, payload } = record;
    if (typeof symbol !== 'string' || !symbol.length || symbol.length > MAX_SYMBOL_LENGTH) {
      return rejection('invalid_symbol');
    }
    if (!Number.isInteger(sequence) || sequence <= 0) return rejection('invalid_sequence');
    if (!Number.isFinite(sourceTimestamp)) return rejection('invalid_source_timestamp');
    if (!payload || typeof payload !== 'object') return rejection('missing_payload');
    if (payload.price !== undefined && (!Number.isFinite(payload.price) || payload.price <= 0)) {
      return rejection('invalid_price');
    }

    // Sequence discipline.
    let gap = false;
    if (this.lastSequence !== null) {
      if (sequence === this.lastSequence) {
        this.duplicates += 1;
        return rejection('duplicate_sequence');
      }
      if (sequence < this.lastSequence) return rejection('out_of_order');
      if (sequence > this.lastSequence + 1) {
        gap = true;
        const missing = sequence - this.lastSequence - 1;
        this.gapCount += 1;
        this.missingRecords += missing;
        this._raise('sequence_gap', { from: this.lastSequence, to: sequence, missing });
      }
    }

    // Staleness budget against the SOURCE clock, never local processing time.
    const age = now - sourceTimestamp;
    const stale = age > this.stalenessMs;
    if (stale) this._raise('stale_data', { sourceTimestamp, ageMs: age });

    this.lastSequence = sequence;
    this.accepted += 1;
    this.latest = {
      symbol,
      sequence,
      sourceTimestamp,
      receivedAt: now,
      payload,
      flags: { stale, gap },
    };
    return { accepted: true, stale, gap };
  }

  /** Latest accepted record, or null before the first ingest. */
  getLatest() {
    return this.latest ? { ...this.latest, payload: { ...this.latest.payload } } : null;
  }

  /** Whether the feed is currently beyond the staleness budget. */
  isStale(now = Date.now()) {
    if (!this.latest) return true;
    return now - this.latest.sourceTimestamp > this.stalenessMs;
  }

  /** Aggregated counters for dashboards and health endpoints. */
  qualityReport(now = Date.now()) {
    return {
      adapter: this.name,
      accepted: this.accepted,
      duplicates: this.duplicates,
      rejected: { ...this.rejected },
      gapCount: this.gapCount,
      missingRecords: this.missingRecords,
      lastSequence: this.lastSequence,
      staleNow: this.isStale(now),
      lastSourceAgeMs: this.latest ? now - this.latest.sourceTimestamp : null,
      recentAlarms: this.alarms.slice(-10),
    };
  }
}
