import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// Configuration optimal for Production (sampling, info level) and Debug (full trace, serialization)
export const pinoLogger = pino({
  level: isProduction ? 'info' : 'trace',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    // Add full serialization for debug trace
    ...(isProduction ? {} : { full: (obj) => JSON.stringify(obj, null, 2) })
  },
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
    if (Math.random() <= 0.1) {
      pinoLogger[level](obj, msg);
    }
  } else {
    pinoLogger[level](obj, msg);
  }
};
