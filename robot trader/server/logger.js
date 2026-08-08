import winston from 'winston';

const transports = [new winston.transports.Console()];
if (process.env.LOG_TO_FILES === 'true') {
  transports.push(
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ml-backend-server' },
  transports,
});

export default logger;
