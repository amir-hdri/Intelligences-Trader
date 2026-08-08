import fs from 'fs';
import path from 'path';

class AuditLogger {
  constructor() {
    this.logFile = path.join(process.cwd(), 'audit.log');
  }

  log(action, ip, userId = 'anonymous', details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      ip,
      userId,
      details
    };

    // In production, this should write to a secure logging service or DB
    // For now, we append to a local file
    fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n', { mode: 0o600 }, (err) => {
      if (err) console.error('Failed to write audit log:', err);
    });
  }
}

export const auditLogger = new AuditLogger();
