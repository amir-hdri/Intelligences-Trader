"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importStar(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const PredictionHistoryService_1 = require("./PredictionHistoryService");
(0, node_test_1.describe)('PredictionHistoryService', () => {
    let originalLocalStorage;
    let originalConsoleError;
    let consoleErrorCalls = [];
    (0, node_test_1.beforeEach)(() => {
        // Save original globals
        originalLocalStorage = global.localStorage;
        originalConsoleError = console.error;
        // Clear mock calls
        consoleErrorCalls = [];
        // Mock console.error
        console.error = (...args) => {
            consoleErrorCalls.push(args);
        };
    });
    (0, node_test_1.afterEach)(() => {
        // Restore original globals
        if (originalLocalStorage !== undefined) {
            global.localStorage = originalLocalStorage;
        }
        else {
            delete global.localStorage;
        }
        console.error = originalConsoleError;
    });
    (0, node_test_1.default)('loadHistory should handle localStorage getItem errors gracefully', () => {
        // Arrange: Mock localStorage.getItem to throw an error
        global.localStorage = {
            getItem: () => {
                throw new Error('Mocked getItem error');
            },
            setItem: () => { },
            removeItem: () => { },
            clear: () => { },
            length: 0,
            key: () => null
        };
        // Act
        const service = new PredictionHistoryService_1.PredictionHistoryService();
        // Assert
        node_assert_1.default.deepStrictEqual(service.getHistory(), []);
        node_assert_1.default.strictEqual(consoleErrorCalls.length, 1);
        node_assert_1.default.strictEqual(consoleErrorCalls[0][0], 'Failed to load prediction history');
        node_assert_1.default.strictEqual(consoleErrorCalls[0][1].message, 'Mocked getItem error');
    });
    (0, node_test_1.default)('saveHistory should handle localStorage setItem errors gracefully', () => {
        // Arrange: Mock localStorage for successful load but failing save
        let storedData = null;
        global.localStorage = {
            getItem: () => storedData,
            setItem: () => {
                throw new Error('Mocked setItem error');
            },
            removeItem: () => { },
            clear: () => { },
            length: 0,
            key: () => null
        };
        const service = new PredictionHistoryService_1.PredictionHistoryService();
        // Clear loadHistory console.error calls if any
        consoleErrorCalls = [];
        // Act
        service.clearHistory(); // this calls saveHistory internally
        // Assert
        node_assert_1.default.strictEqual(consoleErrorCalls.length, 1);
        node_assert_1.default.strictEqual(consoleErrorCalls[0][0], 'Failed to save prediction history');
        node_assert_1.default.strictEqual(consoleErrorCalls[0][1].message, 'Mocked setItem error');
    });
});
