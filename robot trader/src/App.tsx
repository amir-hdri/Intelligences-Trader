import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { IME_SYMBOLS, DEFAULT_API_CONFIG, INITIAL_METRICS, DEFAULT_RISK_LIMITS } from './constants';
import type { ApiConfig, SystemMetrics, TradeLogEntry, RiskLimits, RiskStatus, TimeFrame, MarketRegime } from './types';
import { DEFAULT_WEIGHTS } from './dataUtils';
import { RiskEngine } from './riskEngine';
import { useMarketData } from './hooks/useMarketData';
import { useWebSocket } from './hooks/useWebSocket';
import { useLocalStorage } from './hooks/useLocalStorage';
import WalkForwardChart from './components/charts/WalkForwardChart';
import { OrderBook as OrderBookView } from './components/analytics/OrderBook';
import { MarketCorrelation } from './components/analytics/MarketCorrelation';
import { SentimentMonitor } from './components/analytics/SentimentMonitor';
import { ArbitragePanel } from './components/analytics/ArbitragePanel';
import { LearningDashboard } from './components/analytics/LearningDashboard';
import {
 LayoutDashboard, Layers, Database, BrainCircuit, ShieldAlert, History, Activity, Settings, Search, Bell, ChevronDown, Menu, X, TrendingUp, TrendingDown, Minus, Zap, ShieldCheck, BarChart3, Target, AlertTriangle, Cpu, Globe, ArrowUpRight, ArrowDownRight, Command, Maximize2, RefreshCw
} from 'lucide-react';

// -- Design helpers
const cn=(...c:(string|false|undefined)[])=>c.filter(Boolean).join(' ');

type NavGroup={label:string; items:{id:string; label:string; icon:any}[]};
const NAV:NavGroup[]=[
 {label:'Overview',items:[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard}]},
 {label:'Market Intelligence',items:[{id:'intelligence',label:'Intelligence Hub',icon:Layers},{id:'overview',label:'Market Overview',icon:Globe},{id:'orderbook',label:'Order Book',icon:BarChart3},{id:'correlations',label:'Correlations',icon:TrendingUp},{id:'sentiment',label:'Sentiment',icon:BrainCircuit},{id:'arbitrage',label:'Arbitrage',icon:Zap}]},
 {label:'Trading',items:[{id:'trade',label:'Trade',icon:Target},{id:'positions',label:'Positions',icon:ShieldCheck},{id:'orders',label:'Orders',icon:BarChart3},{id:'history',label:'Trade History',icon:History}]},
 {label:'AI / ML',items:[{id:'forecast',label:'AI Forecast',icon:BrainCircuit},{id:'regime',label:'Market Regime',icon:Activity},{id:'models',label:'Model Performance',icon:Cpu},{id:'learning',label:'Learning Dashboard',icon:TrendingUp}]},
 {label:'Analytics',items:[{id:'performance',label:'Performance',icon:BarChart3},{id:'risk',label:'Risk Analytics',icon:ShieldAlert},{id:'backtest',label:'Backtesting',icon:History}]},
 {label:'Data',items:[{id:'livedata',label:'Live Data',icon:Database},{id:'historical',label:'Historical Data',icon:Database},{id:'explorer',label:'Data Explorer',icon:Search}]},
 {label:'System',items:[{id:'monitoring',label:'System Health',icon:Activity},{id:'api',label:'API Configuration',icon:Settings},{id:'settings',label:'Settings',icon:Settings}]},
];

function MetricCard({title,value,sub,icon:Icon,delta,accent}:{title:string;value:string;sub?:string;icon:any;delta?:{v:number;pos:boolean};accent?:string}){
 return <div className="glass-card rounded-2xl p-4 flex flex-col gap-3 hover:border-white/10 transition-colors">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.16em] font-bold text-[#64748B] uppercase">{title}</span><Icon className={cn("w-4 h-4",accent||"text-[#94A3B8]")} /></div>
  <div className="flex items-baseline gap-2"><span className="text-[22px] font-black tracking-tighter mono text-white">{value}</span>{delta&&<span className={cn("text-xs font-bold inline-flex items-center gap-1",delta.pos?"text-[#22C55E]":"text-[#EF4444]")}>{delta.pos?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}{delta.v>0?'+':''}{delta.v.toFixed(1)}%</span>}</div>
  {sub&&<div className="text-[11px] text-[#64748B]">{sub}</div>}
  <div className="h-[28px] flex items-end gap-[2px] opacity-60">{Array.from({length:18}).map((_,i)=><div key={i} className="flex-1 rounded-sm bg-white/10" style={{height: 8+Math.random()*18}} />)}</div>
 </div>
}

function AISignal({forecast}:{forecast:any}){
 if(!forecast) return <div className="glass-card rounded-2xl p-6 text-center text-sm text-[#64748B]">No AI signal — loading market analysis…</div>;
 const isBuy=forecast.action==='BUY', isSell=forecast.action==='SELL';
 const color=isBuy?'text-[#22C55E]':isSell?'text-[#EF4444]':'text-[#94A3B8]';
 const badge=isBuy?'BUY':isSell?'SELL':'HOLD';
 return <div className="glass-card rounded-2xl p-5 space-y-4">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.18em] font-black text-[#8B5CF6] uppercase">AI Market Signal</span><span className="text-[10px] font-mono text-[#64748B]">{new Date().toLocaleTimeString()}</span></div>
  <div className={cn("text-3xl font-black tracking-tighter",color)}>{badge}</div>
  <div className="grid grid-cols-2 gap-3 text-xs">
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Confidence</div><div className="text-white font-black text-lg mono">{(forecast.confidence*100).toFixed(1)}%</div><div className="h-1.5 bg-white/10 rounded-full mt-2"><div className="h-full bg-[#8B5CF6] rounded-full" style={{width:`${forecast.confidence*100}%`}}/></div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Market Regime</div><div className="text-white font-bold text-xs mt-1">{forecast.regime.replace('_',' ')}</div><div className="text-[#64748B] text-[11px] mt-1">Exp. {(forecast.bubbleGap? (forecast.bubbleGap*100).toFixed(1):'—')}%</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Expected Return</div><div className="text-[#22C55E] font-black mono">+{(Math.abs(forecast.targetPrice-forecast.entryPrice)/forecast.entryPrice*100).toFixed(2)}%</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Risk</div><div className={cn("font-black",forecast.confidence>0.8?"text-[#22C55E]":forecast.confidence>0.55?"text-[#F59E0B]":"text-[#EF4444]")}>{forecast.confidence>0.8?'LOW':forecast.confidence>0.55?'MEDIUM':'HIGH'}</div></div>
  </div>
  <div className="text-[11px] leading-relaxed text-[#94A3B8] bg-[#0B0F17] rounded-xl p-3 border border-white/[0.06]">{forecast.reason}</div>
  <div className="grid grid-cols-3 gap-2 text-[11px] mono">
    <div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Entry</div><div className="font-bold text-white">{forecast.entryPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Target</div><div className="font-bold text-[#22C55E]">{forecast.targetPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Stop</div><div className="font-bold text-[#EF4444]">{forecast.stopLoss.toLocaleString()}</div></div>
  </div>
  <p className="text-[10px] text-[#64748B]">AI recommendation — not guaranteed. Model confidence indicates estimated probability.</p>
 </div>
}

export default function App(){
 const [activeTab,setActiveTab]=useState('dashboard');
 const [mobileNav,setMobileNav]=useState(false);
 const [collapsed,setCollapsed]=useState(false);
 const [cmdOpen,setCmdOpen]=useState(false);
 const [selectedSymbolId,setSelectedSymbolId]=useLocalStorage<string>('selectedSymbolId',IME_SYMBOLS[0].id);
 const [apiConfig,setApiConfig]=useLocalStorage<ApiConfig>('apiConfig',DEFAULT_API_CONFIG);
 const [metrics,setMetrics]=useLocalStorage<SystemMetrics>('metrics',INITIAL_METRICS);
 const [riskLimits,setRiskLimits]=useLocalStorage<RiskLimits>('riskLimits',DEFAULT_RISK_LIMITS);
 const [tradeLogs,setTradeLogs]=useLocalStorage<TradeLogEntry[]>('tradeLogs',[]);
 const [timeframe,setTimeframe]=useState<TimeFrame>('1h');
 const [showConfirm,setShowConfirm]=useState(false);
 const [toasts,setToasts]=useState<{id:string;msg:string}[]>([]);
 const pushToast=(msg:string)=>{const id=Math.random().toString(36).slice(2); setToasts(t=>[...t,{id,msg}]); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),2500)};

 const {mtfData,orderBook,setOrderBook,correlation,sentiment,forecast,isLoading,errorState,isTraining,trainingProgress,loadData,trainModel,selectedSymbol}=useMarketData(selectedSymbolId,apiConfig,setMetrics);
 const handlePriceUpdate=useCallback((price:number)=>setMetrics(prev=>({...prev,lastPrice:price} as any)),[setMetrics]);
 const {connectionState}=useWebSocket(selectedSymbolId,setOrderBook,handlePriceUpdate);

 const riskEngineRef=useRef<RiskEngine|null>(null);
 if(!riskEngineRef.current) riskEngineRef.current=new RiskEngine(riskLimits, metrics.balance||INITIAL_METRICS.balance);
 const riskEngine=riskEngineRef.current;
 const [riskStatus,setRiskStatus]=useState<RiskStatus>(()=>riskEngine.getStatus());
 const executeTrade=()=>{
  if(!forecast) return;
  const v=riskEngine.validateTrade(forecast,metrics.activeOrders,selectedSymbol,forecast.backendRisk);
  if(!v.allowed){ pushToast(`Trade rejected: ${v.reason}`); return; }
  setShowConfirm(true);
 };
 const confirmTrade=()=>{
  if(!forecast) return;
  const price=forecast.entryPrice;
  const newLog:TradeLogEntry={id:crypto.randomUUID(),timestamp:Date.now(),symbol:selectedSymbol.name,action:forecast.action,price,reason:forecast.reason,metricsAtTrade:{rsi:forecast.indicators.rsi,regime:forecast.regime,sentiment:forecast.sentimentScore}};
  setTradeLogs(prev=>[newLog,...prev]);
  const isWin=Math.random()<metrics.winRate;
  const riskPerTrade=0.01*(metrics.balance||1000000);
  const reward=riskPerTrade*metrics.profitFactor;
  const pnl=isWin?reward:-riskPerTrade;
  const newBalance=(metrics.balance||1000000)+pnl;
  setMetrics(prev=>({...prev,balance:newBalance}));
  riskEngine.updateEquity(newBalance,metrics.activeOrders*50000);
  setRiskStatus(riskEngine.getStatus());
  setShowConfirm(false);
  pushToast(`Paper trade ${forecast.action} @ ${price.toLocaleString()} — ${isWin?'PROFIT':'LOSS'} ${pnl.toFixed(0)}`);
 };
 useEffect(()=>{void loadData()},[loadData]);
 useEffect(()=>{riskEngine.setLimits(riskLimits); setRiskStatus(riskEngine.getStatus())},[riskEngine,riskLimits]);
 useEffect(()=>{riskEngine.updatePerformanceMetrics(metrics.winRate,metrics.profitFactor); riskEngine.updateEquity(metrics.balance||INITIAL_METRICS.balance,metrics.activeOrders*50000); setRiskStatus(riskEngine.getStatus())},[riskEngine,metrics.balance,metrics.activeOrders,metrics.winRate,metrics.profitFactor]);
 useEffect(()=>{const id=window.setInterval(()=>setMetrics(prev=>{const [h=0,m=0,s=0]=prev.uptime.split(':').map(Number); const e=h*3600+m*60+s+1; return {...prev,uptime:`${String(Math.floor(e/3600)).padStart(2,'0')}:${String(Math.floor((e%3600)/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`}}),1000); return()=>clearInterval(id)},[setMetrics]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault(); setCmdOpen(v=>!v)}}; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)},[]);

 const allNavItems=useMemo(()=>NAV.flatMap(g=>g.items),[]);
 const currentPrice=mtfData[timeframe]?.[mtfData[timeframe].length-1]?.close ?? forecast?.entryPrice ?? selectedSymbol.priceLimit.up;

 // Price change
 const priceChange=useMemo(()=>{const arr=mtfData[timeframe]; if(!arr||arr.length<2) return 0; const a=arr[arr.length-2].close, b=arr[arr.length-1].close; return ((b-a)/a)*100},[mtfData,timeframe]);

 return <div className="min-h-screen flex flex-col bg-[#05070B] text-[#F8FAFC]">
  {/* Top Header */}
  <header className="sticky top-0 z-30 h-[56px] flex items-center gap-3 px-3 lg:px-4 border-b border-white/[0.07] bg-[#0B0F17]/90 backdrop-blur-xl">
   <button onClick={()=>setMobileNav(true)} className="lg:hidden p-2 rounded-xl bg-white/[0.06] border border-white/10"><Menu className="w-5 h-5"/></button>
   <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-lg shadow-violet-500/20"><Zap className="w-4 h-4 text-white"/></div>
    <div className="hidden sm:block"><div className="text-sm font-black tracking-tight leading-none">Intelligence Trader</div><div className="text-[10px] tracking-[0.16em] font-bold text-[#8B5CF6]">IME • AI TERMINAL</div></div>
    <span className="hidden lg:inline-flex ml-2 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest">● LIVE</span>
   </div>
   <div className="flex-1 flex justify-center px-2">
    <div className="hidden md:flex items-center gap-2 w-full max-w-[560px]">
     <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl bg-[#101620] border border-white/[0.07]">
      <Search className="w-4 h-4 text-[#64748B]"/><input placeholder="Search symbols, pages, trades…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#64748B]" onFocus={()=>setCmdOpen(true)} />
      <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold text-[#64748B] border border-white/10 rounded-lg px-1.5 py-1"><Command className="w-3 h-3"/>K</span>
     </div>
     <select value={selectedSymbolId} onChange={e=>setSelectedSymbolId(e.target.value)} className="h-9 rounded-xl bg-[#101620] border border-white/[0.07] px-3 text-sm font-semibold">
      {IME_SYMBOLS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </div>
   </div>
   <div className="flex items-center gap-2">
    <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono">
     <span className={cn("w-2 h-2 rounded-full",connectionState==='connected'?"bg-emerald-500 animate-pulse":connectionState==='connecting'?"bg-amber-500 animate-pulse":"bg-red-500")} />
     <span className="text-[#94A3B8]">{connectionState.toUpperCase()}</span>
     <span className="text-white/20">•</span><span className="text-[#94A3B8]">AI {forecast?'ACTIVE':'IDLE'}</span>
    </div>
    <button onClick={()=>setActiveTab('monitoring')} className="relative p-2 rounded-xl bg-white/[0.06] border border-white/10"><Bell className="w-4 h-4"/><span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full"/></button>
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 grid place-items-center text-xs font-black">AT</div>
    <button onClick={()=>setCollapsed(v=>!v)} className="hidden lg:grid place-items-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10"><ChevronDown className={cn("w-4 h-4 transition",collapsed&&"rotate-180")}/></button>
   </div>
  </header>

  <div className="flex flex-1 min-h-0">
   {/* Sidebar Desktop */}
   <aside className={cn("hidden lg:flex flex-col border-r border-white/[0.07] bg-[#05070B] sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto scrollbar-thin transition-all",collapsed?"w-[64px]":"w-[264px]") }>
    <div className="p-3 space-y-5">
     {NAV.map(group=><div key={group.label}>
      {!collapsed&&<div className="px-2 mb-2 text-[10px] tracking-[0.14em] font-black text-[#64748B] uppercase">{group.label}</div>}
      <div className="space-y-1">
       {group.items.map(it=>{
        const Icon=it.icon; const active=activeTab===it.id;
        return <button key={it.id} onClick={()=>setActiveTab(it.id)} className={cn("w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition border", active?"bg-violet-600/15 border-violet-500/20 text-white":"border-transparent text-[#94A3B8] hover:bg-white/[0.06] hover:text-white")} title={it.label}>
         <Icon className={cn("w-4 h-4 shrink-0",active&&"text-violet-400")} />
         {!collapsed&&<span className="truncate font-semibold">{it.label}</span>}
         {active&&!collapsed&&<span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>}
        </button>
       })}
      </div>
     </div>)}
    </div>
    <div className="mt-auto p-3">
     <div className={cn("rounded-2xl p-3 border", metrics.status==='OPERATIONAL'?"bg-emerald-500/5 border-emerald-500/20":"bg-amber-500/10 border-amber-500/20")}>
      <div className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full animate-pulse", metrics.status==='OPERATIONAL'?"bg-emerald-500":"bg-amber-500")}/><span className="text-xs font-black tracking-widest">{metrics.status.replace('_',' ')}</span></div>
      {!collapsed&&<div className="text-[10px] text-[#64748B] mt-1">Latency {metrics.latency}ms • Uptime {metrics.uptime}</div>}
     </div>
    </div>
   </aside>

   {/* Mobile Drawer */}
   {mobileNav&&<div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setMobileNav(false)}/><div className="absolute inset-y-0 left-0 w-[300px] bg-[#0B0F17] border-r border-white/10 overflow-y-auto p-4">
    <div className="flex items-center justify-between mb-4"><div className="font-black">Intelligence Trader</div><button onClick={()=>setMobileNav(false)} className="p-2 rounded-xl bg-white/10"><X className="w-5 h-5"/></button></div>
    {NAV.map(g=><div key={g.label} className="mb-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-2">{g.label}</div><div className="space-y-1">{g.items.map(it=><button key={it.id} onClick={()=>{setActiveTab(it.id); setMobileNav(false)}} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm",activeTab===it.id?"bg-violet-600 text-white":"text-[#94A3B8]") }><it.icon className="w-4 h-4"/>{it.label}</button>)}</div></div>)}
   </div></div>}

   {/* Main */}
   <main className="flex-1 min-w-0 bg-[#05070B]">
    {/* Price ticker strip */}
    <div className="h-10 flex items-center gap-4 px-3 lg:px-6 border-b border-white/[0.06] bg-[#080B12] overflow-x-auto">
     <div className="flex items-center gap-2 shrink-0"><span className="text-xs font-black tracking-widest">{selectedSymbol.name}</span><span className="text-[11px] text-[#64748B]">{selectedSymbol.id}</span><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black border", selectedSymbol.type==='FUTURES'?"bg-violet-500/10 text-violet-300 border-violet-500/20":"bg-white/5 text-[#94A3B8] border-white/10")}>{selectedSymbol.type}</span></div>
     <div className="flex items-center gap-2 shrink-0"><span className="mono text-sm font-black">{currentPrice.toLocaleString()}</span><span className={cn("inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded",priceChange>=0?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400")}>{priceChange>=0?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{priceChange>=0?'+':''}{priceChange.toFixed(2)}%</span></div>
     <div className="hidden md:flex items-center gap-2 text-[11px] text-[#64748B]"><span>Limit Up {selectedSymbol.priceLimit.up.toLocaleString()}</span><span>•</span><span>Limit Down {selectedSymbol.priceLimit.down.toLocaleString()}</span></div>
     <div className="ml-auto flex items-center gap-2">
      <button onClick={()=>void loadData()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold hover:bg-white/10"><RefreshCw className={cn("w-3.5 h-3.5",isLoading&&"animate-spin")}/>Refresh</button>
      <button onClick={()=>setActiveTab('trade')} className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black">New Order</button>
     </div>
    </div>

    <div className="p-3 lg:p-6 space-y-6">
     {errorState&&<div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between"><div className="flex items-center gap-2 text-amber-300 text-sm"><AlertTriangle className="w-4 h-4"/>{errorState}</div><button onClick={()=>void loadData()} className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-black">Reconnect</button></div>}

     {activeTab==='dashboard'&&<>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
       <MetricCard title="Political Risk Index" value={sentiment?sentiment.politicalRiskIndex.toFixed(0):'50'} icon={AlertTriangle} delta={sentiment?{v:sentiment.politicalRiskIndex-50,pos:sentiment.politicalRiskIndex>50}:undefined} accent="text-violet-400" sub={sentiment?.label||'NEUTRAL'} />
       <MetricCard title="Bubble Gap" value={forecast?.bubbleGap!==undefined?`${(forecast.bubbleGap*100).toFixed(1)}%`:'0.0%'} icon={Zap} delta={forecast?.bubbleGap?{v:forecast.bubbleGap*100,pos:forecast.bubbleGap>0}:undefined} accent="text-amber-400" sub={`Fair ${forecast?.fairValue?.toLocaleString()??'—'}`} />
       <MetricCard title="Queue Herding" value={orderBook?`${(orderBook.queueDynamics.buyRatio*100).toFixed(1)}%`:'—'} icon={BarChart3} delta={orderBook?{v:(orderBook.queueDynamics.buyRatio-0.5)*100,pos:orderBook.queueDynamics.buyRatio>0.5}:undefined} accent="text-sky-400" sub={orderBook?.queueDynamics.isHerdingDetected?'Herding detected':'Balanced'} />
       <MetricCard title="Market Sentiment" value={sentiment?`${(sentiment.score*100).toFixed(0)}`:'0'} icon={BrainCircuit} accent="text-emerald-400" sub={sentiment?`${sentiment.label} • ${sentiment.news.length} events`:'No data'} />
       <MetricCard title="Risk Buffer" value={`${(metrics.balance>0?(riskStatus.margin.freeMargin/metrics.balance)*100:0).toFixed(1)}%`} icon={ShieldCheck} accent="text-indigo-400" sub={`Free ${riskStatus.margin.freeMargin.toLocaleString()}`} />
      </div>

      {/* Main workstation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
       <div className="xl:col-span-2 space-y-4 lg:space-y-6">
        <div className="glass-panel rounded-2xl overflow-hidden">
         <div className="flex flex-wrap items-center justify-between gap-3 p-3 lg:p-4 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2 text-violet-300 font-black tracking-[0.16em] text-xs uppercase"><TrendingUp className="w-4 h-4"/>Intelligence Engine (IME)</div>
          <div className="flex items-center gap-1.5">
           {(['1m','15m','1h','1d'] as TimeFrame[]).map(tf=><button key={tf} onClick={()=>setTimeframe(tf)} className={cn("px-2.5 py-1.5 rounded-lg text-xs font-black border",timeframe===tf?"bg-violet-600 border-violet-500 text-white":"bg-white/[0.06] border-white/10 text-[#94A3B8]")}>{tf}</button>)}
           <button className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10"><Maximize2 className="w-4 h-4 text-[#94A3B8]"/></button>
          </div>
         </div>
         <div className="p-2 lg:p-3">
          <WalkForwardChart data={mtfData[timeframe]||mtfData['1h']} forecast={forecast} />
         </div>
         <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 text-center">
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">RSI</div><div className="mono font-black">{forecast?.indicators.rsi.toFixed(1)??'—'}</div></div>
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">ATR</div><div className="mono font-black">{forecast?.indicators.atr.toFixed(0)??'—'}</div></div>
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Regime</div><div className="font-bold text-xs">{forecast?.regime.replace('_',' ')??'—'}</div></div>
         </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
         {orderBook?<OrderBookView data={orderBook}/>:<div className="glass-card rounded-2xl p-6 text-sm text-[#64748B]">Order book unavailable</div>}
         {correlation?<MarketCorrelation data={correlation}/>:<div className="glass-card rounded-2xl p-6 text-sm text-[#64748B]">Correlation unavailable</div>}
        </div>
       </div>
       <div className="space-y-4">
        <AISignal forecast={forecast}/>
        {sentiment&&<SentimentMonitor data={sentiment}/>}
        <ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} />
        <div className="glass-card rounded-2xl p-4">
         <div className="text-[10px] tracking-[0.16em] font-black text-[#64748B] uppercase mb-3">Risk Control Center</div>
         <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Exposure</div><div className="mono font-black">{((1-riskStatus.margin.freeMargin/Math.max(1,metrics.balance))*100).toFixed(1)}%</div></div>
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Margin Level</div><div className="mono font-black">{riskStatus.margin.marginLevel.toFixed(1)}%</div></div>
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">VaR 95%</div><div className="mono font-black">${(forecast?.backendRisk?.valueAtRisk95??0).toLocaleString()}</div></div>
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Drawdown</div><div className="mono font-black">{riskStatus.currentDailyDrawdown.toFixed(2)}%</div></div>
         </div>
         <div className={cn("mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-black border",riskStatus.isKillSwitchActive?"bg-red-500/10 text-red-400 border-red-500/20":riskStatus.violations.length?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse"/>{riskStatus.isKillSwitchActive?'KILL SWITCH':riskStatus.violations.length?'WARNING':'SAFE'}
         </div>
        </div>
       </div>
      </div>
     </>}

     {activeTab==='overview'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-4"><div className="text-xs font-black tracking-widest text-violet-300 uppercase mb-3">Market Overview</div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{IME_SYMBOLS.map(s=><button key={s.id} onClick={()=>setSelectedSymbolId(s.id)} className={cn("rounded-2xl p-4 text-left border",selectedSymbolId===s.id?"bg-violet-600/15 border-violet-500/30":"glass-card")}><div className="text-xs font-black">{s.name}</div><div className="text-[11px] text-[#94A3B8]">{s.fullName}</div><div className="mono text-xs mt-2">{s.priceLimit.up.toLocaleString()} / {s.priceLimit.down.toLocaleString()}</div></button>)}</div></div>
       <div className="space-y-4">{sentiment&&<SentimentMonitor data={sentiment}/>}{correlation&&<MarketCorrelation data={correlation}/>}</div>
     </div>}

     {activeTab==='orderbook'&&<div className="glass-panel rounded-2xl p-4">{orderBook?<OrderBookView data={orderBook}/>:<div className="text-sm text-[#64748B]">No order book</div>}</div>}
     {activeTab==='correlations'&&<div className="glass-panel rounded-2xl p-4">{correlation?<MarketCorrelation data={correlation}/>:<div className="text-sm text-[#64748B]">No correlation</div>}</div>}
     {activeTab==='sentiment'&&<div className="grid lg:grid-cols-2 gap-4">{sentiment?<SentimentMonitor data={sentiment}/>:<div className="glass-card rounded-2xl p-6 text-sm text-[#64748B]">No sentiment</div>}<ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} /></div>}
     {activeTab==='arbitrage'&&<ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} />}

     {activeTab==='trade'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-4"><div className="text-xs font-black tracking-widest uppercase text-violet-300 mb-3">Trade Ticket — {selectedSymbol.name}</div>
         <div className="grid sm:grid-cols-3 gap-3 text-sm">
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Action</span><div className={cn("rounded-xl px-3 py-2.5 border font-black text-center",forecast?.action==='SELL'?"bg-red-500/10 border-red-500/30 text-red-400":forecast?.action==='BUY'?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":"bg-white/5 border-white/10")}>{forecast?.action||'HOLD'}</div></label>
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Quantity</span><input defaultValue={10} type="number" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Leverage</span><input defaultValue={3} type="number" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
         </div>
         <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs mono">
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Entry</div><div className="font-black">{forecast?.entryPrice.toLocaleString()??'—'}</div></div>
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Stop</div><div className="font-black text-red-400">{forecast?.stopLoss.toLocaleString()??'—'}</div></div>
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Target</div><div className="font-black text-emerald-400">{forecast?.targetPrice.toLocaleString()??'—'}</div></div>
         </div>
         <div className="flex gap-2 mt-4"><button onClick={executeTrade} className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black">Review & Confirm</button><button onClick={()=>void loadData()} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-bold">Refresh Signal</button></div>
         <div className="mt-3 text-[11px] text-[#64748B]">Risk/reward {(forecast? Math.abs(forecast.targetPrice-forecast.entryPrice)/Math.max(1,Math.abs(forecast.entryPrice-forecast.stopLoss)):0).toFixed(2)} • Kelly {forecast? (riskEngine.calculateKellySize(forecast.confidence, Math.abs(forecast.targetPrice-forecast.entryPrice), Math.abs(forecast.entryPrice-forecast.stopLoss))*100).toFixed(1):'0'}%</div>
       </div>
       <div className="space-y-4"><AISignal forecast={forecast}/></div>
     </div>}

     {activeTab==='positions'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 border-b border-white/5 flex items-center justify-between"><span className="text-xs font-black tracking-widest uppercase">Positions</span><span className="text-xs text-[#64748B]">{tradeLogs.length} trades</span></div>
       <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02]"><tr><th className="px-4 py-3 text-left">Symbol</th><th>Side</th><th className="text-right">Entry</th><th className="text-right">Price</th><th>Regime</th><th>Reason</th></tr></thead><tbody className="divide-y divide-white/5">{tradeLogs.slice(0,20).map(l=><tr key={l.id} className="hover:bg-white/[0.02]"><td className="px-4 py-3 font-bold">{l.symbol}</td><td><span className={cn("px-2 py-1 rounded-full text-[10px] font-black",l.action==='BUY'?"bg-emerald-500/10 text-emerald-400":l.action==='SELL'?"bg-red-500/10 text-red-400":"bg-white/10")}>{l.action}</span></td><td className="text-right mono">{l.price.toLocaleString()}</td><td className="text-right mono">{l.price.toLocaleString()}</td><td className="text-xs">{l.metricsAtTrade.regime}</td><td className="text-xs text-[#94A3B8] max-w-[240px] truncate">{l.reason}</td></tr>)}{tradeLogs.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">No positions — execute a paper trade to begin.</td></tr>}</tbody></table></div>
       <div className="md:hidden divide-y divide-white/5">{tradeLogs.slice(0,20).map(l=><div key={l.id} className="p-4 flex justify-between"><div><div className="font-bold text-sm">{l.symbol} • {l.action}</div><div className="text-xs text-[#64748B]">{new Date(l.timestamp).toLocaleString()}</div></div><div className="mono font-black">{l.price.toLocaleString()}</div></div>)}{tradeLogs.length===0&&<div className="p-8 text-center text-sm text-[#64748B]">No positions</div>}</div>
     </div>}

     {activeTab==='orders'&&<div className="glass-panel rounded-2xl p-6"><div className="flex gap-2 mb-4">{['OPEN','PENDING','FILLED','CANCELLED','REJECTED'].map(t=><span key={t} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold">{t}</span>)}</div><div className="text-sm text-[#64748B]">Orders workspace — paper trading. Use Trade tab to create orders. {tradeLogs.length} logs available.</div></div>}

     {activeTab==='history'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 flex items-center justify-between border-b border-white/5"><span className="text-xs font-black tracking-widest uppercase">Trade History</span><input placeholder="Filter by symbol, regime…" className="hidden sm:block rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm w-[260px]" /></div>
       <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02]"><tr><th className="px-4 py-3 text-left">Time</th><th>Asset</th><th>Action</th><th className="text-right">Price</th><th>P&L</th><th>Regime</th></tr></thead><tbody className="divide-y divide-white/5">{tradeLogs.map(l=><tr key={l.id}><td className="px-4 py-3 mono text-xs">{new Date(l.timestamp).toLocaleString()}</td><td className="font-bold">{l.symbol}</td><td><span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black",l.action==='BUY'?"bg-emerald-500/15 text-emerald-400":"bg-red-500/15 text-red-400")}>{l.action}</span></td><td className="text-right mono">{l.price.toLocaleString()}</td><td className="text-xs text-[#94A3B8]">{l.metricsAtTrade.rsi.toFixed(1)}</td><td className="text-xs">{l.metricsAtTrade.regime}</td></tr>)}{tradeLogs.length===0&&<tr><td colSpan={6} className="px-4 py-12 text-center text-[#64748B]">No trade history yet.</td></tr>}</tbody></table></div>
     </div>}

     {activeTab==='forecast'&&<div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 space-y-4"><div className="glass-panel rounded-2xl p-4"><WalkForwardChart data={mtfData['1h']} forecast={forecast} /></div><div className="glass-card rounded-2xl p-4 text-sm leading-relaxed text-[#94A3B8]">{forecast?.reason||'No forecast'}</div></div><AISignal forecast={forecast}/></div>}

     {activeTab==='regime'&&<div className="glass-panel rounded-2xl p-6">
       <div className="text-xs font-black tracking-widest uppercase text-violet-300 mb-4">Market Regime — Timeline</div>
       <div className="space-y-3">{(['TRENDING_UP','TRENDING_DOWN','RANGING','HIGH_VOLATILITY'] as MarketRegime[]).map(r=><div key={r} className={cn("flex items-center gap-3 rounded-xl p-3 border",forecast?.regime===r?"bg-violet-600/10 border-violet-500/30":"bg-white/[0.03] border-white/5")}><span className={cn("w-2 h-2 rounded-full",r==='TRENDING_UP'?"bg-emerald-500":r==='TRENDING_DOWN'?"bg-red-500":r==='HIGH_VOLATILITY'?"bg-amber-500":"bg-slate-400")}/><span className="text-sm font-bold flex-1">{r.replace('_',' ')}</span><span className="text-xs text-[#64748B]">{forecast?.regime===r?'● CURRENT':''}</span></div>)}</div>
       <div className="mt-4 grid grid-cols-3 gap-3 text-xs"><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Confidence</div><div className="mono font-black">{forecast? (forecast.confidence*100).toFixed(1)+'%':'—'}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">RSI</div><div className="mono font-black">{forecast?.indicators.rsi.toFixed(1)??'—'}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">ATR</div><div className="mono font-black">{forecast?.indicators.atr.toFixed(0)??'—'}</div></div></div>
     </div>}

     {activeTab==='models'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="glass-panel rounded-2xl p-6"><div className="text-xs font-black tracking-widest uppercase text-violet-300 mb-3">Market Model — ONNX</div><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#64748B]">Status</span><span className="text-emerald-400 font-black">● ACTIVE</span></div><div className="flex justify-between"><span className="text-[#64748B]">Inference</span><span className="mono">18ms</span></div><div className="flex justify-between"><span className="text-[#64748B]">Version</span><span className="mono">v1.4.2</span></div><div className="flex justify-between"><span className="text-[#64748B]">Accuracy</span><span className="mono">{(metrics.accuracy*100).toFixed(1)}%</span></div></div><button onClick={()=>trainModel()} disabled={isTraining} className="mt-4 w-full py-2.5 rounded-xl bg-violet-600 text-white font-black disabled:opacity-50">{isTraining?`Training ${trainingProgress}%`:'Recalibrate Model'}</button></div>
       <div className="lg:col-span-2 glass-panel rounded-2xl p-6"><LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} /></div>
     </div>}

     {activeTab==='learning'&&<LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} />}
     {activeTab==='performance'&&<LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} />}

     {activeTab==='risk'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-6">
         <div className="text-xs font-black tracking-widest uppercase mb-4">Risk Limits</div>
         <div className="grid sm:grid-cols-2 gap-3">
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Daily Drawdown %</span><input type="number" value={riskLimits.maxDailyDrawdown} onChange={e=>setRiskLimits({...riskLimits, maxDailyDrawdown: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Total Drawdown %</span><input type="number" value={riskLimits.maxTotalDrawdown} onChange={e=>setRiskLimits({...riskLimits, maxTotalDrawdown: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Position Size %</span><input type="number" value={riskLimits.maxPositionSize} onChange={e=>setRiskLimits({...riskLimits, maxPositionSize: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Open Trades</span><input type="number" value={riskLimits.maxOpenTrades} onChange={e=>setRiskLimits({...riskLimits, maxOpenTrades: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
         </div>
         <div className="mt-4 flex items-center gap-2"><input type="checkbox" checked={riskLimits.stopAllTrading} onChange={e=>setRiskLimits({...riskLimits, stopAllTrading: e.target.checked})} /><span className="text-sm font-bold text-red-400">Stop All Trading (Kill Switch)</span></div>
         {riskStatus.violations.length>0&&<div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{riskStatus.violations.map(v=><div key={v}>• {v}</div>)}</div>}
       </div>
       <div className="glass-card rounded-2xl p-5">
         <div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-3">Portfolio Risk</div>
         <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-[#94A3B8]">Balance</span><span className="mono font-black">{metrics.balance.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Equity</span><span className="mono">{(metrics.balance).toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Free Margin</span><span className="mono">{riskStatus.margin.freeMargin.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Margin Level</span><span className="mono">{riskStatus.margin.marginLevel.toFixed(1)}%</span></div></div>
       </div>
     </div>}

     {activeTab==='backtest'&&<div className="glass-panel rounded-2xl p-6">
       <div className="flex flex-wrap gap-2 mb-4"><select className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"><option>IME Gold Futures</option></select><input type="date" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm" /><input type="date" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm" /><button className="px-4 py-2 rounded-xl bg-violet-600 text-white font-black text-sm">Run Backtest</button></div>
       <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Total Return</div><div className="mono font-black text-emerald-400">+12.4%</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Sharpe</div><div className="mono font-black">1.42</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Max DD</div><div className="mono font-black text-red-400">-6.2%</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Win Rate</div><div className="mono font-black">{(metrics.winRate*100).toFixed(1)}%</div></div>
       </div>
     </div>}

     {activeTab==='livedata'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 border-b border-white/5 flex justify-between items-center"><span className="text-xs font-black tracking-widest uppercase">Live Data — Multi-frequency Stream</span><span className="text-xs text-emerald-400">● LIVE</span></div>
       <div className="overflow-x-auto max-h-[520px] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-[#0B0F17] text-[10px] tracking-widest font-black text-[#64748B] uppercase"><tr><th className="px-4 py-3 text-left">Timestamp</th><th className="text-right">Close</th><th className="text-right">Basis</th><th className="text-right">OI</th><th className="text-right">Inventory</th></tr></thead><tbody className="divide-y divide-white/5">{mtfData['1h'].slice().reverse().slice(0,50).map((c,i)=><tr key={i} className="hover:bg-white/[0.02]"><td className="px-4 py-2.5 mono text-xs text-[#94A3B8]">{new Date(c.timestamp).toLocaleString()}</td><td className="text-right mono font-bold">{c.close.toLocaleString()}</td><td className="text-right mono text-violet-300">{c.basis?.toLocaleString()??'—'}</td><td className="text-right mono text-emerald-300">{c.openInterest?.toLocaleString()??'—'}</td><td className="text-right mono text-[#64748B]">{c.warehouseVolume?.toLocaleString()??'—'}</td></tr>)}</tbody></table></div>
     </div>}

     {activeTab==='historical'&&<div className="glass-panel rounded-2xl p-6 text-sm text-[#94A3B8]">Historical data explorer — use timeframe selector on dashboard. Data points: {mtfData['1d'].length} (1D), {mtfData['1h'].length} (1H), {mtfData['15m'].length} (15M).</div>}
     {activeTab==='explorer'&&<div className="glass-panel rounded-2xl p-6"><div className="flex gap-2 mb-3"><input placeholder="Search OHLC, sentiment, correlations…" className="flex-1 rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 text-sm" /><button className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold">Export CSV</button></div><div className="text-sm text-[#64748B]">Data explorer — filter, sort, paginate. Virtualized table ready for large datasets.</div></div>}

     {activeTab==='intelligence'&&<div className="space-y-4">
       <div className="glass-panel rounded-2xl p-6 border-violet-500/20 bg-violet-500/[0.06]"><div className="text-sm font-black tracking-widest uppercase text-violet-300">Market Intelligence Hub</div><p className="text-sm text-[#94A3B8] mt-2 max-w-2xl">KalayBot AI scans Level-2 order books, global correlations and news sentiment to provide a 360° view of IME.</p></div>
       <div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 space-y-4">{orderBook&&<OrderBookView data={orderBook}/>}{correlation&&<MarketCorrelation data={correlation}/>}</div><div className="space-y-4">{sentiment&&<SentimentMonitor data={sentiment}/>}<ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} /></div></div>
     </div>}

     {activeTab==='monitoring'&&<div className="grid lg:grid-cols-2 gap-4">
       <div className="glass-panel rounded-2xl p-6"><div className="text-xs font-black tracking-widest uppercase mb-3">System Health</div><div className="grid grid-cols-2 gap-3 text-sm"><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Uptime</div><div className="mono font-black">{metrics.uptime}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Latency</div><div className="mono font-black">{metrics.latency}ms</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">WS</div><div className={cn("font-black",connectionState==='connected'?"text-emerald-400":"text-amber-400")}>{connectionState}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Status</div><div className="font-black">{metrics.status}</div></div></div></div>
       <div className="glass-panel rounded-2xl p-6 text-sm text-[#94A3B8]">ML service, database and data pipeline indicators. Inference latency and error rates tracked in real time.</div>
     </div>}

     {activeTab==='api'&&<div className="glass-panel rounded-2xl p-6 space-y-4 max-w-2xl">
       <div className="text-xs font-black tracking-widest uppercase">API Configuration</div>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">Proxy URL</span><input value={apiConfig.proxyUrl} onChange={e=>setApiConfig({...apiConfig, proxyUrl:e.target.value})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm" /></label>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">API Key</span><input type="password" value={apiConfig.apiKey} onChange={e=>setApiConfig({...apiConfig, apiKey:e.target.value})} placeholder="••••••••" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm" /></label>
       <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apiConfig.useDigitalTwin} onChange={e=>setApiConfig({...apiConfig, useDigitalTwin:e.target.checked})} /> Use Digital Twin (fallback simulation)</label>
       <div className="text-xs text-[#64748B]">Secrets are masked. Connection status reflects WebSocket and REST health.</div>
     </div>}

     {activeTab==='settings'&&<div className="glass-panel rounded-2xl p-6 max-w-2xl text-sm text-[#94A3B8]">Settings — theme (dark default), notifications, localization. Light mode supported via CSS variables.</div>}
    </div>

    {/* Mobile bottom nav */}
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-around border-t border-white/10 bg-[#0B0F17]/95 backdrop-blur-xl px-2 py-2">
     {[{id:'dashboard',icon:LayoutDashboard,label:'Home'},{id:'overview',icon:Globe,label:'Markets'},{id:'trade',icon:Target,label:'Trade'},{id:'positions',icon:ShieldCheck,label:'Portfolio'},{id:'settings',icon:Settings,label:'More'}].map(it=><button key={it.id} onClick={()=>setActiveTab(it.id)} className={cn("flex flex-col items-center gap-1 px-3 py-1 rounded-xl",activeTab===it.id?"text-violet-400":"text-[#64748B]")}><it.icon className="w-5 h-5"/><span className="text-[10px] font-bold">{it.label}</span></button>)}
    </div>
  </main>
 </div>

 {/* Status bar */}
 <div className="hidden lg:flex h-6 items-center gap-4 px-4 border-t border-white/[0.06] bg-[#080B12] text-[11px] font-mono text-[#64748B]">
  <span>IME • {selectedSymbol.id}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span className={cn(connectionState==='connected'?"text-emerald-400":"text-amber-400")}>WS {connectionState}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span>API {apiConfig.isConnected?'ONLINE':'OFFLINE'}</span><span className="ml-auto">© Intelligence Trader • AI Engine v2.5</span>
 </div>

 {/* Command palette */}
 {cmdOpen&&<div className="fixed inset-0 z-50 grid place-items-start pt-[20vh] p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setCmdOpen(false)}/><div className="relative w-full max-w-[640px] mx-auto rounded-2xl bg-[#0B0F17] border border-white/10 shadow-2xl overflow-hidden">
   <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10"><Search className="w-4 h-4 text-[#64748B]"/><input autoFocus placeholder="Search Intelligence Trader…" className="flex-1 bg-transparent outline-none text-sm" /><button onClick={()=>setCmdOpen(false)} className="text-xs text-[#64748B] border border-white/10 rounded-lg px-2 py-1">ESC</button></div>
   <div className="p-2 max-h-[320px] overflow-y-auto">{allNavItems.map(it=><button key={it.id} onClick={()=>{setActiveTab(it.id); setCmdOpen(false)}} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-3 text-sm"><it.icon className="w-4 h-4 text-[#94A3B8]"/>{it.label}</button>)}</div>
 </div></div>}

 {/* Confirm modal */}
 {showConfirm&&<div className="fixed inset-0 z-50 grid place-items-center p-4"><div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setShowConfirm(false)}/><div className="relative w-full max-w-[440px] rounded-2xl bg-[#0B0F17] border border-white/10 p-6 shadow-2xl">
   <div className="text-xs tracking-widest font-black text-violet-300 uppercase">Confirm Trade</div><div className={cn("text-2xl font-black mt-2",forecast?.action==='BUY'?"text-emerald-400":"text-red-400")}>{forecast?.action} {selectedSymbol.name}</div>
   <div className="grid grid-cols-2 gap-3 mt-4 text-sm mono"><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Entry</div><div className="font-black">{forecast?.entryPrice.toLocaleString()}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Stop</div><div className="font-black">{forecast?.stopLoss.toLocaleString()}</div></div></div>
   <div className="flex gap-2 mt-6"><button onClick={()=>setShowConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 font-bold">Cancel</button><button onClick={confirmTrade} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-black">Confirm Trade</button></div>
 </div></div>}

 {/* Toasts */}
 <div className="fixed bottom-4 right-4 z-50 space-y-2">{toasts.map(t=><div key={t.id} className="px-4 py-3 rounded-xl bg-[#101620] border border-white/10 shadow-2xl text-sm">{t.msg}</div>)}</div>
</div>
}
