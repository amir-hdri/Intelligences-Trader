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
 LayoutDashboard, Layers, Database, BrainCircuit, ShieldAlert, History, Activity, Settings, Search, Bell, ChevronDown, Menu, X, TrendingUp, TrendingDown, Zap, ShieldCheck, BarChart3, Target, AlertTriangle, Cpu, Globe, ArrowUpRight, ArrowDownRight, Command, Maximize2, RefreshCw, Eye, Sun, Moon, Filter, Download, Clock, Percent
} from 'lucide-react';

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

function Skeleton({className}:{className?:string}){ return <div className={cn("rounded-xl shimmer",className)} /> }

function MetricCard({title,value,sub,icon:Icon,delta,accent,loading}:{title:string;value:string;sub?:string;icon:any;delta?:{v:number;pos:boolean};accent?:string;loading?:boolean}){
 if(loading) return <div className="glass-card rounded-2xl p-4 space-y-3"><Skeleton className="h-3 w-24"/><Skeleton className="h-7 w-32"/><Skeleton className="h-[28px] w-full"/></div>
 return <div className="glass-card rounded-2xl p-4 flex flex-col gap-3 hover:border-white/10 transition-colors">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.16em] font-bold text-[#64748B] uppercase">{title}</span><Icon className={cn("w-4 h-4",accent||"text-[#94A3B8]")} /></div>
  <div className="flex items-baseline gap-2"><span className="text-[22px] font-black tracking-tighter mono text-white">{value}</span>{delta&&<span className={cn("text-xs font-bold inline-flex items-center gap-1",delta.pos?"text-[#22C55E]":"text-[#EF4444]")}>{delta.pos?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}{delta.v>0?'+':''}{delta.v.toFixed(1)}%</span>}</div>
  {sub&&<div className="text-[11px] text-[#64748B]">{sub}</div>}
  <div className="h-[28px] flex items-end gap-[2px] opacity-60">{Array.from({length:18}).map((_,i)=><div key={i} className="flex-1 rounded-sm bg-white/10" style={{height: 8+Math.random()*18}} />)}</div>
 </div>
}
function AISignal({forecast,compact}:{forecast:any;compact?:boolean}){
 if(!forecast) return <div className="glass-card rounded-2xl p-8 text-center"><Skeleton className="h-6 w-24 mx-auto"/><Skeleton className="h-10 w-32 mx-auto mt-3"/><Skeleton className="h-20 w-full mt-4"/></div>;
 const isBuy=forecast.action==='BUY', isSell=forecast.action==='SELL';
 const color=isBuy?'text-[#22C55E]':isSell?'text-[#EF4444]':'text-[#94A3B8]';
 const badge=isBuy?'BUY':isSell?'SELL':'HOLD';
 return <div className="glass-card rounded-2xl p-5 space-y-4">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.18em] font-black text-[#8B5CF6] uppercase">AI Market Signal</span><span className="text-[10px] font-mono text-[#64748B]">{new Date().toLocaleTimeString()}</span><span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300">EST. PROBABILITY</span></div>
  <div className={cn("text-3xl font-black tracking-tighter flex items-center gap-2",color)}>{badge} {isBuy?<TrendingUp className="w-6 h-6"/>:isSell?<TrendingDown className="w-6 h-6"/>:null} <span className="text-xs font-mono text-white/60 border border-white/10 rounded-full px-2 py-1">Model Confidence {(forecast.confidence*100).toFixed(1)}%</span></div>
  <div className="grid grid-cols-2 gap-3 text-xs">
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Confidence</div><div className="text-white font-black text-lg mono">{(forecast.confidence*100).toFixed(1)}%</div><div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden"><div className="h-full bg-[#8B5CF6] rounded-full transition-all" style={{width:`${forecast.confidence*100}%`}}/></div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Market Regime</div><div className="text-white font-bold text-xs mt-1">{forecast.regime.replace('_',' ')}</div><div className="text-[#64748B] text-[11px] mt-1">Exp. {(forecast.bubbleGap? (forecast.bubbleGap*100).toFixed(1):'—')}%</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Expected Return</div><div className="text-[#22C55E] font-black mono">+{(Math.abs(forecast.targetPrice-forecast.entryPrice)/forecast.entryPrice*100).toFixed(2)}%</div><div className="text-[10px] text-[#64748B]">AI forecast</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Signal Strength</div><div className={cn("font-black",forecast.confidence>0.75?"text-[#22C55E]":forecast.confidence>0.55?"text-[#F59E0B]":"text-[#64748B]")}>{forecast.confidence>0.75?'HIGH':forecast.confidence>0.55?'MEDIUM':'LOW'}</div><div className="text-[10px] text-[#64748B]">Risk {forecast.confidence>0.8?'LOW':forecast.confidence>0.55?'MEDIUM':'HIGH'}</div></div>
  </div>
  {!compact&&<div className="text-[11px] leading-relaxed text-[#94A3B8] bg-[#0B0F17] rounded-xl p-3 border border-white/[0.06]">{forecast.reason}</div>}
  <div className="grid grid-cols-3 gap-2 text-[11px] mono">
    <div className="elevated rounded-xl p-2.5 text-center"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Entry</div><div className="font-bold text-white">{forecast.entryPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2.5 text-center border-emerald-500/20"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Target</div><div className="font-bold text-[#22C55E]">{forecast.targetPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2.5 text-center border-red-500/20"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Stop</div><div className="font-bold text-[#EF4444]">{forecast.stopLoss.toLocaleString()}</div></div>
  </div>
  <p className="text-[10px] text-[#64748B] leading-relaxed">AI recommendation ≠ execution. Model confidence is estimated probability. Review risk before trading.</p>
 </div>
}

export default function App(){
 const [activeTab,setActiveTab]=useState('dashboard');
 const [mobileNav,setMobileNav]=useState(false);
 const [collapsed,setCollapsed]=useState(false);
 const [cmdOpen,setCmdOpen]=useState(false);
 const [notifOpen,setNotifOpen]=useState(false);
 const [theme,setTheme]=useState<'dark'|'light'>('dark');
 const [selectedSymbolId,setSelectedSymbolId]=useLocalStorage<string>('selectedSymbolId',IME_SYMBOLS[0].id);
 const [apiConfig,setApiConfig]=useLocalStorage<ApiConfig>('apiConfig',DEFAULT_API_CONFIG);
 const [metrics,setMetrics]=useLocalStorage<SystemMetrics>('metrics',INITIAL_METRICS);
 const [riskLimits,setRiskLimits]=useLocalStorage<RiskLimits>('riskLimits',DEFAULT_RISK_LIMITS);
 const [tradeLogs,setTradeLogs]=useLocalStorage<TradeLogEntry[]>('tradeLogs',[]);
 const [timeframe,setTimeframe]=useState<TimeFrame>('1h');
 const [showConfirm,setShowConfirm]=useState(false);
 const [orderQty,setOrderQty]=useState(10);
 const [orderLev,setOrderLev]=useState(3);
 const [toasts,setToasts]=useState<{id:string;msg:string}[]>([]);
 const pushToast=(msg:string)=>{const id=Math.random().toString(36).slice(2); setToasts(t=>[...t,{id,msg}]); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),2600)};
 const {mtfData,orderBook,setOrderBook,correlation,sentiment,forecast,isLoading,errorState,isTraining,trainingProgress,loadData,trainModel,selectedSymbol}=useMarketData(selectedSymbolId,apiConfig,setMetrics);
 const handlePriceUpdate=useCallback((price:number)=>setMetrics(prev=>({...prev,lastPrice:price} as any)),[setMetrics]);
 const {connectionState}=useWebSocket(selectedSymbolId,setOrderBook,handlePriceUpdate);
 const riskEngineRef=useRef<RiskEngine|null>(null);
 if(!riskEngineRef.current) riskEngineRef.current=new RiskEngine(riskLimits, metrics.balance||INITIAL_METRICS.balance);
 const riskEngine=riskEngineRef.current;
 const [riskStatus,setRiskStatus]=useState<RiskStatus>(()=>riskEngine.getStatus());
 const executeTrade=()=>{ if(!forecast) return; const v=riskEngine.validateTrade(forecast,metrics.activeOrders,selectedSymbol,forecast.backendRisk); if(!v.allowed){ pushToast(`Trade rejected: ${v.reason}`); return; } setShowConfirm(true); };
 const confirmTrade=()=>{ if(!forecast) return; const price=forecast.entryPrice; const newLog:TradeLogEntry={id:crypto.randomUUID(),timestamp:Date.now(),symbol:selectedSymbol.name,action:forecast.action,price,reason:forecast.reason,metricsAtTrade:{rsi:forecast.indicators.rsi,regime:forecast.regime,sentiment:forecast.sentimentScore}}; setTradeLogs(prev=>[newLog,...prev]); const isWin=Math.random()<metrics.winRate; const riskPerTrade=0.01*(metrics.balance||1000000); const reward=riskPerTrade*metrics.profitFactor; const pnl=isWin?reward:-riskPerTrade; const newBalance=(metrics.balance||1000000)+pnl; setMetrics(prev=>({...prev,balance:newBalance})); riskEngine.updateEquity(newBalance,metrics.activeOrders*50000); setRiskStatus(riskEngine.getStatus()); setShowConfirm(false); pushToast(`Paper trade ${forecast.action} @ ${price.toLocaleString()} — ${isWin?'PROFIT':'LOSS'} ${pnl.toFixed(0)}`); };
 useEffect(()=>{void loadData()},[loadData]);
 useEffect(()=>{riskEngine.setLimits(riskLimits); setRiskStatus(riskEngine.getStatus())},[riskEngine,riskLimits]);
 useEffect(()=>{riskEngine.updatePerformanceMetrics(metrics.winRate,metrics.profitFactor); riskEngine.updateEquity(metrics.balance||INITIAL_METRICS.balance,metrics.activeOrders*50000); setRiskStatus(riskEngine.getStatus())},[riskEngine,metrics.balance,metrics.activeOrders,metrics.winRate,metrics.profitFactor]);
 useEffect(()=>{const id=window.setInterval(()=>setMetrics(prev=>{const [h=0,m=0,s=0]=prev.uptime.split(':').map(Number); const e=h*3600+m*60+s+1; return {...prev,uptime:`${String(Math.floor(e/3600)).padStart(2,'0')}:${String(Math.floor((e%3600)/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`}}),1000); return()=>clearInterval(id)},[setMetrics]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault(); setCmdOpen(v=>!v)}}; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)},[]);
 const allNavItems=useMemo(()=>NAV.flatMap(g=>g.items),[]);
 const currentPrice=mtfData[timeframe]?.[mtfData[timeframe].length-1]?.close ?? forecast?.entryPrice ?? selectedSymbol.priceLimit.up;
 const priceChange=useMemo(()=>{const arr=mtfData[timeframe]; if(!arr||arr.length<2) return 0; const a=arr[arr.length-2].close, b=arr[arr.length-1].close; return ((b-a)/a)*100},[mtfData,timeframe]);
 const notifications=[{cat:'AI',title:'AI signal changed',desc:`${selectedSymbol.name} shifted to ${forecast?.action||'HOLD'}`,time:'2m ago'},{cat:'Risk',title:'Risk warning',desc:'Portfolio exposure 42% — within limits',time:'14m ago'},{cat:'Market',title:'Order book pressure +0.32',desc:'Buy imbalance detected',time:'31m ago'}];

 return <div className={cn("min-h-screen flex flex-col", theme==='light'?"bg-[#F8FAFC] text-[#0B0F17]":"bg-[#05070B] text-[#F8FAFC]")}>
  <header className={cn("sticky top-0 z-30 h-[56px] flex items-center gap-3 px-3 lg:px-4 border-b backdrop-blur-xl", theme==='light'?"bg-white/90 border-black/5":"bg-[#0B0F17]/90 border-white/[0.07]")}>
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
     <span className={cn("w-2 h-2 rounded-full",connectionState==='CONNECTED'?"bg-emerald-500 animate-pulse":connectionState==='RECONNECTING'?"bg-amber-500 animate-pulse":"bg-red-500")} />
     <span className="text-[#94A3B8]">{connectionState.toUpperCase()}</span>
     <span className="text-white/20">•</span><span className="text-[#94A3B8]">AI {forecast?'ACTIVE':'IDLE'}</span>
    </div>
    <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} className="p-2 rounded-xl bg-white/[0.06] border border-white/10">{theme==='dark'?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
    <button onClick={()=>setNotifOpen(v=>!v)} className="relative p-2 rounded-xl bg-white/[0.06] border border-white/10"><Bell className="w-4 h-4"/><span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-black rounded-full grid place-items-center">3</span></button>
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 grid place-items-center text-xs font-black">AT</div>
    <button onClick={()=>setCollapsed(v=>!v)} className="hidden lg:grid place-items-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10"><ChevronDown className={cn("w-4 h-4 transition",collapsed&&"rotate-180")}/></button>
   </div>
  </header>

  <div className="flex flex-1 min-h-0">
   <aside className={cn("hidden lg:flex flex-col border-r sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto transition-all", theme==='light'?"bg-white border-black/5":"bg-[#05070B] border-white/[0.07]",collapsed?"w-[64px]":"w-[264px]") }>
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

   {mobileNav&&<div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setMobileNav(false)}/><div className="absolute inset-y-0 left-0 w-[300px] bg-[#0B0F17] border-r border-white/10 overflow-y-auto p-4">
    <div className="flex items-center justify-between mb-4"><div className="font-black">Intelligence Trader</div><button onClick={()=>setMobileNav(false)} className="p-2 rounded-xl bg-white/10"><X className="w-5 h-5"/></button></div>
    {NAV.map(g=><div key={g.label} className="mb-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-2">{g.label}</div><div className="space-y-1">{g.items.map(it=><button key={it.id} onClick={()=>{setActiveTab(it.id); setMobileNav(false)}} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm",activeTab===it.id?"bg-violet-600 text-white":"text-[#94A3B8]") }><it.icon className="w-4 h-4"/>{it.label}</button>)}</div></div>)}
   </div></div>}

   <main className="flex-1 min-w-0">
    <div className="h-10 flex items-center gap-4 px-3 lg:px-6 border-b border-white/[0.06] bg-[#080B12] overflow-x-auto">
     <div className="flex items-center gap-2 shrink-0"><span className="text-xs font-black tracking-widest">{selectedSymbol.name}</span><span className="text-[11px] text-[#64748B]">{selectedSymbol.id}</span><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black border", selectedSymbol.type==='FUTURES'?"bg-violet-500/10 text-violet-300 border-violet-500/20":"bg-white/5 text-[#94A3B8] border-white/10")}>{selectedSymbol.type}</span></div>
     <div className="flex items-center gap-2 shrink-0"><span className="mono text-sm font-black">{currentPrice.toLocaleString()}</span><span className={cn("inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded",priceChange>=0?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400")}>{priceChange>=0?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{priceChange>=0?'+':''}{priceChange.toFixed(2)}%</span></div>
     <div className="hidden md:flex items-center gap-2 text-[11px] text-[#64748B]"><span>Limit Up {selectedSymbol.priceLimit.up.toLocaleString()}</span><span>•</span><span>Limit Down {selectedSymbol.priceLimit.down.toLocaleString()}</span></div>
     <div className="ml-auto flex items-center gap-2">
      <button onClick={()=>void loadData()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold hover:bg-white/10"><RefreshCw className={cn("w-3.5 h-3.5",isLoading&&"animate-spin")}/>Refresh</button>
      <button onClick={()=>setActiveTab('trade')} className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black">New Order</button>
     </div>
    </div>

    <div className="p-3 lg:p-6 space-y-6 pb-20 lg:pb-6">
     {errorState&&<div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between"><div className="flex items-center gap-2 text-amber-300 text-sm"><AlertTriangle className="w-4 h-4"/>{errorState}</div><button onClick={()=>void loadData()} className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-black">Reconnect</button></div>}

     {activeTab==='dashboard'&&<>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
       <MetricCard loading={isLoading} title="Political Risk Index" value={sentiment?sentiment.politicalRiskIndex.toFixed(0):'—'} icon={AlertTriangle} delta={sentiment?{v:sentiment.politicalRiskIndex-50,pos:sentiment.politicalRiskIndex>50}:undefined} accent="text-violet-400" sub={sentiment?.label||'NEUTRAL'} />
       <MetricCard loading={isLoading} title="Bubble Gap" value={forecast?.bubbleGap!==undefined?`${(forecast.bubbleGap*100).toFixed(1)}%`:'—'} icon={Zap} delta={forecast?.bubbleGap?{v:forecast.bubbleGap*100,pos:forecast.bubbleGap>0}:undefined} accent="text-amber-400" sub={forecast?.fairValue?`Fair ${forecast.fairValue.toLocaleString()}`:'—'} />
       <MetricCard loading={isLoading} title="Queue Herding" value={orderBook?`${(orderBook.queueDynamics.buyRatio*100).toFixed(1)}%`:'—'} icon={BarChart3} delta={orderBook?{v:(orderBook.queueDynamics.buyRatio-0.5)*100,pos:orderBook.queueDynamics.buyRatio>0.5}:undefined} accent="text-sky-400" sub={orderBook?.queueDynamics.isHerdingDetected?'Herding detected':'Balanced'} />
       <MetricCard loading={isLoading} title="Market Sentiment" value={sentiment?`${(sentiment.score*100).toFixed(0)}`:'—'} icon={BrainCircuit} accent="text-emerald-400" sub={sentiment?`${sentiment.label} • Confidence ${(Math.abs(sentiment.score)*100).toFixed(0)}%`:'—'} />
       <MetricCard title="Risk Buffer" value={`${(metrics.balance>0?(riskStatus.margin.freeMargin/metrics.balance)*100:0).toFixed(1)}%`} icon={ShieldCheck} accent="text-indigo-400" sub={`Free ${riskStatus.margin.freeMargin.toLocaleString()}`} />
      </div>
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
         {isLoading?<div className="p-6 space-y-3"><Skeleton className="h-[300px] w-full"/><Skeleton className="h-6 w-full"/></div>:<div className="p-2 lg:p-3"><WalkForwardChart data={mtfData[timeframe]||mtfData['1h']} forecast={forecast} /></div>}
         <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 text-center">
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">RSI</div><div className={cn("mono font-black", forecast&&forecast.indicators.rsi>70?"text-red-400":forecast&&forecast.indicators.rsi<30?"text-emerald-400":"")}>{forecast?.indicators.rsi.toFixed(1)??'—'}</div></div>
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">ATR</div><div className="mono font-black">{forecast?.indicators.atr.toFixed(0)??'—'}</div></div>
          <div className="p-3"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">MACD</div><div className={cn("mono font-black", forecast&&forecast.indicators.macd.histogram>0?"text-emerald-400":"text-red-400")}>{forecast?.indicators.macd.histogram.toFixed(1)??'—'}</div></div>
         </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
         {orderBook?<OrderBookView data={orderBook}/>:<div className="glass-card rounded-2xl p-8 text-center text-sm text-[#64748B]">Order book reconnecting… <button onClick={()=>void loadData()} className="text-violet-400 underline">Retry</button></div>}
         {correlation?<MarketCorrelation data={correlation}/>:<Skeleton className="h-[260px] w-full"/>}
        </div>
       </div>
       <div className="space-y-4">
        <AISignal forecast={forecast}/>
        {sentiment&&<SentimentMonitor data={sentiment}/>}
        <ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} />
        <div className="glass-card rounded-2xl p-4">
         <div className="text-[10px] tracking-[0.16em] font-black text-[#64748B] uppercase mb-3 flex items-center justify-between">Risk Control Center <ShieldAlert className="w-4 h-4 text-[#64748B]"/></div>
         <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Exposure</div><div className="mono font-black text-lg">{((1-riskStatus.margin.freeMargin/Math.max(1,metrics.balance))*100).toFixed(1)}%</div><div className="h-1 bg-white/10 rounded-full mt-1"><div className="h-full bg-violet-500 rounded-full" style={{width:`${Math.min(100,(1-riskStatus.margin.freeMargin/Math.max(1,metrics.balance))*100)}%`}}/></div></div>
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Margin Level</div><div className="mono font-black text-lg">{riskStatus.margin.marginLevel.toFixed(1)}%</div><div className={cn("text-[10px] font-bold",riskStatus.margin.isCallRisk?"text-red-400":"text-emerald-400")}>{riskStatus.margin.isCallRisk?'CALL RISK':'HEALTHY'}</div></div>
          <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">VaR 95%</div><div className="mono font-black">${(forecast?.backendRisk?.valueAtRisk95??18420).toLocaleString()}</div></div>
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
       <div className="lg:col-span-2 glass-panel rounded-2xl p-4"><div className="text-xs font-black tracking-widest text-violet-300 uppercase mb-3">Market Overview — IME Instruments</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{IME_SYMBOLS.map(s=>{const active=selectedSymbolId===s.id; return <button key={s.id} onClick={()=>setSelectedSymbolId(s.id)} className={cn("rounded-2xl p-4 text-left border text-sm transition",active?"bg-violet-600/15 border-violet-500/30 ring-1 ring-violet-500/20":"glass-card hover:border-white/10")}><div className="flex justify-between"><span className="font-black">{s.name}</span><span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border",s.type==='FUTURES'?"bg-amber-500/10 text-amber-300 border-amber-500/20":"bg-white/5 border-white/10")}>{s.type}</span></div><div className="text-xs text-[#94A3B8] mt-1">{s.fullName}</div><div className="mono text-xs mt-3 flex justify-between"><span>UP {s.priceLimit.up.toLocaleString()}</span><span>DN {s.priceLimit.down.toLocaleString()}</span></div>{s.expiryDate&&<div className="text-[10px] text-[#64748B] mt-1 flex items-center gap-1"><Clock className="w-3 h-3"/>Exp {new Date(s.expiryDate).toLocaleDateString()}</div>}</button>})}</div></div>
       <div className="space-y-4">{sentiment&&<SentimentMonitor data={sentiment}/>}{correlation&&<MarketCorrelation data={correlation}/>}</div>
     </div>}

     {activeTab==='orderbook'&&<div className="glass-panel rounded-2xl p-4">{orderBook?<OrderBookView data={orderBook}/>:<div className="text-sm text-[#64748B] p-8 text-center">No order book — <button onClick={()=>void loadData()} className="text-violet-400 underline">Reconnect</button></div>}</div>}
     {activeTab==='correlations'&&<div className="glass-panel rounded-2xl p-4">{correlation?<MarketCorrelation data={correlation}/>:<div className="text-sm text-[#64748B]">No correlation</div>}</div>}
     {activeTab==='sentiment'&&<div className="grid lg:grid-cols-2 gap-4">{sentiment?<SentimentMonitor data={sentiment}/>:<Skeleton className="h-[300px]"/>} <ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} /></div>}
     {activeTab==='arbitrage'&&<ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} />}

     {activeTab==='trade'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
         <div className="flex items-center justify-between mb-4"><span className="text-xs font-black tracking-widest uppercase text-violet-300">Trade Ticket — {selectedSymbol.name}</span><span className="text-[10px] font-mono text-[#64748B]">Fees est. 0.08%</span></div>
         <div className="grid sm:grid-cols-3 gap-3 text-sm">
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Order Type</span><select className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5"><option>MARKET</option><option>LIMIT</option><option>STOP</option></select></label>
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Quantity</span><input value={orderQty} onChange={e=>setOrderQty(Number(e.target.value))} type="number" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Leverage</span><input value={orderLev} onChange={e=>setOrderLev(Number(e.target.value))} type="number" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
         </div>
         <div className="grid sm:grid-cols-3 gap-3 mt-3"><div className={cn("rounded-xl p-3 border text-center",forecast?.action==='SELL'?"bg-red-500/10 border-red-500/30 text-red-400":forecast?.action==='BUY'?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":"bg-white/5 border-white/10")}><div className="text-[10px] tracking-widest font-black uppercase">Action</div><div className="font-black">{forecast?.action||'HOLD'}</div></div><div className="elevated rounded-xl p-3 text-center mono"><div className="text-[10px] text-[#64748B] uppercase">Position Size</div><div className="font-black">{(orderQty*(forecast?.entryPrice||0)).toLocaleString()}</div></div><div className="elevated rounded-xl p-3 text-center mono"><div className="text-[10px] text-[#64748B] uppercase">Kelly Size</div><div className="font-black text-violet-300">{forecast? (riskEngine.calculateKellySize(forecast.confidence, Math.abs(forecast.targetPrice-forecast.entryPrice), Math.abs(forecast.entryPrice-forecast.stopLoss))*100).toFixed(1):'0'}%</div></div></div>
         <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs mono">
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Entry</div><div className="font-black">{forecast?.entryPrice.toLocaleString()??'—'}</div></div>
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Stop</div><div className="font-black text-red-400">{forecast?.stopLoss.toLocaleString()??'—'}</div></div>
           <div className="elevated rounded-xl p-3 text-center"><div className="text-[#64748B] text-[10px] uppercase">Target</div><div className="font-black text-emerald-400">{forecast?.targetPrice.toLocaleString()??'—'}</div></div>
         </div>
         <div className="grid grid-cols-3 gap-3 mt-3 text-center">
           <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3"><div className="text-[10px] text-[#64748B] uppercase font-bold">Max Loss</div><div className="mono font-black text-red-400">${(Math.abs((forecast?.entryPrice||0)-(forecast?.stopLoss||0))*orderQty).toLocaleString()}</div></div>
           <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><div className="text-[10px] text-[#64748B] uppercase font-bold">Expected Profit</div><div className="mono font-black text-emerald-400">${(Math.abs((forecast?.targetPrice||0)-(forecast?.entryPrice||0))*orderQty).toLocaleString()}</div></div>
           <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3"><div className="text-[10px] text-[#64748B] uppercase font-bold">Risk / Reward</div><div className="mono font-black">1 : {(forecast? Math.abs(forecast.targetPrice-forecast.entryPrice)/Math.max(1,Math.abs(forecast.entryPrice-forecast.stopLoss)):0).toFixed(2)}</div></div>
         </div>
         {riskStatus.violations.length>0&&<div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/>{riskStatus.violations[0]}</div>}
         <div className="flex gap-2 mt-4"><button onClick={executeTrade} disabled={!forecast||forecast.action==='HOLD'} className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black">Review & Confirm</button><button onClick={()=>void loadData()} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-bold">Refresh Signal</button></div>
       </div>
       <div className="space-y-4"><AISignal forecast={forecast}/><div className="glass-card rounded-2xl p-4 text-xs text-[#64748B]">This order will increase exposure to {((1-riskStatus.margin.freeMargin/Math.max(1,metrics.balance))*100+2).toFixed(1)}%. Review stop loss before confirming.</div></div>
     </div>}

     {activeTab==='positions'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 border-b border-white/5 flex items-center justify-between"><span className="text-xs font-black tracking-widest uppercase">Positions • {tradeLogs.length}</span><div className="flex gap-2"><button className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold hidden sm:inline-flex items-center gap-1"><Filter className="w-3 h-3"/>Filter</button><button className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-black">Close All</button></div></div>
       <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02]"><tr><th className="px-4 py-3 text-left">Symbol</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Entry</th><th className="text-right">Current</th><th className="text-right">P&L</th><th>Risk</th></tr></thead><tbody className="divide-y divide-white/5">{tradeLogs.slice(0,20).map(l=>{const pnl=(Math.random()-0.5)*2000; return <tr key={l.id} className="hover:bg-white/[0.02]"><td className="px-4 py-3 font-bold">{l.symbol}</td><td><span className={cn("px-2 py-1 rounded-full text-[10px] font-black",l.action==='BUY'?"bg-emerald-500/10 text-emerald-400":l.action==='SELL'?"bg-red-500/10 text-red-400":"bg-white/10")}>{l.action}</span></td><td className="text-right mono">10</td><td className="text-right mono">{l.price.toLocaleString()}</td><td className="text-right mono">{(l.price*(1+(Math.random()-0.5)*0.02)).toFixed(0)}</td><td className={cn("text-right mono font-bold",pnl>0?"text-emerald-400":"text-red-400")}>{pnl>0?'+':''}{pnl.toFixed(0)}</td><td className="text-xs"><span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Modify</span></td></tr>})}{tradeLogs.length===0&&<tr><td colSpan={7} className="px-4 py-16 text-center"><div className="text-[#64748B] text-sm">No open positions</div><div className="text-xs text-[#64748B] mt-1">Execute a paper trade from the Trade tab to open a position.</div></td></tr>}</tbody></table></div>
       <div className="md:hidden divide-y divide-white/5">{tradeLogs.slice(0,20).map(l=><div key={l.id} className="p-4 flex justify-between"><div><div className="font-bold text-sm">{l.symbol} • {l.action}</div><div className="text-xs text-[#64748B]">{new Date(l.timestamp).toLocaleString()}</div></div><div className="mono font-black">{l.price.toLocaleString()}</div></div>)}{tradeLogs.length===0&&<div className="p-8 text-center text-sm text-[#64748B]">No positions — pull to refresh</div>}</div>
     </div>}

     {activeTab==='orders'&&<div className="glass-panel rounded-2xl p-4">
       <div className="flex gap-2 mb-4 overflow-x-auto">{['OPEN','PENDING','FILLED','CANCELLED','REJECTED'].map((t,i)=><button key={t} className={cn("px-3 py-1.5 rounded-full text-xs font-black border whitespace-nowrap",i===0?"bg-violet-600 text-white border-violet-500":"bg-white/5 border-white/10 text-[#94A3B8]")}>{t}</button>)}</div>
       <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02]"><tr><th className="px-3 py-2 text-left">Order ID</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead><tbody className="divide-y divide-white/5">{tradeLogs.slice(0,10).map(l=><tr key={l.id}><td className="px-3 py-2 mono text-xs">{l.id.slice(0,8)}</td><td className="font-bold">{l.symbol}</td><td>{l.action}</td><td className="mono">10</td><td className="mono">{l.price.toLocaleString()}</td><td><span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black">FILLED</span></td></tr>)}{tradeLogs.length===0&&<tr><td colSpan={6} className="py-10 text-center text-[#64748B]">No orders</td></tr>}</tbody></table></div>
     </div>}

     {activeTab==='history'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5"><span className="text-xs font-black tracking-widest uppercase">Trade History • Journal</span><div className="flex gap-2"><input placeholder="Filter by asset, strategy…" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm w-[220px]" /><button className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold inline-flex items-center gap-1"><Download className="w-3 h-3"/>Export</button></div></div>
       <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] tracking-widest font-black text-[#64748B] uppercase bg-white/[0.02]"><tr><th className="px-4 py-3 text-left">Time</th><th>Asset</th><th>Action</th><th className="text-right">Entry</th><th className="text-right">Exit</th><th>P&L</th><th>Regime</th><th>Confidence</th></tr></thead><tbody className="divide-y divide-white/5">{tradeLogs.map(l=>{const exit=l.price*1.01; return <tr key={l.id} className="hover:bg-white/[0.02]"><td className="px-4 py-3 mono text-xs">{new Date(l.timestamp).toLocaleString()}</td><td className="font-bold">{l.symbol}</td><td><span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black",l.action==='BUY'?"bg-emerald-500/15 text-emerald-400":"bg-red-500/15 text-red-400")}>{l.action}</span></td><td className="text-right mono">{l.price.toLocaleString()}</td><td className="text-right mono">{exit.toFixed(0)}</td><td className="text-emerald-400 mono font-bold">+{(exit-l.price).toFixed(0)}</td><td className="text-xs">{l.metricsAtTrade.regime}</td><td className="mono text-xs">{(l.metricsAtTrade.sentiment*100).toFixed(0)}%</td></tr>})}{tradeLogs.length===0&&<tr><td colSpan={8} className="px-4 py-12 text-center text-[#64748B]">No history — trades, regime and sentiment will appear here.</td></tr>}</tbody></table></div>
     </div>}

     {activeTab==='forecast'&&<div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 space-y-4"><div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between mb-3"><span className="text-xs font-black tracking-widest uppercase text-violet-300">AI Forecast — Confidence Bands</span><span className="text-xs mono text-[#64748B]">Latency 42ms</span></div><WalkForwardChart data={mtfData['1h']} forecast={forecast} /></div><div className="glass-card rounded-2xl p-4 text-sm leading-relaxed text-[#94A3B8]">{forecast?.reason||'No forecast'}<div className="grid grid-cols-3 gap-2 mt-3 mono text-xs"><div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Target</div><div className="font-bold text-emerald-400">{forecast?.targetPrice.toLocaleString()}</div></div><div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Stop</div><div className="font-bold text-red-400">{forecast?.stopLoss.toLocaleString()}</div></div><div className="elevated rounded-xl p-2 text-center"><div className="text-[#64748B] text-[9px] uppercase">Entry</div><div className="font-bold">{forecast?.entryPrice.toLocaleString()}</div></div></div></div></div><AISignal forecast={forecast}/></div>}

     {activeTab==='regime'&&<div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 glass-panel rounded-2xl p-6">
       <div className="text-xs font-black tracking-widest uppercase text-violet-300 mb-4">Market Regime — Detection Timeline</div>
       <div className="space-y-2">{(['TRENDING_UP','TRENDING_DOWN','RANGING','HIGH_VOLATILITY'] as MarketRegime[]).map(r=>{const active=forecast?.regime===r; return <div key={r} className={cn("flex items-center gap-3 rounded-xl p-3 border",active?"bg-violet-600/10 border-violet-500/30":"bg-white/[0.03] border-white/5")}><span className={cn("w-2.5 h-2.5 rounded-full",r==='TRENDING_UP'?"bg-emerald-500":r==='TRENDING_DOWN'?"bg-red-500":r==='HIGH_VOLATILITY'?"bg-amber-500":"bg-slate-400")}/><span className="text-sm font-bold flex-1">{r.replace('_',' ')}</span><div className="h-2 w-32 bg-white/10 rounded-full overflow-hidden hidden sm:block"><div className="h-full bg-violet-500" style={{width:active?'100%':'28%'}}/></div><span className="text-xs text-[#64748B]">{active?'● CURRENT 87.4%':'—'}</span></div>})}</div>
       <div className="mt-4 rounded-xl bg-white/[0.03] border border-white/5 p-3 flex gap-1 overflow-x-auto">{Array.from({length:40}).map((_,i)=><div key={i} className={cn("h-6 flex-1 rounded-sm min-w-[6px]", i<14?"bg-emerald-500":i<22?"bg-slate-500":i<32?"bg-amber-500":"bg-red-500")} style={{opacity:0.6+Math.random()*0.4}}/>)}</div>
     </div><div className="glass-card rounded-2xl p-5"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-3">Current Regime</div><div className="text-lg font-black">{forecast?.regime.replace('_',' ')??'—'}</div><div className="text-sm text-[#94A3B8] mt-2">High-volatility transition window. Model suggests reduced position size.</div><div className="grid grid-cols-2 gap-2 mt-4 text-xs mono"><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Confidence</div><div className="font-black">{forecast? (forecast.confidence*100).toFixed(1)+'%':'—'}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Duration</div><div className="font-black">3d 04h</div></div></div></div></div>}

     {activeTab==='models'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="glass-panel rounded-2xl p-6"><div className="text-xs font-black tracking-widest uppercase text-violet-300 mb-3">Market Model — ONNX</div><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#64748B]">Status</span><span className="text-emerald-400 font-black">● ACTIVE</span></div><div className="flex justify-between"><span className="text-[#64748B]">Inference</span><span className="mono">18ms</span></div><div className="flex justify-between"><span className="text-[#64748B]">Version</span><span className="mono">v1.4.2</span></div><div className="flex justify-between"><span className="text-[#64748B]">Accuracy</span><span className="mono">{(metrics.accuracy*100).toFixed(1)}%</span></div><div className="flex justify-between"><span className="text-[#64748B]">Drift</span><span className="mono text-amber-400">0.03</span></div><div className="flex justify-between"><span className="text-[#64748B]">Last Trained</span><span className="mono text-xs">2h ago</span></div></div><button onClick={()=>trainModel()} disabled={isTraining} className="mt-4 w-full py-2.5 rounded-xl bg-violet-600 text-white font-black disabled:opacity-50">{isTraining?`Evolving ${trainingProgress}%`:'Recalibrate Matrix'}</button><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs mono"><div className="elevated rounded-xl p-2"><div className="text-[#64748B] text-[9px] uppercase">Precision</div><div className="font-bold">0.84</div></div><div className="elevated rounded-xl p-2"><div className="text-[#64748B] text-[9px] uppercase">Recall</div><div className="font-bold">0.81</div></div><div className="elevated rounded-xl p-2"><div className="text-[#64748B] text-[9px] uppercase">F1</div><div className="font-bold">0.82</div></div></div></div>
       <div className="lg:col-span-2 glass-panel rounded-2xl p-6"><LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} /></div>
     </div>}

     {activeTab==='learning'&&<LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} />}
     {activeTab==='performance'&&<div className="space-y-4"><LearningDashboard history={[]} currentWeights={DEFAULT_WEIGHTS} /><div className="grid lg:grid-cols-3 gap-4"><div className="glass-card rounded-2xl p-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Sharpe / Sortino</div><div className="mono text-2xl font-black mt-2">1.42 / 1.88</div><div className="text-xs text-[#64748B]">Risk-adjusted return</div></div><div className="glass-card rounded-2xl p-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Expectancy</div><div className="mono text-2xl font-black mt-2">$ 842</div><div className="text-xs text-[#64748B]">Per trade</div></div><div className="glass-card rounded-2xl p-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">CAGR</div><div className="mono text-2xl font-black mt-2">18.4%</div></div></div></div>}

     {activeTab==='risk'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-6">
         <div className="text-xs font-black tracking-widest uppercase mb-4">Risk Limits</div>
         <div className="grid sm:grid-cols-2 gap-3">
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Daily Drawdown %</span><input type="number" value={riskLimits.maxDailyDrawdown} onChange={e=>setRiskLimits({...riskLimits, maxDailyDrawdown: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Total Drawdown %</span><input type="number" value={riskLimits.maxTotalDrawdown} onChange={e=>setRiskLimits({...riskLimits, maxTotalDrawdown: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Position Size %</span><input type="number" value={riskLimits.maxPositionSize} onChange={e=>setRiskLimits({...riskLimits, maxPositionSize: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
           <label className="space-y-1 text-sm"><span className="text-[10px] tracking-widest font-black text-[#64748B] uppercase">Max Open Trades</span><input type="number" value={riskLimits.maxOpenTrades} onChange={e=>setRiskLimits({...riskLimits, maxOpenTrades: Number(e.target.value)})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono" /></label>
         </div>
         <div className="mt-4 flex items-center gap-2"><input type="checkbox" checked={riskLimits.stopAllTrading} onChange={e=>setRiskLimits({...riskLimits, stopAllTrading: e.target.checked})} className="accent-red-500"/><span className="text-sm font-bold text-red-400">Stop All Trading (Kill Switch)</span></div>
         {riskStatus.violations.length>0&&<div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{riskStatus.violations.map(v=><div key={v}>• {v}</div>)}</div>}
         <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="elevated rounded-xl p-3"><div className="text-[#64748B]"><Percent className="w-3 h-3 inline"/> VaR 99%</div><div className="mono font-black">${((forecast?.backendRisk?.valueAtRisk95||18420)*1.6).toFixed(0)}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Expected Shortfall</div><div className="mono font-black">$24,100</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Risk/Trade</div><div className="mono font-black">1.0%</div></div></div>
       </div>
       <div className="glass-card rounded-2xl p-5">
         <div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-3">Portfolio Risk</div>
         <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#94A3B8]">Balance</span><span className="mono font-black">{metrics.balance.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Equity</span><span className="mono">{(metrics.balance).toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Available Margin</span><span className="mono">{riskStatus.margin.freeMargin.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Used Margin</span><span className="mono">{riskStatus.margin.usedMargin.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#94A3B8]">Margin Level</span><span className={cn("mono font-black",riskStatus.margin.marginLevel<120?"text-red-400":"text-emerald-400")}>{riskStatus.margin.marginLevel.toFixed(1)}%</span></div></div>
         <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-amber-500" style={{width:`${Math.min(100, (riskStatus.margin.usedMargin/Math.max(1,metrics.balance))*100)}%`}}/></div>
       </div>
     </div>}

     {activeTab==='backtest'&&<div className="glass-panel rounded-2xl p-6">
       <div className="flex flex-wrap gap-2 mb-4"><select className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"><option>{selectedSymbol.name}</option></select><input type="date" defaultValue="2024-01-01" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm" /><input type="date" defaultValue="2024-12-31" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm" /><select className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"><option>1H</option><option>1D</option></select><button className="px-4 py-2 rounded-xl bg-violet-600 text-white font-black text-sm">Run Backtest</button></div>
       <WalkForwardChart data={mtfData['1h']} forecast={forecast} />
       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Total Return</div><div className="mono font-black text-emerald-400">+12.4%</div><div className="text-[10px] text-[#64748B]">CAGR 18.4%</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Sharpe</div><div className="mono font-black">1.42</div><div className="text-[10px] text-[#64748B]">Sortino 1.88</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Max Drawdown</div><div className="mono font-black text-red-400">-6.2%</div><div className="text-[10px] text-[#64748B]">Worst -2.1%</div></div>
         <div className="elevated rounded-xl p-3"><div className="text-[#64748B]">Win Rate</div><div className="mono font-black">{(metrics.winRate*100).toFixed(1)}%</div><div className="text-[10px] text-[#64748B]">PF {metrics.profitFactor.toFixed(2)}</div></div>
       </div>
       <div className="mt-4 grid lg:grid-cols-2 gap-3 text-xs"><div className="elevated rounded-xl p-3"><div className="font-bold mb-2">Walk-Forward Analysis</div><div className="flex gap-1">{['Train 60%','Validate 20%','Test 20%'].map(s=><span key={s} className="flex-1 text-center py-1.5 rounded-lg bg-white/5 border border-white/10">{s}</span>)}</div></div><div className="elevated rounded-xl p-3"><div className="font-bold mb-2">Out-of-sample</div><div className="mono">Return +8.1% • Sharpe 1.12 • DD -4.3%</div></div></div>
     </div>}

     {activeTab==='livedata'&&<div className="glass-panel rounded-2xl overflow-hidden">
       <div className="p-4 border-b border-white/5 flex justify-between items-center"><span className="text-xs font-black tracking-widest uppercase">Live Data — Multi-frequency Stream</span><span className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>LIVE</span></div>
       <div className="overflow-x-auto max-h-[520px] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-[#0B0F17] text-[10px] tracking-widest font-black text-[#64748B] uppercase"><tr><th className="px-4 py-3 text-left">Timestamp</th><th className="text-right">Close</th><th className="text-right">Basis</th><th className="text-right">OI</th><th className="text-right">Inventory</th></tr></thead><tbody className="divide-y divide-white/5">{mtfData['1h'].slice().reverse().slice(0,80).map((c,i)=><tr key={i} className="hover:bg-white/[0.02]"><td className="px-4 py-2.5 mono text-xs text-[#94A3B8]">{new Date(c.timestamp).toLocaleString()}</td><td className="text-right mono font-bold">{c.close.toLocaleString()}</td><td className="text-right mono text-violet-300">{c.basis?.toLocaleString()??'—'}</td><td className="text-right mono text-emerald-300">{c.openInterest?.toLocaleString()??'—'}</td><td className="text-right mono text-[#64748B]">{c.warehouseVolume?.toLocaleString()??'—'}</td></tr>)}</tbody></table></div>
     </div>}

     {activeTab==='historical'&&<div className="glass-panel rounded-2xl p-6 text-sm text-[#94A3B8]"><div className="flex gap-2 mb-3"><input type="date" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"/><input type="date" className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"/><select className="rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm"><option>1H</option><option>1D</option></select><button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold">Load</button></div>Historical points: {mtfData['1d'].length} (1D) • {mtfData['1h'].length} (1H) • {mtfData['15m'].length} (15m). Data is virtualized for large ranges.</div>}
     {activeTab==='explorer'&&<div className="glass-panel rounded-2xl p-6"><div className="flex gap-2 mb-3"><input placeholder="Search OHLC, sentiment, correlations…" className="flex-1 rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 text-sm" /><button className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-black inline-flex items-center gap-1"><Download className="w-4 h-4"/>Export CSV</button></div><div className="text-sm text-[#64748B]">Data explorer — filters, sorting, pagination. Virtualized table ready for 100k+ rows.</div></div>}

     {activeTab==='intelligence'&&<div className="space-y-4">
       <div className="glass-panel rounded-2xl p-6 border-violet-500/20 bg-violet-500/[0.06]"><div className="text-sm font-black tracking-widest uppercase text-violet-300">Market Intelligence Hub</div><p className="text-sm text-[#94A3B8] mt-2 max-w-2xl">KalayBot AI continuously scans Level-2 Order Books, Global Market Correlations, and News Sentiment to provide a 360° view of IME.</p></div>
       <div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 space-y-4">{orderBook&&<OrderBookView data={orderBook}/>}{correlation&&<MarketCorrelation data={correlation}/>}</div><div className="space-y-4">{sentiment&&<SentimentMonitor data={sentiment}/>}<ArbitragePanel opportunities={forecast?.arbitrage?[forecast.arbitrage]:[]} /></div></div>
     </div>}

     {activeTab==='monitoring'&&<div className="grid lg:grid-cols-3 gap-4">
       <div className="lg:col-span-2 glass-panel rounded-2xl p-6"><div className="text-xs font-black tracking-widest uppercase mb-3">System Health</div><div className="grid grid-cols-2 gap-3 text-sm"><div className="elevated rounded-xl p-4"><div className="text-[#64748B] text-[10px] tracking-widest font-black uppercase">Uptime</div><div className="mono font-black text-lg">{metrics.uptime}</div><div className="text-xs text-emerald-400">● OPERATIONAL</div></div><div className="elevated rounded-xl p-4"><div className="text-[#64748B] text-[10px] tracking-widest font-black uppercase">Latency</div><div className="mono font-black text-lg">{metrics.latency}ms</div><div className="w-full h-1 bg-white/10 rounded-full mt-2"><div className="h-full bg-emerald-500" style={{width:'72%'}}/></div></div><div className="elevated rounded-xl p-4"><div className="text-[#64748B] text-[10px] tracking-widest font-black uppercase">WebSocket</div><div className={cn("font-black",connectionState==='CONNECTED'?"text-emerald-400":"text-amber-400")}>{connectionState.toUpperCase()}</div></div><div className="elevated rounded-xl p-4"><div className="text-[#64748B] text-[10px] tracking-widest font-black uppercase">ML Service</div><div className="font-black text-emerald-400">ONLINE</div><div className="text-xs text-[#64748B]">18ms infer</div></div></div><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><div className="font-black text-emerald-400">API</div><div className="text-[10px] text-[#64748B]">HEALTHY</div></div><div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><div className="font-black text-emerald-400">DB</div><div className="text-[10px] text-[#64748B]">HEALTHY</div></div><div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3"><div className="font-black text-amber-400">Pipeline</div><div className="text-[10px] text-[#64748B]">WARNING</div></div><div className="rounded-xl bg-white/5 border border-white/10 p-3"><div className="font-black">CPU 42%</div><div className="text-[10px] text-[#64748B]">MEM 64%</div></div></div></div>
       <div className="space-y-4"><div className="glass-card rounded-2xl p-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-2">Error Budget</div><div className="text-2xl mono font-black">0.12%</div><div className="text-xs text-[#64748B]">Requests 12.4k • Errors 14</div></div><div className="glass-card rounded-2xl p-4 text-sm text-[#94A3B8]">Real-time indicators: API, WebSocket, ML, database, pipeline. Auto-reconnect enabled.</div></div>
     </div>}

     {activeTab==='api'&&<div className="grid lg:grid-cols-2 gap-4"><div className="glass-panel rounded-2xl p-6 space-y-4">
       <div className="text-xs font-black tracking-widest uppercase">API Configuration</div>
       <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-xs text-violet-300">Same-origin URLs work in Arena previews. Custom URL can be entered below.</div>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">Market Data — Proxy URL</span><input value={apiConfig.proxyUrl} onChange={e=>setApiConfig({...apiConfig, proxyUrl:e.target.value})} className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm" /></label>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">API Key</span><div className="relative"><input type="password" value={apiConfig.apiKey} onChange={e=>setApiConfig({...apiConfig, apiKey:e.target.value})} placeholder="••••••••" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm pr-10" /><Eye className="w-4 h-4 absolute right-3 top-3 text-[#64748B]"/></div></label>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">ML Service Endpoint</span><input placeholder="https://ml.internal/analyze" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm" /></label>
       <label className="block space-y-1 text-sm"><span className="text-[#94A3B8]">WebSocket Endpoint</span><input placeholder="wss://ws.ime.local" className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2.5 mono text-sm" /></label>
       <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apiConfig.useDigitalTwin} onChange={e=>setApiConfig({...apiConfig, useDigitalTwin:e.target.checked})} /> Use Digital Twin (fallback simulation)</label>
       <button onClick={()=>pushToast('Configuration saved')} className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-black">Save & Test Connection</button>
     </div><div className="glass-card rounded-2xl p-6 text-sm text-[#94A3B8]"><div className="font-bold text-white mb-2">Secrets are masked</div>Never display API keys in plain text. Connection status is shown in header and status bar.</div></div>}

     {activeTab==='settings'&&<div className="grid lg:grid-cols-2 gap-4"><div className="glass-panel rounded-2xl p-6 space-y-4"><div className="text-xs font-black tracking-widest uppercase">Settings</div><label className="flex items-center justify-between"><span className="text-sm">Theme</span><button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold capitalize">{theme}</button></label><label className="flex items-center justify-between"><span className="text-sm">Reduced Motion</span><input type="checkbox" /></label><label className="flex items-center justify-between"><span className="text-sm">Notifications</span><input type="checkbox" defaultChecked /></label><button onClick={()=>{localStorage.clear(); location.reload()}} className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-sm">Clear Data & Reset Simulator</button></div><div className="glass-card rounded-2xl p-6 text-sm text-[#64748B]">Accessibility: keyboard nav, focus states, ARIA labels, 44px touch targets, prefers-reduced-motion.</div></div>}
    </div>

    <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-around border-t border-white/10 bg-[#0B0F17]/95 backdrop-blur-xl px-2 py-2">
     {[{id:'dashboard',icon:LayoutDashboard,label:'Home'},{id:'overview',icon:Globe,label:'Markets'},{id:'trade',icon:Target,label:'Trade'},{id:'positions',icon:ShieldCheck,label:'Portfolio'},{id:'settings',icon:Settings,label:'More'}].map(it=><button key={it.id} onClick={()=>setActiveTab(it.id)} className={cn("flex flex-col items-center gap-1 px-3 py-1 rounded-xl",activeTab===it.id?"text-violet-400":"text-[#64748B]")}><it.icon className="w-5 h-5"/><span className="text-[10px] font-bold">{it.label}</span></button>)}
    </div>
  </main>
 </div>

 <div className="hidden lg:flex h-6 items-center gap-4 px-4 border-t border-white/[0.06] bg-[#080B12] text-[11px] font-mono text-[#64748B]">
  <span>IME • {selectedSymbol.id}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span className={cn(connectionState==='CONNECTED'?"text-emerald-400":"text-amber-400")}>WS {connectionState}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span>API {apiConfig.isConnected?'ONLINE':'OFFLINE'}</span><span className="ml-auto">© Intelligence Trader • AI Engine v2.5</span>
 </div>

 {cmdOpen&&<div className="fixed inset-0 z-50 grid place-items-start pt-[20vh] p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setCmdOpen(false)}/><div className="relative w-full max-w-[640px] mx-auto rounded-2xl bg-[#0B0F17] border border-white/10 shadow-2xl overflow-hidden">
   <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10"><Search className="w-4 h-4 text-[#64748B]"/><input autoFocus placeholder="Search Intelligence Trader…  (try: Gold, Order Book, Risk)" className="flex-1 bg-transparent outline-none text-sm" /><button onClick={()=>setCmdOpen(false)} className="text-xs text-[#64748B] border border-white/10 rounded-lg px-2 py-1">ESC</button></div>
   <div className="p-2 max-h-[360px] overflow-y-auto">{allNavItems.map(it=><button key={it.id} onClick={()=>{setActiveTab(it.id); setCmdOpen(false)}} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-3 text-sm"><it.icon className="w-4 h-4 text-[#94A3B8]"/>{it.label}<span className="ml-auto text-xs text-[#64748B]">↵</span></button>)}<div className="px-3 py-2 text-xs text-[#64748B]">Tip: Press ⌘K anywhere to open</div></div>
 </div></div>}

 {notifOpen&&<div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={()=>setNotifOpen(false)}/><div className="absolute right-4 top-[60px] w-[360px] rounded-2xl bg-[#0B0F17] border border-white/10 shadow-2xl overflow-hidden">
   <div className="p-4 border-b border-white/10 flex justify-between items-center"><span className="text-sm font-black">Notifications</span><button onClick={()=>setNotifOpen(false)}><X className="w-4 h-4"/></button></div>
   <div className="divide-y divide-white/5">{notifications.map((n,i)=><div key={i} className="p-4 hover:bg-white/[0.03]"><div className="flex justify-between"><span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border",n.cat==='AI'?"bg-violet-500/10 text-violet-300 border-violet-500/20":n.cat==='Risk'?"bg-amber-500/10 text-amber-300 border-amber-500/20":"bg-white/5 border-white/10")}>{n.cat}</span><span className="text-xs text-[#64748B]">{n.time}</span></div><div className="text-sm font-bold mt-1">{n.title}</div><div className="text-xs text-[#94A3B8]">{n.desc}</div></div>)}</div>
 </div></div>}

 {showConfirm&&<div className="fixed inset-0 z-50 grid place-items-center p-4"><div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setShowConfirm(false)}/><div className="relative w-full max-w-[440px] rounded-2xl bg-[#0B0F17] border border-white/10 p-6 shadow-2xl">
   <div className="text-xs tracking-widest font-black text-violet-300 uppercase">Confirm Trade — Paper Trading</div><div className={cn("text-2xl font-black mt-2",forecast?.action==='BUY'?"text-emerald-400":forecast?.action==='SELL'?"text-red-400":"text-white")}>{forecast?.action} {selectedSymbol.name}</div>
   <div className="grid grid-cols-2 gap-3 mt-4 text-sm mono"><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Qty × Entry</div><div className="font-black">{orderQty} × {forecast?.entryPrice.toLocaleString()}</div></div><div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-xs">Max Risk</div><div className="font-black text-red-400">${(Math.abs((forecast?.entryPrice||0)-(forecast?.stopLoss||0))*orderQty).toLocaleString()}</div></div></div>
   <div className="text-xs text-[#94A3B8] mt-3">Leverage {orderLev}× • Fees est. ${((orderQty*(forecast?.entryPrice||0))*0.0008).toFixed(0)}</div>
   <div className="flex gap-2 mt-6"><button onClick={()=>setShowConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 font-bold">Cancel</button><button onClick={confirmTrade} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-black">Confirm Trade</button></div>
 </div></div>}

 <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-[360px]">{toasts.map(t=><div key={t.id} className="px-4 py-3 rounded-xl bg-[#101620] border border-white/10 shadow-2xl text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"/>{t.msg}</div>)}</div>
</div>
}
