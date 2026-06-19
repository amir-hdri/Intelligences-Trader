import React from 'react';
import { StoredPrediction } from '../../services/PredictionHistoryService';
import { StrategyWeights, DEFAULT_WEIGHTS } from '../../dataUtils';
import { BrainCircuit, CheckCircle, XCircle, Clock, TrendingUp, Target, Zap, Activity } from 'lucide-react';

interface LearningDashboardProps {
  history: StoredPrediction[];
  currentWeights: StrategyWeights;
}

export const LearningDashboard: React.FC<LearningDashboardProps> = ({ history, currentWeights }) => {
  const completed = history.filter(p => p.status !== 'PENDING');
  const wins = completed.filter(p => p.status === 'WIN').length;
  const winRate = completed.length > 0 ? (wins / completed.length) * 100 : 0;

  const weightChanges = (Object.keys(currentWeights) as Array<keyof StrategyWeights>).map(key => ({
    key,
    current: currentWeights[key],
    default: DEFAULT_WEIGHTS[key],
    diff: currentWeights[key] - DEFAULT_WEIGHTS[key]
  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <div className="space-y-8">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <BrainCircuit size={100} />
          </div>
          <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-4">Neural Learning Context</h3>
          <div className="flex items-end gap-3 mb-6">
             <span className="text-5xl font-black text-white tracking-tighter text-glow">{completed.length}</span>
             <span className="text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Signals Resolved</span>
          </div>
          <div className="flex gap-2">
             <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg border border-emerald-500/20 shadow-sm">{wins} WINS</span>
             <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-black rounded-lg border border-rose-500/20 shadow-sm">{completed.length - wins} LOSSES</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-4">Verification Accuracy</h3>
          <div className="flex items-end gap-3 mb-6">
             <span className={`text-5xl font-black tracking-tighter text-glow ${winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
               {winRate.toFixed(1)}%
             </span>
             <span className="text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Hedge Ratio</span>
          </div>
          <div className="w-full bg-slate-800/50 h-1.5 rounded-full overflow-hidden border border-slate-700/20">
             <div className={`h-full transition-all duration-1000 ${winRate >= 50 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`} style={{ width: `${winRate}%` }} />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group col-span-1 sm:col-span-2 lg:col-span-1">
           <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-4">Neural Strategy Bias</h3>
           <div className="space-y-4">
             {weightChanges.slice(0, 3).map(w => (
               <div key={w.key} className="flex flex-col gap-1.5">
                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                   <span className="text-slate-400">{w.key}</span>
                   <span className={w.diff > 0 ? 'text-emerald-400' : w.diff < 0 ? 'text-rose-400' : 'text-slate-500'}>
                     {w.diff > 0 ? '+' : ''}{w.diff.toFixed(2)}
                   </span>
                 </div>
                 <div className="h-1 w-full rounded-full bg-slate-800/50 overflow-hidden border border-slate-700/10">
                   <div
                     className={`h-full transition-all duration-1000 ${w.diff > 0 ? 'bg-emerald-500' : w.diff < 0 ? 'bg-rose-500' : 'bg-slate-500'}`}
                     style={{ width: `${Math.min(100, (w.current / 5) * 100)}%` }}
                   />
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Adaptive Weights Panel */}
        <div className="glass-panel p-6 rounded-3xl h-full flex flex-col">
           <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
             <Zap className="w-3 h-3 text-indigo-400" />
             Weight Distribution
           </h3>
           <div className="space-y-6 flex-1">
             {weightChanges.map((w) => (
               <div key={w.key} className="group glass-card p-4 rounded-2xl transition-all border-slate-800/40 hover:scale-[1.02]">
                 <div className="flex justify-between items-center mb-3">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">{w.key}</span>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border ${w.diff > 0.1 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : w.diff < -0.1 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/50'}`}>
                      {w.current.toFixed(2)}
                    </div>
                 </div>
                 <div className="relative h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-slate-800/50">
                    <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/50 z-10" style={{ left: `${(w.default / 5) * 100}%` }} />
                    <div
                      className={`absolute top-0 bottom-0 transition-all duration-1000 ease-out ${w.current > w.default ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                      style={{ width: `${(w.current / 5) * 100}%` }}
                    />
                 </div>
               </div>
             ))}
           </div>
           <div className="mt-8 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">
                 <Activity className="w-3 h-3" />
                 Meta-Learning Info
              </div>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                 The ensemble controller is dynamically re-weighting technical indicators based on Bayesian probability of current regime stability.
              </p>
           </div>
        </div>

        {/* Prediction History Table */}
        <div className="lg:col-span-2 glass-panel rounded-3xl overflow-hidden flex flex-col">
           <div className="p-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/40">
             <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
               <Target className="w-3 h-3 text-indigo-400" />
               Signal Verification Log
             </h3>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rolling Window: 50 Signals</span>
           </div>

           <div className="overflow-y-auto max-h-[650px] scrollbar-thin scrollbar-thumb-slate-800/50">
             <table className="w-full text-left text-xs">
               <thead className="bg-slate-900/60 text-slate-500 font-black uppercase tracking-[0.15em] sticky top-0 backdrop-blur-xl z-10 border-b border-slate-800/50">
                 <tr>
                   <th className="px-6 py-5">Timestamp</th>
                   <th className="px-6 py-5">Alpha Signal</th>
                   <th className="px-6 py-5 text-right">Target</th>
                   <th className="px-6 py-5 text-center">Status</th>
                   <th className="px-6 py-5 text-right">Settlement</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/40">
                 {history.slice(0, 50).map((p) => (
                   <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                     <td className="px-6 py-4 text-slate-500 font-mono text-[10px]">
                       {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                     </td>
                     <td className="px-6 py-4">
                       <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2">
                           <span className={`font-black text-[11px] tracking-tight ${p.action === 'BUY' ? 'text-emerald-400 text-glow' : 'text-rose-400 text-glow'}`}>
                             {p.action}
                           </span>
                           <span className="text-slate-300 font-mono text-[11px]">@{p.entryPrice.toLocaleString()}</span>
                         </div>
                         <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight group-hover:text-slate-400 transition-colors">{p.reason.split('.')[0]}</span>
                       </div>
                     </td>
                     <td className="px-6 py-4 text-right font-mono text-[11px] text-slate-300">
                       {p.targetPrice.toLocaleString()}
                     </td>
                     <td className="px-6 py-4 text-center">
                       {p.status === 'WIN' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[9px] font-black border border-emerald-500/20 shadow-sm"><CheckCircle size={10} /> WIN</span>}
                       {p.status === 'LOSS' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-lg text-[9px] font-black border border-rose-500/20 shadow-sm"><XCircle size={10} /> LOSS</span>}
                       {p.status === 'PENDING' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-[9px] font-black border border-indigo-500/20 shadow-sm animate-pulse"><Clock size={10} /> ACTIVE</span>}
                     </td>
                     <td className="px-6 py-4 text-right font-mono text-[11px] text-slate-400">
                       {p.actualOutcome ? p.actualOutcome.toLocaleString() : '---'}
                     </td>
                   </tr>
                 ))}
                 {history.length === 0 && (
                   <tr>
                     <td colSpan={5} className="px-6 py-32 text-center text-slate-600 font-black uppercase tracking-[0.2em] italic opacity-40">
                        Awaiting Market Signals...
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
};
