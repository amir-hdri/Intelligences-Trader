import React from 'react';
import { ArbitrageOpportunity } from '../../types';
import { Zap, Activity, Repeat } from 'lucide-react';

interface ArbitragePanelProps {
  opportunities: ArbitrageOpportunity[];
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = ({ opportunities }) => {
  return (
    <div className="glass-panel p-5 rounded-3xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
      
      <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
        <Repeat className="w-3 h-3 text-indigo-400" />
        Arbitrage Scanner
      </h3>
      
      {opportunities.length === 0 ? (
        <div className="text-center py-10 glass-card rounded-2xl border-dashed border-slate-700/50">
          <Activity className="w-6 h-6 mx-auto mb-3 text-slate-700 animate-pulse-slow" />
          <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Efficiency Level 100%</div>
          <div className="text-slate-600 text-[11px] font-medium italic">Market in Equilibrium</div>
        </div>
      ) : (
        <div className="space-y-4">
          {opportunities.map((opt, i) => (
            <div key={i} className="glass-card p-4 rounded-2xl border-indigo-500/20 group relative overflow-hidden">
              <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 flex justify-between items-start mb-3">
                <div>
                  <div className="text-[9px] text-indigo-400 font-black uppercase tracking-widest mb-1">{opt.type.replace(/_/g, ' ')}</div>
                  <div className="text-white text-sm font-black tracking-tight">Convergence Signal</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-emerald-400 text-lg font-black text-glow">+{opt.profitPercentage.toFixed(2)}%</div>
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Expected Yield</div>
                </div>
              </div>
              <p className="relative z-10 text-[11px] text-slate-400 leading-relaxed mb-4">{opt.details}</p>
              <button className="relative z-10 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 border border-indigo-400/30">
                Execute Multi-Leg Spread
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-slate-800/50 flex justify-between items-center">
        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Scanning Spot vs Futures</span>
        <div className="flex items-center gap-2">
           <span className="relative flex h-2 w-2">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
           </span>
           <span className="text-[9px] font-black text-emerald-500 tracking-tighter">LIVE MONITOR</span>
        </div>
      </div>
    </div>
  );
};
