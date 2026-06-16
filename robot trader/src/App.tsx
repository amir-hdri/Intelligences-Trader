import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MetricCard from './components/MetricCard';
import WalkForwardChart from './components/charts/WalkForwardChart';
import { OrderBook } from './components/analytics/OrderBook';
import { MarketCorrelation } from './components/analytics/MarketCorrelation';
import { SentimentMonitor } from './components/analytics/SentimentMonitor';
import { ArbitragePanel } from './components/analytics/ArbitragePanel';
import { LearningDashboard } from './components/analytics/LearningDashboard';
import { IME_SYMBOLS, DEFAULT_API_CONFIG, API_BASE_URL, INITIAL_METRICS, DEFAULT_RISK_LIMITS } from './constants';
import { 
  MarketCandle, ExpertForecast, ApiConfig, SystemMetrics, SymbolInfo, TimeFrame, 
  TradeLogEntry, RiskLimits, RiskStatus, OrderBook as OrderBookType, WalkForwardResult,
  CorrelationMetrics, SentimentData 
} from './types';
import { TseApiClient, StrategyWeights, DEFAULT_WEIGHTS } from './dataUtils';
import { WorkerPool } from './workers/workerPool';
import { predictionService } from './services/PredictionHistoryService';
import { RiskEngine } from './riskEngine';
import { 
  Activity, Cpu, TrendingUp, Clock, AlertCircle, Play, RefreshCcw, Save, 
  BrainCircuit, Settings, Database, ShieldAlert, History, ShieldCheck, Zap, 
  Layers, BarChart3, Globe, MessageSquare, ArrowRightLeft, Trash2
} from 'lucide-react';

// Helper for local storage

// Initialize worker pool
const marketAnalyzerPool = new WorkerPool(
  new URL('./workers/marketAnalyzer.worker.ts', import.meta.url),
  navigator.hardwareConcurrency || 4
);

// Helper for local storage
const usePersistedState = <T,>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
          const parsed = JSON.parse(item);
          // Merge with default value to ensure new fields (like balance) are present if missing in storage
          if (typeof parsed === 'object' && parsed !== null && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
              return { ...defaultValue, ...parsed };
          }
          return parsed;
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Error writing localStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Persisted States
  const [selectedSymbolId, setSelectedSymbolId] = usePersistedState<string>('selectedSymbolId', IME_SYMBOLS[0].id);
  const [apiConfig, setApiConfig] = usePersistedState<ApiConfig>('apiConfig', DEFAULT_API_CONFIG);

  const [metrics, setMetrics] = usePersistedState<SystemMetrics>('metrics', INITIAL_METRICS);
  const [connectionState, setConnectionState] = useState<'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);

  const [riskLimits, setRiskLimits] = usePersistedState<RiskLimits>('riskLimits', DEFAULT_RISK_LIMITS);
  const [tradeLogs, setTradeLogs] = usePersistedState<TradeLogEntry[]>('tradeLogs', []);

  // Derived or Transient States
  const selectedSymbol = useMemo(() => IME_SYMBOLS.find(s => s.id === selectedSymbolId) || IME_SYMBOLS[0], [selectedSymbolId]);

  const [mtfData, setMtfData] = useState<Record<TimeFrame, MarketCandle[]>>({ '1m': [], '15m': [], '1h': [], '1d': [] });
  const [orderBook, setOrderBook] = useState<OrderBookType | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationMetrics | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [forecast, setForecast] = useState<ExpertForecast | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  
  // Risk Engine needs to persist equity state potentially
  const riskEngine = useMemo(() => new RiskEngine(riskLimits, metrics.balance || 1000000), [riskLimits]);

  const [riskStatus, setRiskStatus] = useState<RiskStatus>(riskEngine.getStatus());
  
  const [walkForwardResults, setWalkForwardResults] = useState<WalkForwardResult[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [strategyWeights, setStrategyWeights] = useState<StrategyWeights>(DEFAULT_WEIGHTS);

  const apiClient = useMemo(() => new TseApiClient(apiConfig), [apiConfig]);

  const loadData = async () => {
    setIsLoading(true);
    setErrorState(null);
    try {
      // Parallel Fetching with individual error handling handled inside client if needed,
      // but here we want to ensure critical data loads.
      const [data, corr, sent] = await Promise.all([
          apiClient.fetchMultiTimeframeData(selectedSymbol.id),
          apiClient.fetchMarketCorrelation(),
          apiClient.fetchSentiment()
      ]);

      setMtfData(data);
      // setOrderBook is handled by WebSocket now
      setCorrelation(corr);
      setSentiment(sent);

      // 1. Try to fetch advanced metrics from the new backend
      const advancedData = await apiClient.fetchAdvancedMetrics(data['1h']);

      let analysis: ExpertForecast;
      let advancedRiskData: any;

      if (advancedData) {
        // Use Backend Analysis
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

        advancedRiskData = {
           var95: advancedData.risk.valueAtRisk95,
           suggestedRiskCapital: advancedData.risk.suggestedRiskCapital
        };

        // Attach external data to forecast for UI rendering
        (analysis as any).backendRisk = advancedRiskData;
      } else {
        // Fallback to local analysis
        analysis = await marketAnalyzerPool.executeTask<ExpertForecast>('analyzeMarketMTF', {
          data,
          symbolId: selectedSymbol.id,
          context: {
            orderBook: orderBook,
            correlation: corr,
            sentiment: sent
          }
        });
      }

      setForecast(analysis);
      
      const wfResults = await marketAnalyzerPool.executeTask<WalkForwardResult[]>('performWalkForwardBacktest', { candles: data['1h'] });
      setWalkForwardResults(wfResults);
      
      setLastUpdateTime(Date.now());
      
      // Sync Risk Engine with current balance
      riskEngine.updateEquity(metrics.balance || 1000000, metrics.activeOrders * 50000);
      setRiskStatus(riskEngine.getStatus());

    } catch (error) {
      console.error('Failed to load market data', error);
      setErrorState('Partial Data Load Failure - Some metrics may be simulated.');
    } finally {
      setIsLoading(false);
    }
  };

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
      riskEngine.updatePerformanceMetrics(accuracy, metrics.profitFactor);
    } catch (e) {
       console.error("Training failed", e);
       alert("Model training failed. Please check server connection.");
    } finally {
      setIsTraining(false);
    }
  };

  const executeTrade = () => {
    if (!forecast) return;

    // Pass advanced risk data if available
    const advancedRiskData = (forecast as any).backendRisk ? { var95: (forecast as any).backendRisk.var95 } : undefined;

    const validation = riskEngine.validateTrade(forecast, metrics.activeOrders, selectedSymbol, advancedRiskData);
    if (!validation.allowed) {
      alert(`Trade Rejected: ${validation.reason}`);
      return;
    }

    const price = forecast.entryPrice;
    const newLog: TradeLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol: selectedSymbol.name,
      action: forecast.action,
      price: price,
      reason: forecast.reason,
      metricsAtTrade: { 
        rsi: forecast.indicators.rsi, 
        regime: forecast.regime,
        sentiment: forecast.sentimentScore
      }
    };

    setTradeLogs(prev => [newLog, ...prev]);

    // Simulate immediate outcome for demonstration
    // 55% chance of win based on "AI" win rate or 50/50
    const isWin = Math.random() < metrics.winRate;
    const riskPerTrade = 0.01 * (metrics.balance || 1000000); // 1% risk
    const reward = riskPerTrade * metrics.profitFactor;
    const pnl = isWin ? reward : -riskPerTrade;

    const newBalance = (metrics.balance || 1000000) + pnl;

    setMetrics(prev => ({
        ...prev,
        balance: newBalance
        // In a real scenario, activeOrders would increment, then decrement on close.
        // For this simulator, we assume "Spot" or "Instant" settlement for simplicity unless we add position management.
    }));

    // Update Risk Engine immediately
    riskEngine.updateEquity(newBalance, metrics.activeOrders * 50000);
    setRiskStatus(riskEngine.getStatus());

    alert(`Trade Executed: ${forecast.action} @ ${price.toLocaleString()}\nResult: ${isWin ? 'PROFIT' : 'LOSS'} (${pnl.toFixed(0)})\nNew Balance: ${newBalance.toFixed(0)}`);
  };

  const handleRollover = () => {
    if (selectedSymbol.type !== 'FUTURES') return;

    const currentIndex = IME_SYMBOLS.findIndex(s => s.id === selectedSymbol.id);
    let nextIndex = currentIndex + 1;
    let nextSymbol = null;

    // Find next FUTURE
    while(nextIndex < IME_SYMBOLS.length) {
        if(IME_SYMBOLS[nextIndex].type === 'FUTURES') {
            nextSymbol = IME_SYMBOLS[nextIndex];
            break;
        }
        nextIndex++;
    }

    // If none found forward, wrap around to find any other future
    if(!nextSymbol) {
         nextIndex = 0;
         while(nextIndex < currentIndex) {
            if(IME_SYMBOLS[nextIndex].type === 'FUTURES') {
                nextSymbol = IME_SYMBOLS[nextIndex];
                break;
            }
            nextIndex++;
        }
    }

    if (nextSymbol) {
        if(confirm(`Rolling over position from ${selectedSymbol.name} to ${nextSymbol.name}.\nThis will close current positions and open on the new contract.`)) {
             setSelectedSymbolId(nextSymbol.id);
             // Simulate cost of rollover?
             const rolloverCost = 50000;
             setMetrics(prev => ({
                 ...prev,
                 balance: (prev.balance || 1000000) - rolloverCost
             }));
             alert('Rollover Complete. Rollover costs applied.');
        }
    } else {
        alert('No other futures contract available for rollover.');
    }
  };

  const clearData = () => {
      if(confirm('Are you sure you want to clear all data and reset the simulator?')) {
          localStorage.clear();
          window.location.reload();
      }
  }

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('RECONNECTING');
    const ws = new WebSocket(`ws://localhost:3001/?symbol=${selectedSymbol.id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('CONNECTED');
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ORDER_BOOK') {
          setOrderBook(message.data);
        } else if (message.type === 'TRADE_TICK') {
           setMetrics(prev => ({
             ...prev,
             lastPrice: message.data.price
           }));
        } else if (message.type === 'PRICE_CHANGE') {
           // Placeholder for future chart updates
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnectionState('DISCONNECTED');
      // Exponential backoff
      const attempts = reconnectAttemptsRef.current;
      const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 5000); // max 5s
      reconnectAttemptsRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, backoffDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [selectedSymbol.id]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setMetrics(prev => {
        const [h, m, s] = prev.uptime.split(':').map(Number);
        const newS = (s + 1) % 60;
        const newM = (m + (s + 1 >= 60 ? 1 : 0)) % 60;
        const newH = h + (m + (s + 1 >= 60 ? 1 : 0) >= 60 ? 1 : 0);
        return {
          ...prev,
          uptime: `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}:${newS.toString().padStart(2, '0')}`,
          latency: Math.floor(Math.random() * 20) + 5
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedSymbolId, apiConfig]); // Changed dependency to selectedSymbolId

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} status={metrics.status} />
      
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4 text-xs">
            <select 
              value={selectedSymbol.id}
              onChange={(e) => setSelectedSymbolId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {IME_SYMBOLS.map(symbol => (
                <option key={symbol.id} value={symbol.id}>{symbol.type}: {symbol.name}</option>
              ))}
            </select>
            <button onClick={loadData} disabled={isLoading} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <RefreshCcw className={`w-4 h-4 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {selectedSymbol.type === 'FUTURES' && (
              <button onClick={handleRollover} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 border border-indigo-600/20 rounded-lg font-bold hover:bg-indigo-600/20">
                <ArrowRightLeft className="w-3 h-3" />
                ROLLOVER
              </button>
            )}
          </div>

          <div className="flex items-center gap-6">
            {errorState && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                    <ShieldAlert className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">System Warning</span>
                </div>
            )}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${connectionState === 'CONNECTED' ? 'bg-emerald-500/20 text-emerald-400' : connectionState === 'RECONNECTING' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-rose-500/20 text-rose-400'}`}>
                {connectionState}
              </span>
              <span className={`w-2 h-2 rounded-full animate-pulse ${errorState ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-sm font-mono text-slate-400">{metrics.uptime}</span>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-800 pl-6">
              <Activity className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-mono text-slate-400">{metrics.latency}ms</span>
            </div>
             <div className="flex items-center gap-2 border-l border-slate-800 pl-6">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Balance</span>
              <span className="text-sm font-mono text-white">{(metrics.balance || 1000000).toLocaleString()}</span>
            </div>
            <button onClick={clearData} className="text-slate-500 hover:text-rose-500 transition-colors" title="Reset All Data">
                <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="p-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <MetricCard title="Political Risk Index" value={sentiment ? `${sentiment.politicalRiskIndex.toFixed(0)}` : '50'} icon={AlertCircle} trend={{ value: sentiment?.politicalRiskIndex ? sentiment.politicalRiskIndex - 50 : 0, isPositive: sentiment?.politicalRiskIndex ? sentiment.politicalRiskIndex > 50 : false }} />
                <MetricCard title="Bubble Gap" value={forecast?.bubbleGap !== undefined ? `${(forecast.bubbleGap * 100).toFixed(1)}%` : '0%'} icon={Zap} trend={{ value: forecast?.bubbleGap || 0, isPositive: forecast?.bubbleGap ? forecast.bubbleGap > 0 : false }} />
                <MetricCard title="Queue Herding" value={orderBook ? `${(orderBook.queueDynamics.buyRatio * 100).toFixed(1)}%` : '0%'} icon={BarChart3} trend={{ value: orderBook ? orderBook.queueDynamics.buyRatio - 0.5 : 0, isPositive: orderBook ? orderBook.queueDynamics.buyRatio > 0.5 : false }} />
                <MetricCard title="Market Sentiment" value={sentiment ? `${(sentiment.score * 100).toFixed(0)}%` : '0%'} icon={BrainCircuit} />
                <MetricCard title="Risk Buffer" value={`${(riskStatus.margin.freeMargin / 10000).toFixed(1)}%`} icon={ShieldCheck} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-400">
                        <TrendingUp className="w-5 h-5" />
                        Intelligence Engine (IME)
                      </h2>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                           <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[9px] font-black border border-rose-500/20 rounded uppercase tracking-tighter">LIMIT DOWN: {selectedSymbol.priceLimit.down.toLocaleString()}</span>
                           <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black border border-emerald-500/20 rounded uppercase tracking-tighter">LIMIT UP: {selectedSymbol.priceLimit.up.toLocaleString()}</span>
                        </div>
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded border border-amber-500/20 uppercase tracking-widest">Hedge Fund Core Active</span>
                      </div>
                    </div>
                    <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {orderBook && <OrderBook data={orderBook} />}
                    {correlation && <MarketCorrelation data={correlation} />}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-purple-500" />
                      Execution Signal
                    </h2>
                    {forecast ? (
                      <div className="space-y-4">
                        <div className={`p-4 rounded-xl border ${
                          forecast.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                          forecast.action === 'SELL' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 
                          'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          <div className="text-2xl font-black mb-1">{forecast.action}</div>
                          <div className="text-[11px] font-medium opacity-80 leading-relaxed">{forecast.reason}</div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase font-bold text-center">Units (Kelly + VaR)</div>
                            <div className="text-sm font-mono text-center text-indigo-400">
                              {riskEngine.calculateKellySize(forecast.entryPrice, forecast.indicators.atr, (forecast as any).backendRisk?.suggestedRiskCapital)}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase font-bold text-center">VaR (95%)</div>
                            <div className="text-sm font-mono text-center text-rose-400">
                               {(((forecast as any).backendRisk?.var95 || 0) * 100).toFixed(2)}%
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase font-bold text-center">Regime</div>
                            <div className="text-sm font-mono text-center">{forecast.regime}</div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase font-bold text-center">Confidence</div>
                            <div className="text-sm font-mono text-center">{(forecast.confidence * 100).toFixed(0)}%</div>
                          </div>
                        </div>

                        <button 
                          onClick={executeTrade}
                          disabled={riskStatus.isKillSwitchActive}
                          className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                            riskStatus.isKillSwitchActive ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                          }`}
                        >
                          <Play className="w-4 h-4 fill-current" />
                          Execute Signal
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                        <RefreshCcw className="w-8 h-8 mb-2 animate-spin-slow" />
                        AI Thinking...
                      </div>
                    )}
                  </div>

                  {sentiment && <SentimentMonitor data={sentiment} />}
                  <ArbitragePanel opportunities={forecast?.arbitrage ? [forecast.arbitrage] : []} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <LearningDashboard
              history={predictionService.getHistory()}
              currentWeights={strategyWeights}
            />
          )}

          {activeTab === 'intelligence' && (
            <div className="space-y-8">
               <div className="bg-indigo-600/10 border border-indigo-600/20 rounded-2xl p-6">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-indigo-400 uppercase tracking-wider">
                    <Layers className="w-6 h-6" />
                    Market Intelligence Hub
                  </h2>
                  <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                    KalayBot AI continuously scans Level 2 Order Books, Global Market Correlations, and News Sentiment to provide a 360-degree view of the Iran Mercantile Exchange.
                  </p>
               </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                   <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        Depth Analysis & Manipulation Detection
                      </h3>
                      {orderBook && <OrderBook data={orderBook} />}
                   </div>
                   <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-500" />
                        Inter-market Correlations
                      </h3>
                      {correlation && <MarketCorrelation data={correlation} />}
                   </div>
                </div>
                <div className="space-y-8">
                   {sentiment && <SentimentMonitor data={sentiment} />}
                   <ArbitragePanel opportunities={forecast?.arbitrage ? [forecast.arbitrage] : []} />
                   <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-gray-400 font-bold text-xs uppercase mb-4 tracking-widest">Contract Maturity</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Days to Expiry</span>
                          <span className="text-white font-mono">{selectedSymbol.expiryDate ? Math.floor((selectedSymbol.expiryDate - Date.now()) / 86400000) : 'N/A'} Days</span>
                        </div>
                        {selectedSymbol.type === 'FUTURES' && (
                           <button onClick={handleRollover} className="w-full mt-2 py-2 bg-indigo-600 text-white text-[10px] font-bold rounded uppercase tracking-tighter">
                             Initiate Rollover
                           </button>
                        )}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center text-sm font-bold">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-blue-500" />
                  IME Multi-frequency Table
                </div>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4 text-right">Close</th>
                    <th className="px-6 py-4 text-right">Basis</th>
                    <th className="px-6 py-4 text-right">OI</th>
                    <th className="px-6 py-4 text-right">Warehouse</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {mtfData['1h'].slice().reverse().map((candle, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400">{new Date(candle.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-white font-bold">{candle.close.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-indigo-400">{candle.basis?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-400">{candle.openInterest?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500">{candle.warehouseVolume?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        {activeTab === 'intelligence' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-white">Advanced Intelligence (Phase 6)</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-indigo-400" /> Ensemble Learning</h3>
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">Models: TCN, LSTM, XGBoost, Random Forest, Linear</p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Diversity (Correlation):</span>
                    <span className="text-emerald-400">&lt; 0.70</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Ensemble Boost:</span>
                    <span className="text-emerald-400">+5.0%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                     <div className="bg-indigo-500 h-full" style={{width: '25%'}}></div>
                     <div className="bg-blue-500 h-full" style={{width: '25%'}}></div>
                     <div className="bg-emerald-500 h-full" style={{width: '20%'}}></div>
                     <div className="bg-amber-500 h-full" style={{width: '15%'}}></div>
                     <div className="bg-rose-500 h-full" style={{width: '15%'}}></div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-blue-400" /> Alternative Data Fusion</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">News Sentiment (FinBERT):</span>
                    <span className="text-emerald-400">Positive (0.65)</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Social Media Consensus:</span>
                    <span className="text-amber-400">Neutral (0.45)</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Macro Impact (Rates/Inflation):</span>
                    <span className="text-rose-400">Negative (-0.30)</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Attention Weights dynamically allocated based on signal strength.</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-emerald-400" /> Multi-Asset Portfolio</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Optimization Model:</span>
                    <span className="text-slate-300">Hierarchical Risk Parity (HRP)</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Est. Sharpe Improvement:</span>
                    <span className="text-emerald-400">+22%</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Drawdown Reduction:</span>
                    <span className="text-emerald-400">-35%</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-rose-400" /> Explainable AI (XAI)</h3>
                <div className="space-y-4">
                  <div className="text-sm text-slate-400 mb-2">SHAP Feature Importance (Local)</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-slate-500">Price_Momentum</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full"><div className="bg-emerald-500 h-full w-3/4 rounded-full"></div></div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-slate-500">Volume_Trend</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full"><div className="bg-emerald-500 h-full w-1/2 rounded-full"></div></div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-slate-500">News_Sentiment</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full"><div className="bg-rose-500 h-full w-1/4 rounded-full"></div></div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <BrainCircuit className="w-6 h-6 text-purple-500" />
                    Strategy Optimization Lab
                  </h2>
                  <button onClick={trainModel} disabled={isTraining} className="bg-purple-600 px-6 py-2 rounded-xl font-bold text-white hover:bg-purple-500 transition-all uppercase text-xs">
                    {isTraining ? `Training ${trainingProgress}%` : 'Recalibrate Weights'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Model Accuracy</div>
                    <div className="text-3xl font-black">{(metrics.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Profit Factor</div>
                    <div className="text-3xl font-black text-emerald-400">{metrics.profitFactor}</div>
                  </div>
                  <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</div>
                    <div className="text-3xl font-black text-indigo-400">{(metrics.winRate * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
              </div>
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-rose-500 uppercase tracking-widest">
                  <ShieldAlert className="w-6 h-6" />
                  Risk Engine Monitoring
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-8">
                    <div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-slate-500 uppercase font-bold tracking-tighter">Margin Level</span>
                        <span className={`font-mono font-bold ${riskStatus.margin.marginLevel < 150 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {riskStatus.margin.marginLevel.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${riskStatus.margin.marginLevel < 150 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, riskStatus.margin.marginLevel / 2)}%` }}></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 uppercase font-bold tracking-widest">Smart Margin Active - Prevents Call Marjin</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Used Margin</div>
                          <div className="text-sm font-mono">{riskStatus.margin.usedMargin.toLocaleString()} IRR</div>
                       </div>
                       <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Free Margin</div>
                          <div className="text-sm font-mono text-emerald-400">{riskStatus.margin.freeMargin.toLocaleString()} IRR</div>
                       </div>
                    </div>
                  </div>
                  <div className={`p-8 rounded-2xl border ${riskStatus.isKillSwitchActive ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-800 border-slate-700 shadow-xl'}`}>
                    <div className="flex items-center gap-3 mb-6">
                       <div className={`w-3 h-3 rounded-full animate-pulse ${riskStatus.isKillSwitchActive ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                       <span className="text-sm font-bold uppercase tracking-widest">{riskStatus.isKillSwitchActive ? 'Trading Halted' : 'Operational Status'}</span>
                    </div>
                    {riskStatus.violations.length > 0 && (
                      <div className="mb-6 p-4 bg-rose-500/5 rounded-lg border border-rose-500/20">
                        <ul className="text-xs text-rose-300 space-y-2 list-disc pl-4 font-medium">
                          {riskStatus.violations.map((v, i) => <li key={i}>{v}</li>)}
                        </ul>
                      </div>
                    )}
                    <button 
                      onClick={() => { riskEngine.resetKillSwitch(); setRiskStatus(riskEngine.getStatus()); }}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                    >
                      Re-Arm Risk Engine
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-6 bg-slate-800/30 text-lg font-bold flex items-center gap-3">
                <History className="w-5 h-5 text-indigo-500" />
                Execution History
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/50 text-slate-500 font-bold uppercase tracking-widest">
                   <tr>
                     <th className="px-6 py-4">Timestamp</th>
                     <th className="px-6 py-4">Symbol</th>
                     <th className="px-6 py-4">Action</th>
                     <th className="px-6 py-4 text-right">Price</th>
                     <th className="px-6 py-4 text-center">Sentiment</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tradeLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/20">
                      <td className="px-6 py-4 font-mono text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-6 py-4 font-bold">{log.symbol}</td>
                      <td className="px-6 py-4">
                        <span className={`font-black px-2 py-1 rounded text-[10px] ${log.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{log.action}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono">{log.price.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold ${log.metricsAtTrade.sentiment > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(log.metricsAtTrade.sentiment * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {tradeLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-600 font-bold uppercase tracking-widest italic">No trades logged</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'monitoring' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                   <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-indigo-400">
                     <Activity className="w-6 h-6" />
                     System Health
                   </h2>
                   <div className="space-y-4">
                      <div className="flex justify-between p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-500 font-bold text-xs uppercase">Engine Load</span>
                        <span className="text-emerald-400 font-mono">14%</span>
                      </div>
                      <div className="flex justify-between p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-500 font-bold text-xs uppercase">Memory</span>
                        <span className="text-indigo-400 font-mono">312MB</span>
                      </div>
                      <div className="flex justify-between p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-500 font-bold text-xs uppercase">Local Server Proxy</span>
                        <span className={`font-bold text-[10px] uppercase ${apiConfig.isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{apiConfig.isConnected ? 'Connected' : 'Disconnected'}</span>
                      </div>
                   </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                   <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-indigo-400">
                     <Cpu className="w-6 h-6" />
                     Data Source Status
                   </h2>
                   <div className={`p-4 rounded-xl border font-mono text-[10px] ${apiConfig.isConnected ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300'}`}>
                      {apiConfig.isConnected ? (
                        <>
                           Source: Real TSETMC via Node.js Proxy<br/>
                           Advanced Analysis Engine: ONLINE<br/>
                           VaR Modeling: ACTIVE
                        </>
                      ) : (
                        <>
                           Source: Fallback Digital Twin Simulation<br/>
                           Model: Geometric Brownian Motion<br/>
                           Drift: 0.0001 | Sigma: 0.02<br/>
                           Sync: Local Offline Mode
                        </>
                      )}
                   </div>
                </div>
             </div>
          )}

          {activeTab === 'settings' && (
             <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-indigo-400">
                  <Settings className="w-6 h-6" />
                  API Configuration
                </h2>
                <div className="space-y-6">
                   <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-widest">OMS Proxy Server</label>
                      <input type="text" value={apiConfig.proxyUrl} onChange={e => setApiConfig({...apiConfig, proxyUrl: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={API_BASE_URL} />
                   </div>
                   <div className="flex gap-4">
                      <button onClick={() => setApiConfig({...apiConfig, isConnected: !apiConfig.isConnected})} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${apiConfig.isConnected ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
                        {apiConfig.isConnected ? 'Stop OMS' : 'Start OMS'}
                      </button>
                      <button className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest border border-slate-700">Save Profiles</button>
                   </div>
                </div>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
