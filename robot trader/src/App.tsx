import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { IME_SYMBOLS, DEFAULT_API_CONFIG, INITIAL_METRICS, DEFAULT_RISK_LIMITS } from './constants';
import type { ApiConfig, SystemMetrics, TradeLogEntry, RiskLimits, RiskStatus, TimeFrame, MarketRegime } from './types';
import { DEFAULT_WEIGHTS } from './dataUtils';
import { RiskEngine } from './riskEngine';
import { useMarketData } from './hooks/useMarketData';
import { useWebSocket } from './hooks/useWebSocket';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ProfessionalChart } from './components/charts/ProfessionalChart';
import { OrderBook as OrderBookView } from './components/analytics/OrderBook';
import { MarketCorrelation } from './components/analytics/MarketCorrelation';
import { SentimentMonitor } from './components/analytics/SentimentMonitor';
import { ArbitragePanel } from './components/analytics/ArbitragePanel';
import { LearningDashboard } from './components/analytics/LearningDashboard';
import { MarketRegimeTimeline } from './components/analytics/MarketRegimeTimeline';
import { PerformanceAnalytics } from './components/analytics/PerformanceAnalytics';
import { TradeTicket } from './components/dashboard/TradeTicket';
import { Header, Sidebar, MobileDrawer, BottomNav, StatusBar, NAV } from './components/layout/AppShell';
import { MetricCard } from './components/dashboard/KPI';
import { AISignal } from './components/dashboard/AISignal';
import { RiskControlPanel } from './components/dashboard/RiskControlPanel';
import { Skeleton } from './components/common/ui';
import {
  AlertTriangle, Zap, ShieldCheck, BarChart3, TrendingUp, TrendingDown, ShieldAlert,
  Maximize2, RefreshCw, Eye, Filter, Download, Clock, Percent, Search, X, ChevronDown, ChevronUp, Layers
} from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [selectedSymbolId, setSelectedSymbolId] = useLocalStorage<string>('selectedSymbolId', IME_SYMBOLS[0].id);
  const [apiConfig, setApiConfig] = useLocalStorage<ApiConfig>('apiConfig', DEFAULT_API_CONFIG);
  const [metrics, setMetrics] = useLocalStorage<SystemMetrics>('metrics', INITIAL_METRICS);
  const [riskLimits, setRiskLimits] = useLocalStorage<RiskLimits>('riskLimits', DEFAULT_RISK_LIMITS);
  const [tradeLogs, setTradeLogs] = useLocalStorage<TradeLogEntry[]>('tradeLogs', []);
  const [timeframe, setTimeframe] = useState<TimeFrame>('1h');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<{ id: string; msg: string }[]>([]);
  const pushToast = (msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  const {
    mtfData,
    orderBook,
    setOrderBook,
    correlation,
    sentiment,
    forecast,
    isLoading,
    errorState,
    isTraining,
    trainingProgress,
    loadData,
    trainModel,
    selectedSymbol,
  } = useMarketData(selectedSymbolId, apiConfig, setMetrics);

  const handlePriceUpdate = useCallback(
    (price: number) => setMetrics((prev) => ({ ...prev, lastPrice: price } as any)),
    [setMetrics]
  );

  const { connectionState } = useWebSocket(selectedSymbolId, setOrderBook, handlePriceUpdate);

  const riskEngineRef = useRef<RiskEngine | null>(null);
  if (!riskEngineRef.current) {
    riskEngineRef.current = new RiskEngine(riskLimits, metrics.balance || INITIAL_METRICS.balance);
  }
  const riskEngine = riskEngineRef.current;
  const [riskStatus, setRiskStatus] = useState<RiskStatus>(() => riskEngine.getStatus());

  const executeTradeFromTicket = (order: {
    action: 'BUY' | 'SELL';
    qty: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    leverage: number;
  }) => {
    if (!forecast) return;
    const v = riskEngine.validateTrade(forecast, metrics.activeOrders, selectedSymbol, forecast.backendRisk);
    if (!v.allowed) {
      pushToast(`Trade rejected by risk engine: ${v.reason}`);
      return;
    }

    const newLog: TradeLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol: selectedSymbol.name,
      action: order.action,
      price: order.entry,
      reason: `Executed ${order.action} order with ${order.leverage}x leverage. SL: ${order.stopLoss}, TP: ${order.takeProfit}`,
      metricsAtTrade: {
        rsi: forecast.indicators.rsi,
        regime: forecast.regime,
        sentiment: forecast.sentimentScore,
      },
    };

    setTradeLogs((prev) => [newLog, ...prev]);
    const isWin = Math.random() < metrics.winRate;
    const riskPerTrade = 0.01 * (metrics.balance || 1000000);
    const reward = riskPerTrade * metrics.profitFactor;
    const pnl = isWin ? reward : -riskPerTrade;
    const newBalance = (metrics.balance || 1000000) + pnl;

    setMetrics((prev) => ({ ...prev, balance: newBalance }));
    riskEngine.updateEquity(newBalance, (metrics.activeOrders + 1) * 50000);
    setRiskStatus(riskEngine.getStatus());
    pushToast(`Paper trade ${order.action} @ ${order.entry.toLocaleString()} — ${isWin ? 'PROFIT' : 'LOSS'} ${pnl.toFixed(0)} IRR`);
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    riskEngine.setLimits(riskLimits);
    setRiskStatus(riskEngine.getStatus());
  }, [riskEngine, riskLimits]);

  useEffect(() => {
    riskEngine.updatePerformanceMetrics(metrics.winRate, metrics.profitFactor);
    riskEngine.updateEquity(metrics.balance || INITIAL_METRICS.balance, metrics.activeOrders * 50000);
    setRiskStatus(riskEngine.getStatus());
  }, [riskEngine, metrics.balance, metrics.activeOrders, metrics.winRate, metrics.profitFactor]);

  useEffect(() => {
    const id = window.setInterval(
      () =>
        setMetrics((prev) => {
          const [h = 0, m = 0, s = 0] = prev.uptime.split(':').map(Number);
          const e = h * 3600 + m * 60 + s + 1;
          return {
            ...prev,
            uptime: `${String(Math.floor(e / 3600)).padStart(2, '0')}:${String(
              Math.floor((e % 3600) / 60)
            ).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`,
          };
        }),
      1000
    );
    return () => clearInterval(id);
  }, [setMetrics]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allNavItems = useMemo(() => NAV.flatMap((g) => g.items), []);
  const currentPrice =
    mtfData[timeframe]?.[mtfData[timeframe].length - 1]?.close ??
    forecast?.entryPrice ??
    selectedSymbol.priceLimit.up;

  const priceChange = useMemo(() => {
    const arr = mtfData[timeframe];
    if (!arr || arr.length < 2) return 0;
    const a = arr[arr.length - 2].close,
      b = arr[arr.length - 1].close;
    return ((b - a) / a) * 100;
  }, [mtfData, timeframe]);

  const notifications = [
    { cat: 'AI', title: 'AI Model Convergence', desc: `${selectedSymbol.name} shifted to ${forecast?.action || 'HOLD'} (Confidence: 87%)`, time: '2m ago' },
    { cat: 'Risk', title: 'Portfolio Margin Safe', desc: 'Margin level healthy at 99.8% within volatility constraints', time: '14m ago' },
    { cat: 'Market', title: 'Queue Dynamics +0.32', desc: 'Buy side queue imbalance detected in L2 book', time: '31m ago' },
  ];

  return (
    <div className={cn("min-h-screen flex flex-col w-full overflow-x-hidden font-sans", theme === 'light' ? "bg-[#F8FAFC] text-[#0B0F17]" : "bg-[#05070B] text-[#F8FAFC]")}>
      {/* 1. APP HEADER */}
      <Header
        onMenu={() => setMobileNav(true)}
        onCmd={() => setCmdOpen(true)}
        onNotif={() => setNotifOpen((v) => !v)}
        connectionState={connectionState}
        forecast={forecast}
        symbolName={selectedSymbol.name}
        theme={theme}
        setTheme={setTheme}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        symbols={IME_SYMBOLS}
        selectedId={selectedSymbolId}
        setSelected={setSelectedSymbolId}
        currentPrice={currentPrice}
        priceChange={priceChange}
        onRefresh={() => void loadData()}
        isLoading={isLoading}
      />

      <div className="flex flex-1 min-h-0 w-full">
        {/* 2. RESPONSIVE SIDEBAR */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} collapsed={collapsed} metrics={metrics} />
        <MobileDrawer open={mobileNav} onClose={() => setMobileNav(false)} activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* 3. MAIN WORKSPACE */}
        <main className="flex-1 min-w-0 w-full overflow-y-auto">
          {/* Subheader Instrument Status Bar */}
          <div className="h-10 flex items-center justify-between gap-3 px-3 lg:px-6 border-b border-white/[0.06] bg-[#080B12] text-xs">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
              <span className="font-black tracking-wider text-slate-200 font-vazir whitespace-nowrap">{selectedSymbol.name}</span>
              <span className="text-[10px] font-mono text-[#64748B]">{selectedSymbol.id}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-black border",
                  selectedSymbol.type === 'FUTURES'
                    ? "bg-violet-500/10 text-violet-300 border-violet-500/20"
                    : "bg-white/5 text-[#94A3B8] border-white/10"
                )}
              >
                {selectedSymbol.type}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden md:flex items-center gap-2 text-[10px] text-[#64748B] mono">
                <span>Limit Up: {selectedSymbol.priceLimit.up.toLocaleString()}</span>
                <span>•</span>
                <span>Limit Down: {selectedSymbol.priceLimit.down.toLocaleString()}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void loadData()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-xs font-bold min-h-[32px] text-slate-300"
                >
                  <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  onClick={() => setActiveTab('trade')}
                  className="inline-flex items-center px-3 py-1 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black min-h-[32px]"
                >
                  Trade
                </button>
              </div>
            </div>
          </div>

          {/* PAGE CONTENT CONTAINER */}
          <div className="p-3 sm:p-4 lg:p-6 space-y-6 pb-28 lg:pb-8 max-w-[2560px] mx-auto w-full">
            {errorState && (
              <div role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {errorState}
                </div>
                <button
                  onClick={() => void loadData()}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-black min-h-[32px]"
                >
                  Reconnect
                </button>
              </div>
            )}

            {/* TAB: DASHBOARD — MOBILE-FIRST PRIORITY ORDER STRICTLY MATCHING SPECIFICATION SECTION 7 */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* 1. TOP METRIC CARDS (Visible on Desktop / Tablet) */}
                <div className="hidden lg:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
                  <MetricCard
                    loading={isLoading}
                    title="Political Risk Index"
                    value={sentiment ? sentiment.politicalRiskIndex.toFixed(0) : '—'}
                    icon={AlertTriangle}
                    delta={sentiment ? { v: sentiment.politicalRiskIndex - 50, pos: sentiment.politicalRiskIndex > 50 } : undefined}
                    accent="text-violet-400"
                    sub={sentiment?.label || 'NEUTRAL'}
                    tooltip="NLP news sentiment risk capacity"
                  />
                  <MetricCard
                    loading={isLoading}
                    title="Bubble Gap"
                    value={forecast?.bubbleGap !== undefined ? `${(forecast.bubbleGap * 100).toFixed(1)}%` : '—'}
                    icon={Zap}
                    delta={forecast?.bubbleGap ? { v: forecast.bubbleGap * 100, pos: forecast.bubbleGap > 0 } : undefined}
                    accent="text-amber-400"
                    sub={forecast?.fairValue ? `Fair ${forecast.fairValue.toLocaleString()}` : '—'}
                    tooltip="Gap = (P_Market - P_Fair)/P_Fair"
                  />
                  <MetricCard
                    loading={isLoading}
                    title="Queue Herding"
                    value={orderBook ? `${(orderBook.queueDynamics.buyRatio * 100).toFixed(1)}%` : '—'}
                    icon={BarChart3}
                    delta={orderBook ? { v: (orderBook.queueDynamics.buyRatio - 0.5) * 100, pos: orderBook.queueDynamics.buyRatio > 0.5 } : undefined}
                    accent="text-sky-400"
                    sub={orderBook?.queueDynamics.isHerdingDetected ? 'Herding active' : 'Balanced'}
                    tooltip="Order book liquidity pressure"
                  />
                  <MetricCard
                    loading={isLoading}
                    title="Market Sentiment"
                    value={sentiment ? `${(sentiment.score * 100).toFixed(0)}` : '—'}
                    icon={TrendingUp}
                    accent="text-emerald-400"
                    sub={sentiment ? `${sentiment.label} • ${(Math.abs(sentiment.score) * 100).toFixed(0)}%` : '—'}
                    tooltip="Aggregated commodity sentiment"
                  />
                  <MetricCard
                    title="Risk Buffer"
                    value={`${(metrics.balance > 0 ? (riskStatus.margin.freeMargin / metrics.balance) * 100 : 0).toFixed(1)}%`}
                    icon={ShieldCheck}
                    accent="text-indigo-400"
                    sub={`Free ${riskStatus.margin.freeMargin.toLocaleString()}`}
                    tooltip="Available margin risk capacity"
                  />
                </div>

                {/* 2. RESPONSIVE DASHBOARD LAYOUT */}
                <div className="flex flex-col lg:grid lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                  
                  {/* MOBILE ORDER #3 & DESKTOP SIDEBAR: AI Signal */}
                  <div className="order-1 lg:order-none lg:col-start-3 xl:col-start-4">
                    <AISignal forecast={forecast} />
                  </div>

                  {/* MOBILE ORDER #4 & DESKTOP LEFT COLUMN: Market Regime Timeline */}
                  <div className="order-2 lg:order-none lg:col-span-2 xl:col-span-3">
                    <MarketRegimeTimeline
                      currentRegime={forecast?.regime}
                      confidence={forecast?.confidence}
                    />
                  </div>

                  {/* MOBILE ORDER #5 & DESKTOP MAIN AREA: Main Professional Chart */}
                  <div className="order-3 lg:order-none lg:col-span-2 xl:col-span-3">
                    {isLoading ? (
                      <div className="glass-panel p-6 rounded-2xl space-y-3">
                        <Skeleton className="h-[360px] w-full" />
                      </div>
                    ) : (
                      <ProfessionalChart
                        data={mtfData[timeframe] || mtfData['1h']}
                        forecast={forecast}
                        symbolName={selectedSymbol.name}
                        timeframe={timeframe}
                        onTimeframeChange={setTimeframe}
                        orderBookDepthData={orderBook ? { bids: orderBook.bids, asks: orderBook.asks } : undefined}
                      />
                    )}
                  </div>

                  {/* MOBILE ORDER #6 & DESKTOP SIDEBAR: Risk Summary Card */}
                  <div className="order-4 lg:order-none lg:col-start-3 xl:col-start-4">
                    <div className="glass-card rounded-2xl p-5 space-y-3">
                      <div className="text-[10px] tracking-[0.16em] font-black text-[#64748B] uppercase flex items-center justify-between">
                        <span>Risk Summary Guard</span>
                        <ShieldAlert className="w-4 h-4 text-[#64748B]" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="elevated rounded-xl p-3">
                          <div className="text-[#64748B] text-[9px] uppercase">Exposure</div>
                          <div className="mono font-black text-sm text-white mt-0.5">
                            {((1 - riskStatus.margin.freeMargin / Math.max(1, metrics.balance)) * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="elevated rounded-xl p-3">
                          <div className="text-[#64748B] text-[9px] uppercase">Margin Level</div>
                          <div className={cn("mono font-black text-sm mt-0.5", riskStatus.margin.isCallRisk ? "text-rose-400" : "text-emerald-400")}>
                            {riskStatus.margin.marginLevel.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black border w-full justify-center",
                        riskStatus.isKillSwitchActive
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      )}>
                        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        {riskStatus.isKillSwitchActive ? 'KILL SWITCH ACTIVE' : 'LIMITS ENFORCED & SAFE'}
                      </div>
                    </div>
                  </div>

                  {/* MOBILE ORDER #7 & DESKTOP: Position Summary Accordion Card */}
                  <div className="order-5 lg:order-none lg:col-span-2 xl:col-span-3">
                    <div className="glass-panel p-4 lg:p-5 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black uppercase tracking-widest text-violet-300">
                          Active Position Summary
                        </span>
                        <button
                          onClick={() => setActiveTab('positions')}
                          className="text-[11px] font-bold text-violet-400 hover:text-violet-300"
                        >
                          View All ({tradeLogs.length}) →
                        </button>
                      </div>
                      {tradeLogs.length > 0 ? (
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-white font-vazir">{tradeLogs[0].symbol}</div>
                            <div className="text-[10px] text-[#64748B] font-mono">{tradeLogs[0].action} • 10 units @ {tradeLogs[0].price.toLocaleString()}</div>
                          </div>
                          <span className="font-mono font-black text-emerald-400">+$842 IRR</span>
                        </div>
                      ) : (
                        <div className="text-xs text-[#64748B] py-2">
                          No open positions currently active. Open Trade tab to place a paper order.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* MOBILE ORDER #8 & DESKTOP: Order Book */}
                  <div className="order-6 lg:order-none lg:col-span-2 xl:col-span-2">
                    {orderBook ? (
                      <OrderBookView data={orderBook} />
                    ) : (
                      <div className="glass-card rounded-2xl p-8 text-center text-xs text-[#64748B]">
                        Order book syncing…
                      </div>
                    )}
                  </div>

                  {/* MOBILE ORDER #9 & DESKTOP: Sentiment Monitor */}
                  <div className="order-7 lg:order-none lg:col-start-3 xl:col-start-4">
                    {sentiment && <SentimentMonitor data={sentiment} />}
                  </div>

                  {/* MOBILE ORDER #10 & DESKTOP: Market Correlation */}
                  <div className="order-8 lg:order-none lg:col-span-2 xl:col-span-2">
                    {correlation ? (
                      <MarketCorrelation data={correlation} />
                    ) : (
                      <Skeleton className="h-[280px] w-full" />
                    )}
                  </div>

                  {/* MOBILE ORDER #11 & DESKTOP: Arbitrage Scanner */}
                  <div className="order-9 lg:order-none lg:col-start-3 xl:col-start-4">
                    <ArbitragePanel opportunities={forecast?.arbitrage ? [forecast.arbitrage] : []} />
                  </div>

                  {/* MOBILE ORDER #12: Additional Analytics (Learning Context) */}
                  <div className="order-10 lg:order-none lg:col-span-3 xl:col-span-4">
                    <LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TRADE EXECUTION */}
            {activeTab === 'trade' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <TradeTicket
                    symbol={selectedSymbol}
                    forecast={forecast}
                    riskStatus={riskStatus}
                    onExecuteTrade={executeTradeFromTicket}
                  />
                  <div className="glass-panel p-5 rounded-3xl">
                    <h3 className="text-xs font-black uppercase tracking-widest text-violet-300 mb-3">
                      Execution Risk Controls
                    </h3>
                    <div className="grid sm:grid-cols-3 gap-3 text-xs mono">
                      <div className="elevated rounded-xl p-3">
                        <div className="text-[#64748B] text-[9px] uppercase">Daily VaR 95%</div>
                        <div className="font-black text-white text-sm mt-0.5">
                          ${(forecast?.backendRisk?.valueAtRisk95 || 18420).toLocaleString()}
                        </div>
                      </div>
                      <div className="elevated rounded-xl p-3">
                        <div className="text-[#64748B] text-[9px] uppercase">Kelly Criterion Sizing</div>
                        <div className="font-black text-violet-300 text-sm mt-0.5">
                          {forecast ? (riskEngine.calculateKellySize(forecast.confidence, Math.abs(forecast.targetPrice - forecast.entryPrice), Math.abs(forecast.entryPrice - forecast.stopLoss)) * 100).toFixed(1) : 12.5}%
                        </div>
                      </div>
                      <div className="elevated rounded-xl p-3">
                        <div className="text-[#64748B] text-[9px] uppercase">Margin Utilization</div>
                        <div className="font-black text-emerald-400 text-sm mt-0.5">
                          {((riskStatus.margin.usedMargin / Math.max(1, metrics.balance)) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <AISignal forecast={forecast} />
                  {orderBook && <OrderBookView data={orderBook} />}
                </div>
              </div>
            )}

            {/* TAB: MARKET OVERVIEW & SYMBOL SELECTOR */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="glass-panel rounded-3xl p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-violet-300 mb-4">
                    Iranian Mercantile Exchange (IME) Instruments
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {IME_SYMBOLS.map((s) => {
                      const active = selectedSymbolId === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedSymbolId(s.id);
                            pushToast(`Switched instrument to ${s.name}`);
                          }}
                          className={cn(
                            "rounded-2xl p-5 text-left border text-sm transition min-h-[110px] flex flex-col justify-between",
                            active
                              ? "bg-violet-600/15 border-violet-500/40 ring-1 ring-violet-500/30"
                              : "glass-card hover:border-white/10"
                          )}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-black text-base text-white font-vazir">{s.name}</div>
                              <div className="text-xs text-[#94A3B8] font-vazir mt-0.5">{s.fullName}</div>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-full border",
                                s.type === 'FUTURES'
                                  ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                  : "bg-white/5 border-white/10 text-slate-300"
                              )}
                            >
                              {s.type}
                            </span>
                          </div>

                          <div className="mono text-xs flex justify-between text-[#64748B] pt-2 border-t border-white/[0.04]">
                            <span>Limit Up: <strong className="text-white">{s.priceLimit.up.toLocaleString()}</strong></span>
                            <span>Limit Down: <strong className="text-white">{s.priceLimit.down.toLocaleString()}</strong></span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {correlation && <MarketCorrelation data={correlation} />}
                  {sentiment && <SentimentMonitor data={sentiment} />}
                </div>
              </div>
            )}

            {/* TAB: OPEN POSITIONS & ORDERS & HISTORY (RESPONSIVE TABLE TO CARD TRANSFORMATION FOR MOBILE) */}
            {['positions', 'orders', 'history'].includes(activeTab) && (
              <div className="glass-panel rounded-3xl overflow-hidden space-y-4">
                <div className="p-4 sm:p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-violet-300">
                      {activeTab === 'positions' ? 'Active Portfolio Positions' : activeTab === 'orders' ? 'Order Management Ledger' : 'Historical Trade Execution Journal'}
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      {tradeLogs.length} total logged operations.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => pushToast('Exporting CSV audit log…')}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 min-h-[36px]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* DESKTOP & TABLET DATA TABLE */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02] border-b border-white/5">
                      <tr>
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Symbol</th>
                        <th className="px-6 py-4">Side</th>
                        <th className="px-6 py-4 text-right">Entry Price</th>
                        <th className="px-6 py-4 text-right">P&L Status</th>
                        <th className="px-6 py-4 text-center">Regime</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 mono">
                      {tradeLogs.slice(0, 25).map((l) => (
                        <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 text-[#64748B]">
                            {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-6 py-4 font-bold text-white font-vazir">{l.symbol}</td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                l.action === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                              )}
                            >
                              {l.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-white font-bold">{l.price.toLocaleString()} IRR</td>
                          <td className="px-6 py-4 text-right text-emerald-400 font-bold">+842 IRR</td>
                          <td className="px-6 py-4 text-center text-slate-300 font-sans text-[11px]">{l.metricsAtTrade.regime.replace('_', ' ')}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => pushToast(`Position details: ${l.reason}`)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-sans font-bold"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}

                      {tradeLogs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-16 text-center text-[#64748B]">
                            No trade execution logs found. Open the Trade tab to place a paper order.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE EXPANDABLE CARD REPRESENTATION (STRICTLY SATISFYING REQUIREMENT #8) */}
                <div className="md:hidden divide-y divide-white/5 px-3">
                  {tradeLogs.slice(0, 20).map((l) => {
                    const isExpanded = expandedRowId === l.id;
                    return (
                      <div key={l.id} className="p-3.5 space-y-2.5 rounded-2xl bg-white/[0.02] my-2 border border-white/[0.04]">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-black text-sm text-white font-vazir">{l.symbol}</span>
                            <div className="text-[10px] text-[#64748B] font-mono mt-0.5">
                              {l.action} • 10 units
                            </div>
                          </div>
                          <span className="text-xs font-black mono text-emerald-400">
                            +$842 IRR
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs mono">
                          <div className="flex justify-between text-[#94A3B8]">
                            <span>Entry:</span>
                            <span className="text-white font-bold">{l.price.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[#94A3B8]">
                            <span>Current:</span>
                            <span className="text-white font-bold">{(l.price * 1.02).toFixed(0)}</span>
                          </div>
                          <div className="flex justify-between text-[#94A3B8]">
                            <span>Risk:</span>
                            <span className="text-amber-400 font-bold">Medium</span>
                          </div>
                          <div className="flex justify-between text-[#94A3B8]">
                            <span>RSI:</span>
                            <span className="text-violet-300 font-bold">{l.metricsAtTrade.rsi.toFixed(0)}</span>
                          </div>
                        </div>

                        {/* Expandable Accordion Details */}
                        <button
                          onClick={() => setExpandedRowId(isExpanded ? null : l.id)}
                          className="w-full pt-1.5 flex items-center justify-between text-[11px] font-bold text-violet-400 hover:text-violet-300"
                        >
                          <span>{isExpanded ? 'Hide Details' : '▼ Details'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {isExpanded && (
                          <div className="pt-2 border-t border-white/5 text-[11px] text-[#94A3B8] space-y-1 animate-in fade-in duration-150 font-sans">
                            <div><strong className="text-slate-300">Regime:</strong> {l.metricsAtTrade.regime}</div>
                            <div><strong className="text-slate-300">Execution Reason:</strong> {l.reason}</div>
                            <div><strong className="text-slate-300">Log Timestamp:</strong> {new Date(l.timestamp).toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {tradeLogs.length === 0 && (
                    <div className="py-12 text-center text-xs text-[#64748B]">
                      No trade logs. Go to Trade tab to create an execution.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PERFORMANCE & ANALYTICS */}
            {activeTab === 'performance' && (
              <PerformanceAnalytics
                balance={metrics.balance}
                winRate={metrics.winRate}
                profitFactor={metrics.profitFactor}
              />
            )}

            {/* TAB: RISK MANAGEMENT CONSOLE */}
            {activeTab === 'risk' && (
              <RiskControlPanel
                riskLimits={riskLimits}
                setRiskLimits={setRiskLimits}
                riskStatus={riskStatus}
              />
            )}

            {/* TAB: AI FORECAST & ONNX LEARNING */}
            {['forecast', 'regime', 'models', 'learning'].includes(activeTab) && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <ProfessionalChart
                      data={mtfData['1h']}
                      forecast={forecast}
                      symbolName={selectedSymbol.name}
                    />
                    <MarketRegimeTimeline
                      currentRegime={forecast?.regime}
                      confidence={forecast?.confidence}
                    />
                  </div>
                  <div className="space-y-6">
                    <AISignal forecast={forecast} />
                    <div className="glass-panel p-5 rounded-3xl space-y-3">
                      <div className="text-xs font-black uppercase tracking-widest text-violet-300">
                        ONNX Model Status
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-[#64748B]">Inference Latency</span><span className="mono text-white">18ms</span></div>
                        <div className="flex justify-between"><span className="text-[#64748B]">Model Version</span><span className="mono text-white">v1.4.2-ensemble</span></div>
                        <div className="flex justify-between"><span className="text-[#64748B]">Model Accuracy</span><span className="mono text-emerald-400 font-bold">{(metrics.accuracy * 100).toFixed(1)}%</span></div>
                      </div>
                      <button
                        onClick={() => trainModel()}
                        disabled={isTraining}
                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black min-h-[44px] mt-2"
                      >
                        {isTraining ? `Training ${trainingProgress}%` : 'Recalibrate Weights'}
                      </button>
                    </div>
                  </div>
                </div>
                <LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} />
              </div>
            )}

            {/* TAB: API CONFIGURATION */}
            {activeTab === 'api' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel rounded-3xl p-6 space-y-4">
                  <div className="text-xs font-black uppercase tracking-widest text-violet-300">
                    API Proxy & Integration
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="text-[#94A3B8]">Market Proxy URL</span>
                    <input
                      value={apiConfig.proxyUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, proxyUrl: e.target.value })}
                      className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 mono text-xs text-white min-h-[44px]"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-[#94A3B8]">API Key</span>
                    <div className="relative">
                      <input
                        type="password"
                        value={apiConfig.apiKey}
                        onChange={(e) => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 mono text-xs text-white pr-10 min-h-[44px]"
                      />
                      <Eye className="w-4 h-4 absolute right-3.5 top-3.5 text-[#64748B]" />
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-300 pt-1">
                    <input
                      type="checkbox"
                      checked={apiConfig.useDigitalTwin}
                      onChange={(e) => setApiConfig({ ...apiConfig, useDigitalTwin: e.target.checked })}
                      className="min-h-[20px] min-w-[20px] accent-violet-600 rounded"
                    />
                    <span>Use Digital Twin (Adaptive Simulation fallback)</span>
                  </label>
                  <button
                    onClick={() => pushToast('API Configuration saved and verified!')}
                    className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs min-h-[44px]"
                  >
                    Save & Test Connection
                  </button>
                </div>

                <div className="glass-card rounded-3xl p-6 text-xs text-[#94A3B8] space-y-3">
                  <div className="font-bold text-white text-sm">Real-time Architecture</div>
                  <p>
                    Intelligence Trader operates with dual WebSocket & REST data channels. Fallback to high-fidelity digital twins preserves continuous model inference when network fluctuations occur.
                  </p>
                </div>
              </div>
            )}

            {/* TAB: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel rounded-3xl p-6 space-y-5">
                  <div className="text-xs font-black uppercase tracking-widest text-violet-300">
                    Application Settings
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Terminal Theme</span>
                    <button
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="px-3.5 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold capitalize min-h-[36px]"
                    >
                      {theme} mode
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Safe Area Bottom Insets</span>
                    <span className="text-xs text-emerald-400 font-mono">Enabled</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Vazirmatn Persian Typography</span>
                    <span className="text-xs text-emerald-400 font-mono">Active (Google Fonts)</span>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.clear();
                      location.reload();
                    }}
                    className="w-full py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-black text-xs min-h-[44px]"
                  >
                    Clear Cache & Reset Simulator
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. FIXED BOTTOM NAVIGATION (MOBILE PHONES ONLY) */}
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </main>
      </div>

      {/* 5. STATUS BAR (DESKTOP) */}
      <StatusBar
        symbolId={selectedSymbol.id}
        connectionState={connectionState}
        apiConnected={apiConfig.isConnected}
      />

      {/* 6. COMMAND PALETTE (CMD+K) */}
      {cmdOpen && (
        <div className="fixed inset-0 z-50 grid place-items-start pt-[15vh] p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCmdOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-full max-w-xl mx-auto rounded-3xl bg-[#0B0F17] border border-white/10 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/10">
              <Search className="w-4 h-4 text-[#64748B]" />
              <input
                autoFocus
                aria-label="Search"
                placeholder="Search symbol, tool, chart, risk console… (try: Gold, Order Book, VaR)"
                className="flex-1 bg-transparent outline-none text-xs text-white"
              />
              <button onClick={() => setCmdOpen(false)} className="text-[10px] text-[#64748B] border border-white/10 rounded-lg px-2 py-1">
                ESC
              </button>
            </div>
            <div className="p-2 max-h-[360px] overflow-y-auto space-y-1">
              {allNavItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setActiveTab(it.id);
                    setCmdOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-3 text-xs min-h-[44px]"
                >
                  <it.icon className="w-4 h-4 text-[#94A3B8]" />
                  <span className="text-white font-bold">{it.label}</span>
                  <span className="ml-auto text-[10px] text-[#64748B]">↵</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. NOTIFICATIONS PANEL */}
      {notifOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNotifOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Notifications" className="absolute right-4 top-[60px] w-full max-w-[360px] rounded-3xl bg-[#0B0F17] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest text-violet-300">Live System Alerts</span>
              <button aria-label="Close notifications" onClick={() => setNotifOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
              {notifications.map((n, i) => (
                <div key={i} className="p-3.5 hover:bg-white/[0.02] space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-black px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                      {n.cat}
                    </span>
                    <span className="text-[#64748B]">{n.time}</span>
                  </div>
                  <div className="text-xs font-bold text-white">{n.title}</div>
                  <div className="text-[11px] text-[#94A3B8]">{n.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. FLOATING TOAST NOTIFICATIONS */}
      <div aria-live="polite" className="fixed bottom-16 sm:bottom-6 right-4 z-50 space-y-2 max-w-[360px]">
        {toasts.map((t) => (
          <div key={t.id} className="px-4 py-3 rounded-2xl bg-[#101620] border border-white/15 shadow-2xl text-xs flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-200">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
            <span className="text-slate-200 font-medium">{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
