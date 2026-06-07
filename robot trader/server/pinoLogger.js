import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// Configuration optimal for Production (sampling, info level) and Debug (full trace, serialization)
export const pinoLogger = pino({
  level: isProduction ? 'info' : 'trace',
  // In production, we could implement sampling via a custom transport or external collector.
  // Here we use base Pino features.
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // In debug mode, pretty print is useful, but we stick to JSON for structure.
  ...(isProduction ? {} : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  })
});

// Simple 10% sampling wrapper for production high-volume logs
export const sampleLogger = (level, msg, obj = {}) => {
  if (isProduction) {
    if (Math.random() < 0.1) {
      pinoLogger[level](obj, msg);
    }
  } else {
    pinoLogger[level](obj, msg);
  }
};
