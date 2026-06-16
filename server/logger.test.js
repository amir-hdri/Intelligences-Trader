import { describe, test, before, after, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

// Define dirname equivalent for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Logger Module', () => {
    let processOnTracker;
    let originalProcessOn;
    let logger;

    before(async () => {
        // Track the events registered on process.on
        originalProcessOn = process.on;
        processOnTracker = mock.fn();
        process.on = (...args) => {
            processOnTracker(...args);
            return originalProcessOn.apply(process, args);
        };

        // Import logger here to ensure it's loaded and files are created
        const loggerModule = await import('./logger.js');
        logger = loggerModule.default;
    });

    after(async () => {
        // Restore process.on
        process.on = originalProcessOn;

        // Winston file transports keep files open asynchronously. Close them before unlinking.
        logger.close();

        // Wait a tiny bit for streams to close before deleting using timers/promises
        await setTimeout(100);

        // Clean up log files created during the test by winston
        const filesToClean = ['error.log', 'combined.log'];
        filesToClean.forEach(file => {
            const paths = [
                path.join(process.cwd(), file),
                path.join(process.cwd(), 'server', file),
                path.join(__dirname, file)
            ];

            paths.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        // ignore
                    }
                }
            });
        });
    });

    test('should initialize logger with expected properties', async () => {
        assert.ok(logger, 'Logger should be exported');
        assert.strictEqual(logger.level, 'info', 'Logger level should be "info"');
        assert.ok(logger.format, 'Logger format should be defined');

        // Winston default meta should be set
        assert.deepStrictEqual(logger.defaultMeta, { service: 'tse-proxy-server' });

        // Transports should be set
        assert.ok(Array.isArray(logger.transports), 'logger.transports should be an array');
        assert.strictEqual(logger.transports.length, 3, 'Should have exactly 3 transports');
    });

    test('should have registered SIGTERM graceful shutdown for OpenTelemetry', async () => {
        // Find if SIGTERM was registered on process
        const sigtermCalls = processOnTracker.mock.calls.filter(call => call.arguments[0] === 'SIGTERM');
        assert.strictEqual(sigtermCalls.length > 0, true, 'Should have registered SIGTERM handler');
        assert.strictEqual(typeof sigtermCalls[0].arguments[1], 'function', 'SIGTERM handler should be a function');
    });
});
