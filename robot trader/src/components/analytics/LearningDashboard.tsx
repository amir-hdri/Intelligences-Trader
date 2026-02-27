import React from 'react';
import { StoredPrediction } from '../../services/PredictionHistoryService';
import { StrategyWeights, DEFAULT_WEIGHTS } from '../../dataUtils';
import { BrainCircuit, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Target, Zap } from 'lucide-react';

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <BrainCircuit size={80} />
          </div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Adaptive Learning Status</h3>
          <div className="flex items-end gap-3">
             <span className="text-4xl font-black text-white">{completed.length}</span>
             <span className="text-sm font-bold text-slate-400 mb-2">Signals Analyzed</span>
          </div>
          <div className="mt-4 flex gap-2">
             <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20">{wins} Correct</span>
             <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded border border-rose-500/20">{completed.length - wins} Incorrect</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Real-time Accuracy</h3>
          <div className="flex items-end gap-3">
             <span className={`text-4xl font-black ${winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
               {winRate.toFixed(1)}%
             </span>
             <span className="text-sm font-bold text-slate-400 mb-2">Win Rate</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
             <div className={`h-full ${winRate >= 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${winRate}%` }} />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
           <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Current Strategy Bias</h3>
           <div className="space-y-3 mt-4">
             {weightChanges.slice(0, 3).map(w => (
               <div key={w.key} className="flex justify-between items-center">
                 <span className="text-xs font-bold uppercase text-slate-400">{w.key}</span>
                 <div className="flex items-center gap-2">
                   <div className={`h-1.5 w-16 rounded-full bg-slate-800 overflow-hidden`}>
                     <div
                       className={`h-full ${w.diff > 0 ? 'bg-emerald-500' : w.diff < 0 ? 'bg-rose-500' : 'bg-slate-500'}`}
                       style={{ width: `${Math.min(100, (w.current / 5) * 100)}%` }}
                     />
                   </div>
                   <span className={`text-xs font-mono font-bold ${w.diff > 0 ? 'text-emerald-400' : w.diff < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                     {w.diff > 0 ? '+' : ''}{w.diff.toFixed(2)}
                   </span>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Adaptive Weights Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full">
           <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-indigo-400">
             <Zap className="w-5 h-5" />
             Neural Weight Adjustments
           </h3>
           <div className="space-y-4">
             {weightChanges.map((w) => (
               <div key={w.key} className="group hover:bg-slate-800/30 p-3 rounded-lg transition-colors border border-transparent hover:border-slate-800">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold uppercase text-slate-300">{w.key}</span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${w.diff > 0.1 ? 'bg-emerald-500/10 text-emerald-400' : w.diff < -0.1 ? 'bg-rose-500/10 text-rose-400' : 'text-slate-500'}`}>
                      {w.current.toFixed(2)} (Default: {w.default})
                    </span>
                 </div>
                 <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                    {/* Default Marker */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10" style={{ left: `${(w.default / 5) * 100}%` }} />

                    {/* Current Value Bar */}
                    <div
                      className={`absolute top-0 bottom-0 transition-all duration-500 ${w.current > w.default ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${(w.current / 5) * 100}%` }}
                    />
                 </div>
                 <p className="text-[10px] text-slate-500 mt-1 italic">
                   {w.diff > 0.2 ? `System trusts ${w.key} signals heavily based on recent wins.` :
                    w.diff < -0.2 ? `System has reduced trust in ${w.key} due to false signals.` :
                    `Neutral weighting.`}
                 </p>
               </div>
             ))}
           </div>
        </div>

        {/* Prediction History Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
           <div className="p-6 border-b border-slate-800 flex justify-between items-center">
             <h3 className="text-lg font-bold flex items-center gap-2 text-indigo-400">
               <Target className="w-5 h-5" />
               Prediction Verification Log
             </h3>
             <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Last 50 Entries</span>
           </div>

           <div className="overflow-y-auto max-h-[600px]">
             <table className="w-full text-left text-xs">
               <thead className="bg-slate-800/50 text-slate-500 font-bold uppercase tracking-widest sticky top-0 backdrop-blur-md">
                 <tr>
                   <th className="px-6 py-4">Time</th>
                   <th className="px-6 py-4">Signal</th>
                   <th className="px-6 py-4 text-right">Target</th>
                   <th className="px-6 py-4 text-center">Result</th>
                   <th className="px-6 py-4">Outcome</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                 {history.slice(0, 50).map((p) => (
                   <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                     <td className="px-6 py-4 text-slate-400 font-mono">
                       {new Date(p.timestamp).toLocaleTimeString()}
                     </td>
                     <td className="px-6 py-4">
                       <div className="flex flex-col">
                         <span className={`font-black ${p.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {p.action} @ {p.entryPrice.toLocaleString()}
                         </span>
                         <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{p.reason}</span>
                       </div>
                     </td>
                     <td className="px-6 py-4 text-right font-mono text-slate-300">
                       {p.targetPrice.toLocaleString()}
                     </td>
                     <td className="px-6 py-4 text-center">
                       {p.status === 'WIN' && <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded font-bold border border-emerald-500/20"><CheckCircle size={12} /> WIN</span>}
                       {p.status === 'LOSS' && <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/10 text-rose-400 rounded font-bold border border-rose-500/20"><XCircle size={12} /> LOSS</span>}
                       {p.status === 'PENDING' && <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded font-bold border border-indigo-500/20"><Clock size={12} /> ACTIVE</span>}
                     </td>
                     <td className="px-6 py-4 font-mono text-slate-400">
                       {p.actualOutcome ? p.actualOutcome.toLocaleString() : '-'}
                     </td>
                   </tr>
                 ))}
                 {history.length === 0 && (
                   <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-600 font-bold uppercase tracking-widest">
                       No data recorded yet. Wait for market signals.
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
