import React from 'react';
import { LayoutDashboard, Layers, Globe, BarChart3, BrainCircuit, Zap, Target, ShieldCheck, History, Activity, Cpu, TrendingUp, ShieldAlert, Database, Search, Settings, Menu, X, ChevronDown, Bell, Sun, Moon, Command, Zap as ZapIcon } from 'lucide-react';
export type NavGroup={label:string; items:{id:string; label:string; icon:any}[]};
export const NAV:NavGroup[]=[
 {label:'Overview',items:[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard}]},
 {label:'Market Intelligence',items:[{id:'intelligence',label:'Intelligence Hub',icon:Layers},{id:'overview',label:'Market Overview',icon:Globe},{id:'orderbook',label:'Order Book',icon:BarChart3},{id:'correlations',label:'Correlations',icon:TrendingUp},{id:'sentiment',label:'Sentiment',icon:BrainCircuit},{id:'arbitrage',label:'Arbitrage',icon:Zap}]},
 {label:'Trading',items:[{id:'trade',label:'Trade',icon:Target},{id:'positions',label:'Positions',icon:ShieldCheck},{id:'orders',label:'Orders',icon:BarChart3},{id:'history',label:'Trade History',icon:History}]},
 {label:'AI / ML',items:[{id:'forecast',label:'AI Forecast',icon:BrainCircuit},{id:'regime',label:'Market Regime',icon:Activity},{id:'models',label:'Model Performance',icon:Cpu},{id:'learning',label:'Learning Dashboard',icon:TrendingUp}]},
 {label:'Analytics',items:[{id:'performance',label:'Performance',icon:BarChart3},{id:'risk',label:'Risk Analytics',icon:ShieldAlert},{id:'backtest',label:'Backtesting',icon:History}]},
 {label:'Data',items:[{id:'livedata',label:'Live Data',icon:Database},{id:'historical',label:'Historical Data',icon:Database},{id:'explorer',label:'Data Explorer',icon:Search}]},
 {label:'System',items:[{id:'monitoring',label:'System Health',icon:Activity},{id:'api',label:'API Configuration',icon:Settings},{id:'settings',label:'Settings',icon:Settings}]},
];
const cn=(...c:(string|false|undefined)[])=>c.filter(Boolean).join(' ');
export const Header:React.FC<{onMenu:()=>void; onCmd:()=>void; onNotif:()=>void; connectionState:string; forecast:any; symbolName:string; theme:string; setTheme:(t:any)=>void; collapsed:boolean; setCollapsed:(b:boolean)=>void; symbols:any[]; selectedId:string; setSelected:(s:string)=>void;}> = ({onMenu,onCmd,onNotif,connectionState,forecast,symbolName,theme,setTheme,collapsed,setCollapsed,symbols,selectedId,setSelected})=> (
  <header className="sticky top-0 z-30 h-[56px] flex items-center gap-3 px-3 lg:px-4 border-b bg-[#0B0F17]/90 backdrop-blur-xl border-white/[0.07]">
    <button aria-label="Open navigation" onClick={onMenu} className="lg:hidden p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center"><Menu className="w-5 h-5"/></button>
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-lg"><ZapIcon className="w-4 h-4 text-white"/></div>
      <div className="hidden sm:block"><div className="text-sm font-black tracking-tight leading-none">Intelligence Trader</div><div className="text-[10px] tracking-[0.16em] font-bold text-[#8B5CF6]">IME • AI TERMINAL</div></div>
      <span className="hidden lg:inline-flex ml-2 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest">● LIVE</span>
    </div>
    <div className="flex-1 flex justify-center px-2">
      <div className="hidden md:flex items-center gap-2 w-full max-w-[560px]">
        <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl bg-[#101620] border border-white/[0.07]">
          <Search className="w-4 h-4 text-[#64748B]"/><input aria-label="Search" placeholder="Search symbols, pages, trades…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#64748B]" onFocus={onCmd} />
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold text-[#64748B] border border-white/10 rounded-lg px-1.5 py-1"><Command className="w-3 h-3"/>K</span>
        </div>
        <select aria-label="Instrument selector" value={selectedId} onChange={e=>setSelected(e.target.value)} className="h-9 rounded-xl bg-[#101620] border border-white/[0.07] px-3 text-sm font-semibold min-h-[36px]">
          {symbols.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono">
        <span className={cn("w-2 h-2 rounded-full",connectionState==='CONNECTED'?"bg-emerald-500 animate-pulse":connectionState==='RECONNECTING'?"bg-amber-500 animate-pulse":"bg-red-500")} />
        <span className="text-[#94A3B8]">{connectionState}</span><span className="text-white/20">•</span><span className="text-[#94A3B8]">AI {forecast?'ACTIVE':'IDLE'}</span>
      </div>
      <button aria-label="Toggle theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center">{theme==='dark'?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
      <button aria-label="Notifications" onClick={onNotif} className="relative p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center"><Bell className="w-4 h-4"/><span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-black rounded-full grid place-items-center">3</span></button>
      <div aria-label="User profile" className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 grid place-items-center text-xs font-black">AT</div>
      <button aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} onClick={()=>setCollapsed(!collapsed)} className="hidden lg:grid place-items-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10"><ChevronDown className={cn("w-4 h-4 transition",collapsed&&"rotate-180")}/></button>
    </div>
  </header>
);
export const Sidebar:React.FC<{activeTab:string; setActiveTab:(s:string)=>void; collapsed:boolean; metrics:any}> = ({activeTab,setActiveTab,collapsed,metrics})=>(
  <aside className={cn("hidden lg:flex flex-col border-r bg-[#05070B] border-white/[0.07] sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto transition-all",collapsed?"w-[64px]":"w-[264px]") }>
    <nav aria-label="Primary" className="p-3 space-y-5">
      {NAV.map(g=><div key={g.label}>
        {!collapsed&&<div className="px-2 mb-2 text-[10px] tracking-[0.14em] font-black text-[#64748B] uppercase">{g.label}</div>}
        <div className="space-y-1">
          {g.items.map(it=>{
            const Icon=it.icon; const active=activeTab===it.id;
            return <button key={it.id} onClick={()=>setActiveTab(it.id)} aria-current={active?"page":undefined} title={collapsed?it.label:undefined} className={cn("w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition border min-h-[36px]", active?"bg-violet-600/15 border-violet-500/20 text-white":"border-transparent text-[#94A3B8] hover:bg-white/[0.06] hover:text-white")}>
              <Icon className={cn("w-4 h-4 shrink-0",active&&"text-violet-400")} />{!collapsed&&<span className="truncate font-semibold">{it.label}</span>}{active&&!collapsed&&<span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>}
            </button>
          })}
        </div>
      </div>)}
    </nav>
    <div className="mt-auto p-3">
      <div className={cn("rounded-2xl p-3 border", metrics.status==='OPERATIONAL'?"bg-emerald-500/5 border-emerald-500/20":"bg-amber-500/10 border-amber-500/20")}>
        <div className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full animate-pulse", metrics.status==='OPERATIONAL'?"bg-emerald-500":"bg-amber-500")}/><span className="text-xs font-black tracking-widest">{metrics.status.replace('_',' ')}</span></div>{!collapsed&&<div className="text-[10px] text-[#64748B] mt-1">Latency {metrics.latency}ms • Uptime {metrics.uptime}</div>}
      </div>
    </div>
  </aside>
);
export const MobileDrawer:React.FC<{open:boolean; onClose:()=>void; activeTab:string; setActiveTab:(s:string)=>void}> = ({open,onClose,activeTab,setActiveTab})=>{
  if(!open) return null;
  return <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/><div role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 w-[300px] bg-[#0B0F17] border-r border-white/10 overflow-y-auto p-4">
    <div className="flex items-center justify-between mb-4"><div className="font-black">Intelligence Trader</div><button aria-label="Close navigation" onClick={onClose} className="p-2 rounded-xl bg-white/10 min-h-[44px] min-w-[44px] grid place-items-center"><X className="w-5 h-5"/></button></div>
    {NAV.map(g=><div key={g.label} className="mb-4"><div className="text-[10px] tracking-widest font-black text-[#64748B] uppercase mb-2">{g.label}</div><div className="space-y-1">{g.items.map(it=><button key={it.id} onClick={()=>{setActiveTab(it.id); onClose()}} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-[44px]",activeTab===it.id?"bg-violet-600 text-white":"text-[#94A3B8]") }><it.icon className="w-4 h-4"/>{it.label}</button>)}</div></div>)}
  </div></div>
};
export const BottomNav:React.FC<{activeTab:string; setActiveTab:(s:string)=>void}> = ({activeTab,setActiveTab})=>(
  <nav aria-label="Mobile" className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-around border-t border-white/10 bg-[#0B0F17]/95 backdrop-blur-xl px-2 py-2">
    {[{id:'dashboard',icon:LayoutDashboard,label:'Home'},{id:'overview',icon:Globe,label:'Markets'},{id:'trade',icon:Target,label:'Trade'},{id:'positions',icon:ShieldCheck,label:'Portfolio'},{id:'settings',icon:Settings,label:'More'}].map(it=><button key={it.id} onClick={()=>setActiveTab(it.id)} aria-current={activeTab===it.id?"page":undefined} className={cn("flex flex-col items-center gap-1 px-3 py-1 rounded-xl min-h-[44px] min-w-[44px]",activeTab===it.id?"text-violet-400":"text-[#64748B]")}><it.icon className="w-5 h-5"/><span className="text-[10px] font-bold">{it.label}</span></button>)}
  </nav>
);
export const StatusBar:React.FC<{symbolId:string; connectionState:string; apiConnected:boolean}> = ({symbolId,connectionState,apiConnected})=>(
  <div className="hidden lg:flex h-6 items-center gap-4 px-4 border-t border-white/[0.06] bg-[#080B12] text-[11px] font-mono text-[#64748B]">
    <span>IME • {symbolId}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span className={cn(connectionState==='CONNECTED'?"text-emerald-400":"text-amber-400")}>WS {connectionState}</span><span className="w-1 h-1 rounded-full bg-white/20"/><span>API {apiConnected?'ONLINE':'OFFLINE'}</span><span className="ml-auto">© Intelligence Trader • AI Engine v2.5</span>
  </div>
);
