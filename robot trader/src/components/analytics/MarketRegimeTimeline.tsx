import React, { useState } from 'react';
import { MarketRegime } from '../../types';
import { Activity, Clock, ShieldCheck, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface MarketRegimeTimelineProps {
  currentRegime?: MarketRegime;
  confidence?: number;
  duration?: string;
  className?: string;
}

export const MarketRegimeTimeline: React.FC<MarketRegimeTimelineProps> = ({
  currentRegime = 'TRENDING_UP',
  confidence = 0.87,
  duration = '4h 32m',
  className
}) => {
  const [activeTooltip, setActiveTooltip] = useState<{
    regime: string;
    conf: number;
    duration: string;
    time: string;
    vol: string;
  } | null>(null);

  // Generate realistic historical timeline blocks (BULL, SIDEWAYS, BEAR, HIGH_VOLATILITY)
  const segments = [
    { regime: 'BULLISH', raw: 'TRENDING_UP', color: 'bg-emerald-500', conf: 91, duration: '4h 32m', time: '12:00 - Present', width: '35%', vol: 'High' },
    { regime: 'SIDEWAYS', raw: 'RANGING', color: 'bg-slate-500', conf: 78, duration: '2h 15m', time: '09:45 - 12:00', width: '25%', vol: 'Low' },
    { regime: 'VOLATILE', raw: 'HIGH_VOLATILITY', color: 'bg-amber-500', conf: 84, duration: '3h 10m', time: '06:35 - 09:45', width: '20%', vol: 'Surge' },
    { regime: 'BEARISH', raw: 'TRENDING_DOWN', color: 'bg-rose-500', conf: 88, duration: '5h 40m', time: '00:55 - 06:35', width: '20%', vol: 'Medium' },
  ];

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

      {/* Horizontal Multi-block Timeline */}
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
                style={{ width: seg.width }}
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

        {/* Dynamic Tooltip / Detail Card */}
        {activeTooltip ? (
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-black text-white">{activeTooltip.regime} REGIME</span>
              <span className="text-[11px] text-[#94A3B8]">({activeTooltip.time})</span>
            </div>
            <div className="flex items-center gap-4 mono text-[11px]">
              <span>Conf: <strong className="text-violet-300">{activeTooltip.conf}%</strong></span>
              <span>Duration: <strong className="text-white">{activeTooltip.duration}</strong></span>
              <span>Vol: <strong className="text-sky-300">{activeTooltip.vol}</strong></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] mono text-[#64748B] px-1">
            <span>Past 16 Hours</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Tap / hover segment for metrics</span>
            <span>Live Detection</span>
          </div>
        )}
      </div>

      {/* Regime Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
        <div className="elevated rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Bullish Trend</div>
          <div className="font-black mono text-emerald-400 text-sm mt-0.5">35% / 4.5h</div>
        </div>
        <div className="elevated rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Sideways</div>
          <div className="font-black mono text-slate-300 text-sm mt-0.5">25% / 2.2h</div>
        </div>
        <div className="elevated rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">High Volatility</div>
          <div className="font-black mono text-amber-400 text-sm mt-0.5">20% / 3.1h</div>
        </div>
        <div className="elevated rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Bearish Trend</div>
          <div className="font-black mono text-rose-400 text-sm mt-0.5">20% / 5.6h</div>
        </div>
      </div>
    </div>
  );
};

export default MarketRegimeTimeline;
