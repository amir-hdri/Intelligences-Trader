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
  if (!isProduction || Math.random() <= sampleRate) pinoLogger[level](fields, message);
};
