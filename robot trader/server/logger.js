import winston from 'winston';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ml-backend-server' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Initialize OpenTelemetry
const sdk = new NodeSDK({
  traceExporter: new winston.transports.Console(),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// Graceful shutdown for OpenTelemetry
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => logger.info('Tracing terminated'))
    .catch((error) => logger.error('Error terminating tracing', { error }))
    .finally(() => process.exit(0));
});

export default logger;
