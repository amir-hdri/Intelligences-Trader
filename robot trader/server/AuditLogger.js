import fs from 'node:fs';
import path from 'node:path';
import { pinoLogger } from './pinoLogger.js';

export class AuditLogger {
  constructor({ logFile = process.env.AUDIT_LOG_FILE || null, sink = pinoLogger } = {}) {
    this.logFile = logFile ? path.resolve(logFile) : null;
    this.sink = sink;
  }

  log(action, ip, userId = 'anonymous', details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action: String(action).slice(0, 128),
      ip: String(ip || 'unknown').slice(0, 128),
      userId: String(userId || 'anonymous').slice(0, 128),
      details: details && typeof details === 'object' ? details : {},
    };

    // Structured stdout is the production default so container logs can be
    // shipped to an append-only remote sink. Local file output is opt-in.
    this.sink.info({ audit: entry }, 'Security audit event');
    if (this.logFile) {
      fs.appendFile(this.logFile, `${JSON.stringify(entry)}\n`, { mode: 0o600 }, error => {
        if (error) this.sink.error({ err: error, auditAction: entry.action }, 'Failed to write audit log');
      });
    }
    return entry;
  }
}

export const auditLogger = new AuditLogger();
