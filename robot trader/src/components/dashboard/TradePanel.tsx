import React from 'react';
import { BrainCircuit, Play, RefreshCcw, Zap } from 'lucide-react';
import { ExpertForecast, RiskStatus } from '../../types';

interface TradePanelProps {
  forecast: ExpertForecast | null;
  riskStatus: RiskStatus;
  onExecuteTrade: () => void;
  calculateKellySize: (price: number, atr: number, suggestedRisk?: number) => string;
}

export const TradePanel: React.FC<TradePanelProps> = ({ forecast, riskStatus, onExecuteTrade, calculateKellySize }) => {
  return (
    <div className="glass-panel rounded-3xl p-6 relative overflow-hidden transition-all duration-500 hover:shadow-indigo-500/10 shadow-2xl">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
        <BrainCircuit className="w-32 h-32 text-indigo-500" />
      </div>
      <h2 className="text-lg font-black mb-6 flex items-center gap-2 relative z-10 uppercase tracking-widest text-slate-200">
        <BrainCircuit className="w-5 h-5 text-purple-400 animate-pulse" />
        Neural Execution Signal
      </h2>
      
      {forecast ? (
        <div className="space-y-6 relative z-10">
          <div className={`p-6 rounded-2xl border backdrop-blur-md shadow-xl transition-all duration-500 transform hover:scale-[1.02] ${
            forecast.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/5' : 
            forecast.action === 'SELL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/5' : 
            'bg-slate-800/50 border-slate-700/50 text-slate-400'
          }`}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-4xl font-black tracking-tighter text-glow animate-in fade-in slide-in-from-left-4 duration-700">{forecast.action}</div>
              <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">
                Entry: {forecast.entryPrice.toLocaleString()}
              </div>
            </div>
            <div className="text-[11px] font-bold opacity-90 leading-relaxed italic">{forecast.reason}</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-4 rounded-2xl border-slate-800/50 hover:border-indigo-500/30 transition-colors group">
              <div className="text-[9px] text-slate-500 uppercase font-black text-center tracking-[0.2em] mb-2 group-hover:text-indigo-400 transition-colors">Position Size</div>
              <div className="text-lg font-mono text-center text-white font-black tracking-tighter">
                {calculateKellySize(forecast.entryPrice, forecast.indicators.atr, (forecast as any).backendRisk?.suggestedRiskCapital)}
              </div>
            </div>
            <div className="glass-card p-4 rounded-2xl border-slate-800/50 hover:border-rose-500/30 transition-colors group">
              <div className="text-[9px] text-slate-500 uppercase font-black text-center tracking-[0.2em] mb-2 group-hover:text-rose-400 transition-colors">VaR (95%)</div>
              <div className="text-lg font-mono text-center text-rose-400 font-black tracking-tighter">
                 {(((forecast as any).backendRisk?.var95 || 0) * 100).toFixed(2)}%
              </div>
            </div>
            <div className="glass-card p-4 rounded-2xl border-slate-800/50 hover:border-slate-600 transition-colors group">
              <div className="text-[9px] text-slate-500 uppercase font-black text-center tracking-[0.2em] mb-2 group-hover:text-slate-300 transition-colors">Regime</div>
              <div className="text-xs font-mono text-center text-slate-200 font-black uppercase tracking-widest">{forecast.regime.replace('_', ' ')}</div>
            </div>
            <div className="glass-card p-4 rounded-2xl border-slate-800/50 hover:border-emerald-500/30 transition-colors group">
              <div className="text-[9px] text-slate-500 uppercase font-black text-center tracking-[0.2em] mb-2 group-hover:text-emerald-400 transition-colors">Confidence</div>
              <div className="text-lg font-mono text-center text-emerald-400 font-black tracking-tighter">{(forecast.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>

          <button 
            onClick={onExecuteTrade}
            disabled={riskStatus.isKillSwitchActive}
            className={`w-full py-5 rounded-2xl font-black transition-all duration-500 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-[11px] shadow-2xl active:scale-95 ${
              riskStatus.isKillSwitchActive 
                ? 'bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700/50' 
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/20 hover:shadow-indigo-500/40 border border-indigo-400/30'
            }`}
          >
            <Play className={`w-4 h-4 transition-transform duration-500 ${riskStatus.isKillSwitchActive ? '' : 'group-hover:scale-125'}`} fill="currentColor" />
            Execute Alpha Sequence
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 uppercase tracking-[0.3em] text-[9px] font-black glass-card rounded-3xl border-dashed border-slate-800/50">
          <RefreshCcw className="w-10 h-10 mb-6 animate-spin-slow text-indigo-500/40" />
          Neural Weights Syncing...
        </div>
      )}
    </div>
  );
};
