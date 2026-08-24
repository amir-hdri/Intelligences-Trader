import React, { useState, useMemo } from 'react';
import { MarketRegime } from '../../types';
import { Activity, Clock } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface MarketRegimeTimelineProps {
  currentRegime?: MarketRegime;
  confidence?: number;
  className?: string;
  history?: { regime: MarketRegime; timestamp: number; confidence: number }[];
}

const REGIME_STYLE: Record<MarketRegime, { label: string; color: string }> = {
  'TRENDING_UP': { label: 'BULLISH', color: 'bg-emerald-500' },
  'TRENDING_DOWN': { label: 'BEARISH', color: 'bg-rose-500' },
  'RANGING': { label: 'SIDEWAYS', color: 'bg-slate-500' },
  'HIGH_VOLATILITY': { label: 'VOLATILE', color: 'bg-amber-500' },
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

  // Render ONLY observed detections. Without a supplied history we show the
  // current detection alone — inventing past regimes would present unobserved
  // analytics as measured HMM output.
  const segments = useMemo(() => {
    const style = REGIME_STYLE[currentRegime] || REGIME_STYLE['RANGING'];
    const current = {
      regime: style.label,
      raw: currentRegime,
      color: style.color,
      conf: Math.round(confidence * 100),
      time: 'Current detection',
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

  return (
    <div className={cn("glass-panel rounded-2xl p-4 lg:p-5 space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-black tracking-widest uppercase text-violet-300">
            Market Regime Timeline
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Current:</span>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider",
            currentRegime === 'TRENDING_UP' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
            currentRegime === 'TRENDING_DOWN' ? "bg-rose-500/10 text-red-400 border-rose-500/20" :
            currentRegime === 'HIGH_VOLATILITY' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
            "bg-slate-500/10 text-slate-300 border-slate-500/20"
          )}>
            {currentRegime.replace('_', ' ')}
          </span>
          <span className="mono font-bold text-white text-[11px]">{(confidence * 100).toFixed(0)}% Conf</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative w-full h-8 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1 flex gap-1 overflow-x-auto scrollbar-none">
          {segments.map((seg, i) => {
            const isCurrent = i === 0;
            return (
              <div
                key={i}
                onMouseEnter={() => setActiveTooltip(seg)}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={() => setActiveTooltip(seg)}
                style={{ width: isCurrent ? '35%' : `${Math.max(10, 65 / Math.max(1, segments.length - 1))}%` }}
                className={cn(
                  "h-full rounded-lg transition-all cursor-pointer flex items-center justify-center px-2 min-w-[70px] relative group",
                  seg.color,
                  isCurrent ? "opacity-95 ring-2 ring-violet-400 shadow-lg" : "opacity-60 hover:opacity-90"
                )}
              >
                <span className="text-[10px] font-black text-black tracking-tight truncate uppercase">
                  {seg.regime}
                </span>
                {isCurrent && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-ping" />
                )}
              </div>
            );
          })}
        </div>

        {activeTooltip ? (
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-black text-white">{activeTooltip.regime} REGIME</span>
              <span className="text-[11px] text-[#94A3B8]">({activeTooltip.time})</span>
            </div>
            <div className="flex items-center gap-4 mono text-[11px]">
              <span>Conf: <strong className="text-violet-300">{activeTooltip.conf}%</strong></span>
              <span>Vol: <strong className="text-sky-300">{activeTooltip.vol}</strong></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] mono text-[#64748B] px-1">
            <span>{history?.length ? `Last ${history.length + 1} detections` : 'Awaiting regime history'}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Tap / hover segment for metrics</span>
            <span>HMM Detection</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1 text-xs">
        {segments.slice(0, 4).map((seg, i) => (
          <div key={i} className="elevated rounded-xl p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">
              {i === 0 ? 'Current Regime' : `${seg.time}`}
            </div>
            <div className={cn("font-black mono text-sm mt-0.5",
              seg.regime === 'BULLISH' ? "text-emerald-400" :
              seg.regime === 'BEARISH' ? "text-rose-400" :
              seg.regime === 'VOLATILE' ? "text-amber-400" : "text-slate-300"
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
