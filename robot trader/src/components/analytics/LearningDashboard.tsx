import React from 'react';
import { StoredPrediction } from '../../services/PredictionHistoryService';
import { StrategyWeights, DEFAULT_WEIGHTS } from '../../dataUtils';
import { BrainCircuit, CheckCircle, XCircle, Clock, Target, Zap, Activity, Cpu, Sparkles } from 'lucide-react';
import { Badge } from '../common/ui';

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
    <div
      aria-label="Online Learning & Neural Adaptive Engine"
      className="space-y-6 animate-in fade-in duration-300"
    >
      {/* Header Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#849495] font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-[#00F0FF]" /> Neural Signals Evaluated
            </h3>
            <Badge tone="cyan" dot>
              LIVE LEARNER
            </Badge>
          </div>

          <div className="flex items-baseline gap-3 mb-4 font-mono">
            <span className="text-4xl font-black text-white">{completed.length}</span>
            <span className="text-xs text-[#849495]">Resolved Invariants</span>
          </div>

          <div className="flex gap-2">
            <Badge tone="emerald">
              {wins} WINS
            </Badge>
            <Badge tone="crimson">
              {completed.length - wins} LOSSES
            </Badge>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#849495] font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-[#10B981]" /> Verification Hit Rate
            </h3>
            <span className="text-[10px] font-mono text-[#849495]">Rolling 50 Epochs</span>
          </div>

          <div className="flex items-baseline gap-3 mb-4 font-mono">
            <span className={`text-4xl font-black ${winRate >= 50 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {winRate.toFixed(1)}%
            </span>
            <span className="text-xs text-[#849495]">Ensemble Precision</span>
          </div>

          <div className="w-full bg-[#060E20] h-2 rounded-full overflow-hidden border border-white/[0.08] p-[1px]">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${winRate >= 50 ? 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
              style={{ width: `${winRate}%` }}
            />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden border border-white/[0.08] col-span-1 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#849495] font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#A78BFA]" /> Active Sub-Model Biases
            </h3>
            <span className="text-[10px] font-mono text-[#00F0FF]">Bayesian Tuning</span>
          </div>

          <div className="space-y-3 font-mono">
            {weightChanges.slice(0, 3).map(w => (
              <div key={w.key} className="space-y-1">
                <div className="flex justify-between items-center text-[10px] uppercase">
                  <span className="text-white font-bold">{w.key}</span>
                  <span className={w.diff > 0 ? 'text-[#10B981] font-bold' : w.diff < 0 ? 'text-[#EF4444] font-bold' : 'text-[#849495]'}>
                    {w.diff > 0 ? '+' : ''}{w.diff.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#060E20] overflow-hidden border border-white/[0.06]">
                  <div
                    className={`h-full transition-all duration-500 ${w.diff > 0 ? 'bg-[#10B981]' : w.diff < 0 ? 'bg-[#EF4444]' : 'bg-[#00F0FF]'}`}
                    style={{ width: `${Math.min(100, (w.current / 5) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Adaptive Weights Panel */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col border border-white/[0.08] space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#00F0FF] flex items-center gap-2">
              <Zap className="w-4 h-4" /> Strategy Weights Distribution
            </h3>
          </div>

          <div className="space-y-3 flex-1 font-mono">
            {weightChanges.map((w) => (
              <div key={w.key} className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06] hover:border-white/15 transition-all space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white font-bold uppercase">{w.key}</span>
                  <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${w.diff > 0.1 ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25' : w.diff < -0.1 ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25' : 'bg-white/[0.04] text-[#849495] border-white/10'}`}>
                    {w.current.toFixed(2)}
                  </div>
                </div>

                <div className="relative h-2 bg-[#131B2E] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${w.current > w.default ? 'bg-gradient-to-r from-[#10B981]/60 to-[#10B981]' : 'bg-gradient-to-r from-[#EF4444]/60 to-[#EF4444]'}`}
                    style={{ width: `${(w.current / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-[#060E20] border border-white/[0.06] rounded-2xl space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-[#00F0FF] uppercase tracking-wider">
              <Activity className="w-3 h-3" /> Meta-Learning Controller
            </div>
            <p className="text-[11px] text-[#849495] leading-relaxed font-sans">
              The neural meta-controller dynamically updates sub-model alphas according to recent regime performance and loss gradients.
            </p>
          </div>
        </div>

        {/* Prediction History Table */}
        <div className="lg:col-span-2 glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/[0.08]">
          <div className="p-5 lg:p-6 border-b border-white/[0.06] flex justify-between items-center bg-[#060E20]/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">
                Signal Verification Stream
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#849495] uppercase">
              Window: 50 Signals
            </span>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#060E20] text-[#849495] font-bold uppercase tracking-wider sticky top-0 border-b border-white/[0.06] z-10">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Alpha Signal</th>
                  <th className="px-5 py-3.5 text-right">Target</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {history.slice(0, 50).map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5 text-[#849495] text-[10px]">
                      {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${p.action === 'BUY' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                          {p.action}
                        </span>
                        <span className="text-white">@{p.entryPrice.toLocaleString()}</span>
                      </div>
                      <span className="text-[9px] text-[#849495] truncate block max-w-xs">{p.reason.split('.')[0]}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-white">
                      {p.targetPrice.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {p.status === 'WIN' && <Badge tone="emerald" dot>WIN</Badge>}
                      {p.status === 'LOSS' && <Badge tone="crimson" dot>LOSS</Badge>}
                      {p.status === 'PENDING' && <Badge tone="amber" dot>ACTIVE</Badge>}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[#849495]">
                      {p.actualOutcome ? p.actualOutcome.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-24 text-center text-[#849495] uppercase tracking-wider">
                      Awaiting live market signals…
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

export default LearningDashboard;

