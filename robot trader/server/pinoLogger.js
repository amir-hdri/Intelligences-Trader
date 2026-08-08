import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  formatters: {
    level: label => ({ level: label }),
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export const sampleLogger = (level, message, fields = {}, sampleRate = 0.1) => {
  // Deterministic sampling: log every Nth request based on time, not Math.random
  const shouldLog = !isProduction || (Date.now() % Math.floor(1 / Math.max(0.01, sampleRate)) === 0);
  if (shouldLog) pinoLogger[level](fields, message);
};
