import React from 'react';
import { SentimentData } from '../../types';
import { MessageSquare, TrendingUp, TrendingDown, Flame, ShieldAlert, Newspaper, Radio } from 'lucide-react';
import { Badge } from '../common/ui';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface SentimentMonitorProps {
  data: SentimentData;
  className?: string;
}

export const SentimentMonitor: React.FC<SentimentMonitorProps> = ({ data, className }) => {
  const politicalRisk = Number.isFinite(data.politicalRiskIndex) ? data.politicalRiskIndex : 50;
  const score = Number.isFinite(data.score) ? data.score : 0;
  const sentimentLabel = data.label || 'NEUTRAL';

  return (
    <div
      aria-label="NLP Sentiment & Political Risk Monitor"
      className={cn("glass-panel p-5 lg:p-6 rounded-3xl space-y-4 border border-white/[0.08] relative overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">
              NLP Sentiment & Risk Index
            </h3>
            <span className="text-[10px] text-[#849495] font-sans">
              Transformer-based real-time news telemetry
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data.simulated && (
            <Badge tone="amber">
              Simulated News
            </Badge>
          )}

          <Badge
            tone={politicalRisk > 60 ? 'crimson' : politicalRisk < 40 ? 'emerald' : 'slate'}
            dot
          >
            {politicalRisk > 60 ? 'HIGH VOLATILITY' : politicalRisk < 40 ? 'LOW RISK REGIME' : 'NEUTRAL TONE'}
          </Badge>
        </div>
      </div>

      {/* Sentiment Gauge & Score Block */}
      <div className="p-4 rounded-2xl bg-[#060E20] border border-white/[0.06] flex flex-wrap items-center gap-4">
        {/* Circular Gauge */}
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              className="text-[#131B2E]"
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
                politicalRisk > 50 ? 'text-[#EF4444]' : 'text-[#10B981]'
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
          <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
            <span className={cn("text-sm font-black leading-none", score >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
              {score > 0 ? '+' : ''}{(score * 100).toFixed(0)}
            </span>
            <span className="text-[7px] font-bold text-[#849495] uppercase mt-0.5">SCORE</span>
          </div>
        </div>

        {/* Sentiment Timeline Text & Confidence */}
        <div className="flex-1 min-w-[160px] text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-mono font-black tracking-wider uppercase text-xs",
              sentimentLabel === 'GREED' ? 'text-[#10B981]' : sentimentLabel === 'FEAR' ? 'text-[#EF4444]' : 'text-[#00F0FF]'
            )}>
              {sentimentLabel} BIAS REGIME
            </span>
          </div>
          <div className="text-[11px] text-[#849495] leading-relaxed font-sans">
            Aggregate sentiment score <strong className="text-white font-mono">{(score * 100).toFixed(1)}</strong> from <strong className="text-white font-mono">{data.news?.length || 0}</strong> analyzed geopolitical & commodity intelligence dispatches.
          </div>
        </div>
      </div>

      {/* News Feed Items */}
      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
        {data?.news && data.news.length > 0 ? (
          data.news.map((n) => (
            <div
              key={n.id}
              className="p-3 rounded-2xl bg-[#060E20] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/10 transition-all space-y-1.5"
            >
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className={cn(
                  "font-bold px-2 py-0.5 rounded-md uppercase tracking-wider text-[9px] border",
                  n.impactEffect === 'DOLLAR_BULLISH'
                    ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25'
                    : n.impactEffect === 'DOLLAR_BEARISH'
                    ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25'
                    : 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25'
                )}>
                  {n.impactEffect?.replace('_', ' ')}
                </span>
                <span className="text-[#849495]">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-xs text-[#DAE2FD] font-medium leading-snug line-clamp-2">
                {n.title}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-xs text-[#849495] font-mono">
            Aggregating real-time Iranian commodity & macro intelligence feeds…
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentMonitor;

