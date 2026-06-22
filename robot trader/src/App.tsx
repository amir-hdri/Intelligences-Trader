import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MetricCard from './components/common/MetricCard';
import WalkForwardChart from './components/charts/WalkForwardChart';
import { OrderBook } from './components/analytics/OrderBook';
import { MarketCorrelation } from './components/analytics/MarketCorrelation';
import { SentimentMonitor } from './components/analytics/SentimentMonitor';
import { ArbitragePanel } from './components/analytics/ArbitragePanel';
import { LearningDashboard } from './components/analytics/LearningDashboard';
import { TradePanel } from './components/dashboard/TradePanel';
import { DashboardHeader } from './components/dashboard/DashboardHeader';
import { RiskControlPanel } from './components/dashboard/RiskControlPanel';
import { TradeLogsPanel } from './components/dashboard/TradeLogsPanel';
import { SystemHealthMonitor } from './components/dashboard/SystemHealthMonitor';
import { ApiSettingsPanel } from './components/dashboard/ApiSettingsPanel';
import { IME_SYMBOLS, DEFAULT_API_CONFIG, INITIAL_METRICS, DEFAULT_RISK_LIMITS } from './constants';
import { 
  ApiConfig, SystemMetrics, TradeLogEntry, RiskLimits, RiskStatus 
} from './types';
import { StrategyWeights, DEFAULT_WEIGHTS } from './dataUtils';
import { RiskEngine } from './riskEngine';
import { 
  AlertCircle, BrainCircuit, ShieldCheck, Zap, TrendingUp, BarChart3
} from 'lucide-react';

import { useMarketData } from './hooks/useMarketData';
import { useWebSocket } from './hooks/useWebSocket';
import { useLocalStorage } from './hooks/useLocalStorage';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persisted States
  const [selectedSymbolId, setSelectedSymbolId] = useLocalStorage<string>('selectedSymbolId', IME_SYMBOLS[0].id);
  const [apiConfig, setApiConfig] = useLocalStorage<ApiConfig>('apiConfig', DEFAULT_API_CONFIG);
  const [metrics, setMetrics] = useLocalStorage<SystemMetrics>('metrics', INITIAL_METRICS);
  const [riskLimits, setRiskLimits] = useLocalStorage<RiskLimits>('riskLimits', DEFAULT_RISK_LIMITS);
  const [tradeLogs, setTradeLogs] = useLocalStorage<TradeLogEntry[]>('tradeLogs', []);

  // Market Data Hook
  const {
    mtfData, orderBook, setOrderBook, correlation, sentiment, forecast,
    isLoading, errorState, isTraining, trainingProgress,
    loadData, trainModel, selectedSymbol
  } = useMarketData(selectedSymbolId, apiConfig, setMetrics);

  // Price Update Callback
  const handlePriceUpdate = useCallback((price: number) => {
    setMetrics(prev => ({ ...prev, lastPrice: price }));
  }, [setMetrics]);

  // WebSocket Hook
  const { connectionState } = useWebSocket(selectedSymbolId, setOrderBook, handlePriceUpdate);

  // Risk Engine
  const riskEngine = useMemo(() => new RiskEngine(riskLimits, metrics.balance || 1000000), [riskLimits, metrics.balance]);
  const [riskStatus, setRiskStatus] = useState<RiskStatus>(riskEngine.getStatus());

  const executeTrade = () => {
    if (!forecast) return;

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

    const isWin = Math.random() < metrics.winRate;
    const riskPerTrade = 0.01 * (metrics.balance || 1000000); 
    const reward = riskPerTrade * metrics.profitFactor;
    const pnl = isWin ? reward : -riskPerTrade;

    const newBalance = (metrics.balance || 1000000) + pnl;

    setMetrics(prev => ({ ...prev, balance: newBalance }));
    riskEngine.updateEquity(newBalance, metrics.activeOrders * 50000);
    setRiskStatus(riskEngine.getStatus());

    alert(`Trade Executed: ${forecast.action} @ ${price.toLocaleString()}\nResult: ${isWin ? 'PROFIT' : 'LOSS'} (${pnl.toFixed(0)})\nNew Balance: ${newBalance.toFixed(0)}`);
  };

  const handleRollover = () => {
    if (selectedSymbol.type !== 'FUTURES') return;
    const currentIndex = IME_SYMBOLS.findIndex(s => s.id === selectedSymbol.id);
    const nextSymbol = IME_SYMBOLS.slice(currentIndex + 1).find(s => s.type === 'FUTURES') || 
                       IME_SYMBOLS.find(s => s.type === 'FUTURES');

    if (nextSymbol && confirm(`Rolling over position from ${selectedSymbol.name} to ${nextSymbol.name}.`)) {
      setSelectedSymbolId(nextSymbol.id);
      setMetrics(prev => ({ ...prev, balance: (prev.balance || 1000000) - 50000 }));
    }
  };

  const clearData = () => {
    if(confirm('Are you sure you want to clear all data and reset the simulator?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setMetrics(prev => {
        const [h, m, s] = prev.uptime.split(':').map(Number);
        const nextS = (s + 1) % 60;
        const nextM = (m + (s + 1 >= 60 ? 1 : 0)) % 60;
        const nextH = h + (m + (s + 1 >= 60 ? 1 : 0) >= 60 ? 1 : 0);
        return {
          ...prev,
          uptime: `${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}:${nextS.toString().padStart(2, '0')}`,
          latency: Math.floor(Math.random() * 20) + 5
        };
      });
      riskEngine.updateEquity(metrics.balance || 1000000, metrics.activeOrders * 50000);
      setRiskStatus(riskEngine.getStatus());
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedSymbolId, apiConfig, loadData]);

  return (
    <div className="flex h-screen bg-[#030712] bg-grid-mesh overflow-hidden text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} status={metrics.status} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 overflow-y-auto relative z-10 scrollbar-thin scrollbar-thumb-slate-800/50">
        <DashboardHeader 
          selectedSymbol={selectedSymbol}
          setSelectedSymbolId={setSelectedSymbolId}
          loadData={loadData}
          isLoading={isLoading}
          errorState={errorState}
          connectionState={connectionState}
          metrics={metrics}
          handleRollover={handleRollover}
          clearData={clearData}
          setIsSidebarOpen={setIsSidebarOpen}
        />

        <div className="p-4 lg:p-8 space-y-8 animate-in fade-in duration-700">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
                <MetricCard title="Political Risk Index" value={sentiment ? `${sentiment.politicalRiskIndex.toFixed(0)}` : '50'} icon={AlertCircle} trend={{ value: sentiment?.politicalRiskIndex ? sentiment.politicalRiskIndex - 50 : 0, isPositive: sentiment?.politicalRiskIndex ? sentiment.politicalRiskIndex > 50 : false }} highlightColor="purple-500" />
                <MetricCard title="Bubble Gap" value={forecast?.bubbleGap !== undefined ? `${(forecast.bubbleGap * 100).toFixed(1)}%` : '0%'} icon={Zap} trend={{ value: forecast?.bubbleGap || 0, isPositive: forecast?.bubbleGap ? forecast.bubbleGap > 0 : false }} highlightColor="amber-500" />
                <MetricCard title="Queue Herding" value={orderBook ? `${(orderBook.queueDynamics.buyRatio * 100).toFixed(1)}%` : '0%'} icon={BarChart3} trend={{ value: orderBook ? orderBook.queueDynamics.buyRatio - 0.5 : 0, isPositive: orderBook ? orderBook.queueDynamics.buyRatio > 0.5 : false }} highlightColor="blue-400" />
                <MetricCard title="Market Sentiment" value={sentiment ? `${(sentiment.score * 100).toFixed(0)}%` : '0%'} icon={BrainCircuit} highlightColor="emerald-400" />
                <MetricCard title="Risk Buffer" value={`${(riskStatus.margin.freeMargin / 10000).toFixed(1)}%`} icon={ShieldCheck} highlightColor="indigo-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                <div className="lg:col-span-2 space-y-6 lg:space-y-8">
                  <div className="glass-panel rounded-3xl p-4 lg:p-6 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h2 className="text-lg font-black flex items-center gap-2 text-indigo-400 uppercase tracking-widest">
                        <TrendingUp className="w-5 h-5" />
                        Intelligence Engine (IME)
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 lg:gap-4">
                        <div className="flex gap-1.5">
                           <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] font-black border border-rose-500/20 rounded shadow-sm uppercase tracking-tighter">LIMIT DOWN: {selectedSymbol.priceLimit.down.toLocaleString()}</span>
                           <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black border border-emerald-500/20 rounded shadow-sm uppercase tracking-tighter">LIMIT UP: {selectedSymbol.priceLimit.up.toLocaleString()}</span>
                        </div>
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-400 text-[9px] font-black rounded border border-amber-500/20 uppercase tracking-widest shadow-sm">Core Active</span>
                      </div>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-slate-800/50 shadow-inner">
                      <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {orderBook && <OrderBook data={orderBook} />}
                    {correlation && <MarketCorrelation data={correlation} />}
                  </div>
                </div>

                <div className="space-y-6">
                  <TradePanel 
                    forecast={forecast}
                    riskStatus={riskStatus}
                    onExecuteTrade={executeTrade}
                    calculateKellySize={(p, a, s) => riskEngine.calculateKellySize(p, a, s)}
                  />
                  {sentiment && <SentimentMonitor data={sentiment} />}
                  <ArbitragePanel opportunities={forecast?.arbitrage ? [forecast.arbitrage] : []} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <LearningDashboard
              history={[]}
              currentWeights={DEFAULT_WEIGHTS}
            />
          )}

          {activeTab === 'intelligence' && (
            <div className="space-y-8">
               <div className="bg-indigo-600/10 border border-indigo-600/20 rounded-2xl p-6">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-indigo-400 uppercase tracking-wider">
                    <TrendingUp className="w-6 h-6" />
                    Market Intelligence Hub
                  </h2>
                  <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                    KalayBot AI continuously scans Level 2 Order Books, Global Market Correlations, and News Sentiment to provide a 360-degree view of the Iran Mercantile Exchange.
                  </p>
               </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                   <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-2xl">
                      <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-widest text-emerald-400">
                        <BarChart3 className="w-5 h-5" />
                        Depth Analysis & Manipulation
                      </h3>
                      {orderBook && <OrderBook data={orderBook} />}
                   </div>
                   <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-2xl">
                      <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-widest text-indigo-400">
                        <Zap className="w-5 h-5" />
                        Inter-market Correlations
                      </h3>
                      {correlation && <MarketCorrelation data={correlation} />}
                   </div>
                </div>
                <div className="space-y-8">
                   {sentiment && <SentimentMonitor data={sentiment} />}
                   <ArbitragePanel opportunities={forecast?.arbitrage ? [forecast.arbitrage] : []} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-800/50">
              <div className="p-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/40">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  <span className="font-black uppercase tracking-widest text-[10px] text-slate-300">IME Multi-frequency Stream</span>
                </div>
                <div className="flex gap-1">
                   <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                   <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-500 uppercase text-[9px] font-black tracking-[0.2em]">
                    <tr>
                      <th className="px-6 py-6">Timestamp</th>
                      <th className="px-6 py-6 text-right">Close Price</th>
                      <th className="px-6 py-6 text-right">Basis Yield</th>
                      <th className="px-6 py-6 text-right">Open Interest</th>
                      <th className="px-6 py-6 text-right">Inventory</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {mtfData['1h'].slice().reverse().map((candle, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-mono text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">{new Date(candle.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-white font-black">{candle.close.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-[11px] text-indigo-400 font-bold">{candle.basis?.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-[11px] text-emerald-400 font-bold">{candle.openInterest?.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-[11px] text-slate-500 font-bold">{candle.warehouseVolume?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="space-y-8">
              <div className="glass-panel rounded-3xl p-6 lg:p-10 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                  <h2 className="text-2xl font-black flex items-center gap-4 tracking-tighter uppercase">
                    <BrainCircuit className="w-10 h-10 text-purple-500" />
                    Neural Strategy Lab
                  </h2>
                  <button onClick={trainModel} disabled={isTraining} className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-4 rounded-2xl font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-all uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-purple-500/20 active:scale-95 border border-purple-400/30">
                    {isTraining ? `Evolving Weights ${trainingProgress}%` : 'Recalibrate Multi-Agent Matrix'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
                  <div className="glass-card p-8 rounded-3xl border-indigo-500/20 shadow-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                    <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-[0.3em]">Neural Accuracy</div>
                    <div className="text-5xl font-black text-white tracking-tighter">{(metrics.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div className="glass-card p-8 rounded-3xl border-emerald-500/20 shadow-2xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                    <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-[0.3em]">Profit Factor</div>
                    <div className="text-5xl font-black text-emerald-400 tracking-tighter text-glow">{metrics.profitFactor}</div>
                  </div>
                  <div className="glass-card p-8 rounded-3xl border-sky-500/20 shadow-2xl relative overflow-hidden group hover:border-sky-500/40 transition-all">
                    <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-[0.3em]">Win Rate</div>
                    <div className="text-5xl font-black text-sky-400 tracking-tighter text-glow">{(metrics.winRate * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div className="rounded-3xl overflow-hidden border border-slate-800/50 shadow-inner">
                   <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'risk' && (
            <RiskControlPanel 
              riskLimits={riskLimits} 
              setRiskLimits={setRiskLimits} 
              riskStatus={riskStatus} 
            />
          )}

          {activeTab === 'logs' && (
            <TradeLogsPanel 
              tradeLogs={tradeLogs} 
            />
          )}

          {activeTab === 'monitoring' && (
            <SystemHealthMonitor 
              metrics={metrics} 
              connectionState={connectionState} 
            />
          )}

          {activeTab === 'settings' && (
            <ApiSettingsPanel 
              apiConfig={apiConfig} 
              setApiConfig={setApiConfig} 
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
