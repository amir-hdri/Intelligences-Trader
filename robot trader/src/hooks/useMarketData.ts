import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  MarketCandle,
  ExpertForecast,
  ApiConfig,
  SystemMetrics,
  TimeFrame,
  OrderBook as OrderBookType,
  WalkForwardResult,
  CorrelationMetrics,
  SentimentData,
  BackendAnalysisResponse,
  MarketRegime,
  TradeAction,
} from '../types';
import { TseApiClient } from '../dataUtils';
import { WorkerPool } from '../workers/workerPool';
import { IME_SYMBOLS } from '../constants';

const workerCount = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
const marketAnalyzerPool = new WorkerPool(
  new URL('../workers/marketAnalyzer.worker.ts', import.meta.url),
  workerCount,
);

const TRADE_ACTIONS = new Set<TradeAction>(['BUY', 'SELL', 'HOLD']);
const MARKET_REGIMES = new Set<MarketRegime>(['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'HIGH_VOLATILITY']);

const isBackendAnalysis = (value: unknown): value is BackendAnalysisResponse => {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<BackendAnalysisResponse>;
  return (
    TRADE_ACTIONS.has(result.prediction as TradeAction) &&
    Number.isFinite(result.confidence) &&
    Boolean(result.risk) &&
    Number.isFinite(result.risk?.valueAtRisk95)
  );
};

export const useMarketData = (
  selectedSymbolId: string,
  apiConfig: ApiConfig,
  setMetrics: React.Dispatch<React.SetStateAction<SystemMetrics>>,
) => {
  const [mtfData, setMtfData] = useState<Record<TimeFrame, MarketCandle[]>>({ '1m': [], '15m': [], '1h': [], '1d': [] });
  const [orderBook, setOrderBook] = useState<OrderBookType | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationMetrics | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [forecast, setForecast] = useState<ExpertForecast | null>(null);
  const [walkForwardResults, setWalkForwardResults] = useState<WalkForwardResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);

  const orderBookRef = useRef<OrderBookType | null>(null);
  const requestSequenceRef = useRef(0);
  useEffect(() => {
    orderBookRef.current = orderBook;
  }, [orderBook]);

  const selectedSymbol = useMemo(
    () => IME_SYMBOLS.find(symbol => symbol.id === selectedSymbolId) || IME_SYMBOLS[0],
    [selectedSymbolId],
  );
  const apiClient = useMemo(() => new TseApiClient(apiConfig), [apiConfig]);

  const loadData = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    setIsLoading(true);
    setErrorState(null);

    try {
      const [data, corr, sent] = await Promise.all([
        apiClient.fetchMultiTimeframeData(selectedSymbol.id),
        apiClient.fetchMarketCorrelation(),
        apiClient.fetchSentiment(),
      ]);

      if (data['1d'].length === 0 || data['1h'].length === 0) {
        throw new Error('The market data service returned no usable candles');
      }

      const context = { orderBook: orderBookRef.current, correlation: corr, sentiment: sent };
      const [localAnalysis, advancedData, wfResults] = await Promise.all([
        marketAnalyzerPool.executeTask<ExpertForecast>('analyzeMarketMTF', {
          data,
          symbolId: selectedSymbol.id,
          context,
        }),
        apiClient.fetchAdvancedMetrics(data['1h']),
        marketAnalyzerPool.executeTask<WalkForwardResult[]>('performWalkForwardBacktest', { candles: data['1h'] }),
      ]);

      // Ignore slow responses from a symbol/configuration that is no longer selected.
      if (requestSequence !== requestSequenceRef.current) return;

      let analysis = localAnalysis;
      if (isBackendAnalysis(advancedData)) {
        const backendRegime = MARKET_REGIMES.has(advancedData.volatility as MarketRegime)
          ? advancedData.volatility as MarketRegime
          : localAnalysis.regime;
        analysis = {
          ...localAnalysis,
          action: advancedData.prediction,
          confidence: Math.max(0, Math.min(1, advancedData.confidence)),
          regime: backendRegime,
          reason: advancedData.reasoning || localAnalysis.reason,
          indicators: {
            ...localAnalysis.indicators,
            rsi: Number.isFinite(advancedData.indicators?.rsi)
              ? Number(advancedData.indicators?.rsi)
              : localAnalysis.indicators.rsi,
            atr: Number.isFinite(advancedData.indicators?.atr)
              ? Number(advancedData.indicators?.atr)
              : localAnalysis.indicators.atr,
          },
          backendRisk: advancedData.risk,
        };
      }

      setMtfData(data);
      setCorrelation(corr);
      setSentiment(sent);
      setForecast(analysis);
      setWalkForwardResults(wfResults);
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return;
      console.error('Failed to load market data', error);
      setErrorState(error instanceof Error ? error.message : 'Market data load failed');
    } finally {
      if (requestSequence === requestSequenceRef.current) setIsLoading(false);
    }
  }, [apiClient, selectedSymbol.id]);

  const trainModel = useCallback(async () => {
    setIsTraining(true);
    setTrainingProgress(5);
    try {
      const data = mtfData['1h'].length > 0
        ? mtfData['1h']
        : await apiClient.fetchMarketData(selectedSymbol.id);
      if (data.length < 50) throw new Error('At least 50 candles are required for training');

      setTrainingProgress(25);
      const accuracy = await marketAnalyzerPool.executeTask<number>('trainModelEpoch', {
        candles: data,
        symbolId: selectedSymbol.id,
      });
      if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) {
        throw new Error('Training service returned an invalid accuracy');
      }
      setTrainingProgress(100);
      setMetrics(previous => ({ ...previous, accuracy, winRate: accuracy }));
      return accuracy;
    } catch (error) {
      console.error('Training failed', error);
      throw error;
    } finally {
      setIsTraining(false);
    }
  }, [apiClient, mtfData, selectedSymbol.id, setMetrics]);

  return {
    mtfData,
    orderBook,
    setOrderBook,
    correlation,
    sentiment,
    forecast,
    walkForwardResults,
    isLoading,
    errorState,
    isTraining,
    trainingProgress,
    loadData,
    trainModel,
    selectedSymbol,
  };
};
