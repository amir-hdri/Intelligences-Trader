import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  MarketCandle, ExpertForecast, ApiConfig, SystemMetrics, SymbolInfo, TimeFrame, 
  OrderBook as OrderBookType, WalkForwardResult, CorrelationMetrics, SentimentData 
} from '../types';
import { TseApiClient, DEFAULT_WEIGHTS } from '../dataUtils';
import { WorkerPool } from '../workers/workerPool';
import { IME_SYMBOLS } from '../constants';

const marketAnalyzerPool = new WorkerPool(
  new URL('../workers/marketAnalyzer.worker.ts', import.meta.url),
  navigator.hardwareConcurrency || 4
);

export const useMarketData = (selectedSymbolId: string, apiConfig: ApiConfig, setMetrics: React.Dispatch<React.SetStateAction<SystemMetrics>>) => {
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

  const selectedSymbol = useMemo(() => IME_SYMBOLS.find(s => s.id === selectedSymbolId) || IME_SYMBOLS[0], [selectedSymbolId]);
  const apiClient = useMemo(() => new TseApiClient(apiConfig), [apiConfig]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorState(null);
    try {
      const [data, corr, sent] = await Promise.all([
          apiClient.fetchMultiTimeframeData(selectedSymbol.id),
          apiClient.fetchMarketCorrelation(),
          apiClient.fetchSentiment()
      ]);

      setMtfData(data);
      setCorrelation(corr);
      setSentiment(sent);

      const advancedData = await apiClient.fetchAdvancedMetrics(data['1h']);

      let analysis: ExpertForecast;
      if (advancedData) {
        analysis = {
            action: advancedData.prediction,
            confidence: advancedData.confidence,
            reason: advancedData.reasoning,
            regime: advancedData.volatility.regime,
            indicators: advancedData.indicators,
            sentimentScore: sent.score,
            basisOpportunity: 0,
            orderBookPressure: orderBook ? orderBook.pressure : 0
        } as ExpertForecast;
        (analysis as any).backendRisk = {
           var95: advancedData.risk.valueAtRisk95,
           suggestedRiskCapital: advancedData.risk.suggestedRiskCapital
        };
      } else {
        analysis = await marketAnalyzerPool.executeTask<ExpertForecast>('analyzeMarketMTF', {
          data,
          symbolId: selectedSymbol.id,
          context: { orderBook, correlation: corr, sentiment: sent }
        });
      }

      setForecast(analysis);
      
      const wfResults = await marketAnalyzerPool.executeTask<WalkForwardResult[]>('performWalkForwardBacktest', { candles: data['1h'] });
      setWalkForwardResults(wfResults);
      
    } catch (error) {
      console.error('Failed to load market data', error);
      setErrorState('Partial Data Load Failure - Some metrics may be simulated.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, selectedSymbol.id, orderBook]);

  const trainModel = async () => {
    setIsTraining(true);
    setTrainingProgress(0);
    for (let i = 1; i <= 10; i++) {
      await new Promise(r => setTimeout(r, 100));
      setTrainingProgress(i * 10);
    }
    try {
      const data = mtfData['1h'].length > 0 ? mtfData['1h'] : await apiClient.fetchMarketData(selectedSymbol.id);
      const accuracy = await marketAnalyzerPool.executeTask<number>('trainModelEpoch', { candles: data, symbolId: selectedSymbol.id });
      setMetrics(prev => ({ ...prev, accuracy, winRate: accuracy }));
      return accuracy;
    } catch (e) {
       console.error("Training failed", e);
       throw e;
    } finally {
      setIsTraining(false);
    }
  };

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
    selectedSymbol
  };
};
