import React from 'react';
import { SentimentData } from '../../types';
import { Newspaper, MessageSquare, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface SentimentMonitorProps {
  data: SentimentData;
  className?: string;
}

export const SentimentMonitor: React.FC<SentimentMonitorProps> = ({ data, className }) => {
  const politicalRisk = data?.politicalRiskIndex || 50;
  const score = data?.score || 0.45;
  const sentimentLabel = data?.label || 'GREED';
  const confidence = 88;

  return (
    <div className={cn("glass-panel p-4 lg:p-5 rounded-3xl space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <h3 className="text-slate-300 font-black text-xs uppercase tracking-widest">
            NLP Sentiment & Political Risk
          </h3>
        </div>

        <span className={cn(
          "text-[9px] font-black px-2.5 py-0.5 rounded-full border",
          politicalRisk > 60
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            : politicalRisk < 40
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
        )}>
          {politicalRisk > 60 ? 'TENSION ELEVATED' : politicalRisk < 40 ? 'STABLE REGIME' : 'NEUTRAL TONE'}
        </span>
      </div>

      {/* Sentiment Gauge & Score Block */}
      <div className="p-4 glass-card rounded-2xl border border-white/[0.06] flex flex-wrap items-center gap-4">
        {/* Circular Gauge */}
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              className="text-slate-800"
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <circle
              className={cn(
                "transition-all duration-1000",
                politicalRisk > 50 ? 'text-amber-500' : 'text-emerald-500'
              )}
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeDasharray={`${politicalRisk}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-black text-white leading-none">
              {score > 0 ? '+' : ''}{(score * 100).toFixed(0)}
            </span>
            <span className="text-[7px] font-black text-slate-400 uppercase mt-0.5">Score</span>
          </div>
        </div>

        {/* Sentiment Timeline Text & Confidence */}
        <div className="flex-1 min-w-[160px] text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-black tracking-wider uppercase text-xs",
              sentimentLabel === 'GREED' ? 'text-emerald-400' : 'text-rose-400'
            )}>
              {sentimentLabel} BIAS
            </span>
            <span className="text-[10px] text-[#64748B]">• Conf: {confidence}%</span>
          </div>
          <div className="text-[11px] text-[#94A3B8] leading-relaxed">
            Market regime sentiment shows positive commodity momentum with moderate macro variance.
          </div>
        </div>
      </div>

      {/* News Feed Items */}
      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
        {data?.news && data.news.length > 0 ? (
          data.news.map((n) => (
            <div key={n.id} className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-all">
              <div className="flex justify-between items-start mb-1 text-[10px]">
                <span className={cn(
                  "font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px]",
                  n.impactEffect === 'DOLLAR_BULLISH'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                )}>
                  {n.impactEffect?.replace('_', ' ')}
                </span>
                <span className="mono text-[#64748B]">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-xs text-slate-200 font-medium leading-snug line-clamp-2">{n.title}</div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-xs text-[#64748B]">
            Aggregating NLP commodity intelligence feeds…
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentMonitor;
