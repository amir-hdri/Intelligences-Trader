import React from 'react';
import { Activity, ArrowRightLeft, RefreshCcw, ShieldAlert, Trash2, Zap } from 'lucide-react';
import { IME_SYMBOLS } from '../../constants';
import { SymbolInfo, SystemMetrics, ApiConfig } from '../../types';

interface DashboardHeaderProps {
  selectedSymbol: SymbolInfo;
  setSelectedSymbolId: (id: string) => void;
  loadData: () => void;
  isLoading: boolean;
  errorState: string | null;
  connectionState: string;
  metrics: SystemMetrics;
  handleRollover: () => void;
  clearData: () => void;
  setIsSidebarOpen: (open: boolean) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  selectedSymbol, setSelectedSymbolId, loadData, isLoading, errorState,
  connectionState, metrics, handleRollover, clearData, setIsSidebarOpen
}) => {
  return (
    <header className="h-16 border-b border-slate-800/50 bg-slate-900/60 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-2 lg:gap-4 text-xs">
        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <select 
          value={selectedSymbol.id}
          onChange={(e) => setSelectedSymbolId(e.target.value)}
          className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[120px] lg:max-w-none truncate transition-all"
        >
          {IME_SYMBOLS.map(symbol => (
            <option key={symbol.id} value={symbol.id}>{symbol.type}: {symbol.name}</option>
          ))}
        </select>
        <button onClick={loadData} disabled={isLoading} className="p-2 hover:bg-slate-800/80 rounded-lg transition-colors hidden sm:block">
          <RefreshCcw className={`w-4 h-4 text-indigo-400 ${isLoading ? 'animate-spin-slow' : ''}`} />
        </button>
        {selectedSymbol.type === 'FUTURES' && (
          <button onClick={handleRollover} className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 border border-indigo-600/20 rounded-lg font-black hover:bg-indigo-600/20 transition-all uppercase tracking-widest text-[9px]">
            <ArrowRightLeft className="w-3 h-3" />
            ROLLOVER
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 lg:gap-6">
        {errorState && (
            <div className="hidden lg:flex items-center gap-2 text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20 animate-pulse">
                <ShieldAlert className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-widest">System Warning</span>
            </div>
        )}
        <div className="flex items-center gap-2">
          <span className={`hidden sm:inline-block text-[9px] lg:text-[10px] font-black px-2 py-1 rounded border shadow-sm ${connectionState === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : connectionState === 'RECONNECTING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
            {connectionState}
          </span>
          <span className={`w-2 h-2 rounded-full animate-pulse-slow ${errorState ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
          <span className="hidden lg:inline-block text-sm font-mono text-slate-400 font-bold">{metrics.uptime}</span>
        </div>
        <div className="hidden lg:flex items-center gap-2 border-l border-slate-800/50 pl-6">
          <Activity className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-mono text-slate-400 font-bold">{metrics.latency}ms</span>
        </div>
         <div className="flex items-center gap-2 lg:border-l lg:border-slate-800/50 lg:pl-6">
          <span className="hidden sm:inline-block text-[9px] font-black text-slate-500 uppercase tracking-widest">Equity</span>
          <span className="text-xs lg:text-sm font-mono text-white font-black tracking-tight">{(metrics.balance || 1000000).toLocaleString()}</span>
        </div>
        <button onClick={clearData} className="text-slate-600 hover:text-rose-500 transition-colors ml-2" title="Reset All Data">
            <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
