export { BacktestService } from './application/BacktestService.js';
export { BacktestEngine, BacktestCancelledError } from './application/BacktestEngine.js';
export { BacktestRepository } from './infrastructure/BacktestRepository.js';
export { DataCatalog } from './infrastructure/DataCatalog.js';
export { OnnxModelAdapter } from './infrastructure/OnnxModelAdapter.js';
export { createBacktestRouter } from './api/createBacktestRouter.js';
export { PortfolioLedger } from './domain/PortfolioLedger.js';
export { ExecutionSimulator } from './domain/ExecutionSimulator.js';
export { BacktestRiskEngine } from './domain/BacktestRiskEngine.js';
export { SimulationClock } from './domain/SimulationClock.js';
export {
  CausalFeaturePipeline,
  MODEL_FEATURE_SCHEMA,
  MODEL_FEATURE_SCHEMA_HASH,
  MODEL_NORMALIZER,
  MODEL_NORMALIZER_HASH,
} from './domain/FeaturePipeline.js';
export { calculatePerformanceMetrics, calculateDrawdown, calculateRegimeAttribution } from './domain/PerformanceMetrics.js';
export { validateRunConfig, validateCandle, BacktestValidationError } from './domain/validation.js';
export { ScenarioEngine } from './scenarios/ScenarioEngine.js';
