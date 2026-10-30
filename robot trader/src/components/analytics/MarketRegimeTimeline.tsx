import React, { useState, useMemo } from 'react';
import { MarketRegime } from '../../types';
import { Activity, Clock, Layers, Sparkles, ShieldAlert } from 'lucide-react';
import { Badge } from '../common/ui';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface MarketRegimeTimelineProps {
  currentRegime?: MarketRegime;
  confidence?: number;
  className?: string;
  history?: { regime: MarketRegime; timestamp: number; confidence: number }[];
}

const REGIME_STYLE: Record<MarketRegime, { label: string; color: string; text: string; border: string }> = {
  'TRENDING_UP': { label: 'BULLISH TREND', color: 'bg-[#10B981]', text: 'text-[#10B981]', border: 'border-[#10B981]/30' },
  'TRENDING_DOWN': { label: 'BEARISH DRIFT', color: 'bg-[#EF4444]', text: 'text-[#EF4444]', border: 'border-[#EF4444]/30' },
  'RANGING': { label: 'SIDEWAYS RANGE', color: 'bg-[#64748B]', text: 'text-[#94A3B8]', border: 'border-white/10' },
  'HIGH_VOLATILITY': { label: 'HIGH VOLATILITY', color: 'bg-[#F59E0B]', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30' },
};

export const MarketRegimeTimeline: React.FC<MarketRegimeTimelineProps> = ({
  currentRegime = 'RANGING',
  confidence = 0,
  className,
  history,
}) => {
  const [activeTooltip, setActiveTooltip] = useState<{
    regime: string;
    conf: number;
    time: string;
    vol: string;
  } | null>(null);

  const segments = useMemo(() => {
    const style = REGIME_STYLE[currentRegime] || REGIME_STYLE['RANGING'];
    const current = {
      regime: style.label,
      raw: currentRegime,
      color: style.color,
      conf: Math.round(confidence * 100),
      time: 'Current tick',
      vol: currentRegime === 'HIGH_VOLATILITY' ? 'Surge' : currentRegime === 'TRENDING_UP' ? 'High' : currentRegime === 'TRENDING_DOWN' ? 'Medium' : 'Low',
    };
    if (!history || history.length === 0) return [current];

    return [current, ...history.slice(0, 5).map((h) => {
      const mapped = REGIME_STYLE[h.regime] || REGIME_STYLE['RANGING'];
      const timeStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        regime: mapped.label,
        raw: h.regime,
        color: mapped.color,
        conf: Math.round(h.confidence * 100),
        time: timeStr,
        vol: h.regime === 'HIGH_VOLATILITY' ? 'Surge' : h.regime === 'TRENDING_UP' ? 'High' : h.regime === 'TRENDING_DOWN' ? 'Medium' : 'Low',
      };
    })];
  }, [currentRegime, confidence, history]);

  const activeStyle = REGIME_STYLE[currentRegime] || REGIME_STYLE['RANGING'];

  return (
    <div
      aria-label="Rule-Based Market Regime Classifier Timeline"
      className={cn("glass-panel rounded-3xl p-5 lg:p-6 space-y-4 border border-white/[0.08] font-mono", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/30 grid place-items-center">
            <Activity className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider uppercase text-white">
              Market Regime Classifier
            </h3>
            <span className="text-[10px] text-[#849495]">EMA20 / EMA50 trend and ATR volatility rules</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <Badge
            tone={currentRegime === 'TRENDING_UP' ? 'emerald' : currentRegime === 'TRENDING_DOWN' ? 'crimson' : currentRegime === 'HIGH_VOLATILITY' ? 'amber' : 'slate'}
            dot
          >
            {activeStyle.label}
          </Badge>
          <span className="text-white font-bold text-xs bg-[#060E20] px-3 py-1 rounded-xl border border-white/[0.1]">
            {(confidence * 100).toFixed(0)}% Signal Score
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative w-full h-8 rounded-xl bg-[#060E20] border border-white/[0.08] p-1 flex gap-1 overflow-x-auto scrollbar-none">
          {segments.map((seg, i) => {
            const isCurrent = i === 0;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setActiveTooltip(seg)}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={() => setActiveTooltip(seg)}
                style={{ width: isCurrent ? '40%' : `${Math.max(10, 60 / Math.max(1, segments.length - 1))}%` }}
                className={cn(
                  "h-full rounded-lg transition-all cursor-pointer flex items-center justify-center px-2 min-w-[70px] relative group",
                  seg.color,
                  isCurrent ? "opacity-100 ring-2 ring-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.4)]" : "opacity-50 hover:opacity-90"
                )}
              >
                <span className="text-[9px] font-black text-[#060E20] tracking-tight truncate uppercase">
                  {seg.regime}
                </span>
                {isCurrent && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-ping" />
                )}
              </button>
            );
          })}
        </div>

        {activeTooltip ? (
          <div className="p-3.5 rounded-2xl bg-[#060E20] border border-[#00F0FF]/30 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150 shadow-[0_0_15px_rgba(0,240,255,0.1)]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{activeTooltip.regime}</span>
              <span className="text-[11px] text-[#849495]">({activeTooltip.time})</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>Signal Score: <strong className="text-[#00F0FF]">{activeTooltip.conf}%</strong></span>
              <span>Volatility: <strong className="text-[#DAE2FD]">{activeTooltip.vol}</strong></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-[#849495] px-1 font-sans">
            <span>{history?.length ? `Last ${history.length + 1} observed transitions` : 'Online regime evaluation'}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#00F0FF]"/> Tap segment for detailed parameters</span>
            <span className="font-mono">Rule-Based Classifier</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
        {segments.slice(0, 4).map((seg, i) => (
          <div key={i} className="glass-card rounded-2xl p-3 border border-white/[0.08]">
            <div className="text-[9px] uppercase tracking-wider text-[#849495] font-bold">
              {i === 0 ? 'Current Regime' : `${seg.time}`}
            </div>
            <div className={cn("font-bold text-sm mt-0.5",
              seg.regime.includes('BULLISH') ? "text-[#10B981]" :
              seg.regime.includes('BEARISH') ? "text-[#EF4444]" :
              seg.regime.includes('VOLATILITY') ? "text-[#F59E0B]" : "text-[#DAE2FD]"
            )}>
              {seg.regime}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketRegimeTimeline;

