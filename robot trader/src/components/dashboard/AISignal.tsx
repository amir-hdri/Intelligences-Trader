import React from 'react';
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import type { ExpertForecast } from '../../types';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export const AISignal: React.FC<{ forecast: ExpertForecast | null; compact?: boolean; className?: string }> = ({
  forecast,
  compact,
  className
}) => {
  if (!forecast) {
    return (
      <div className={cn("glass-card rounded-2xl p-6 text-center text-xs text-[#64748B]", className)} role="status">
        <Sparkles className="w-5 h-5 mx-auto mb-2 text-violet-400 animate-spin-slow opacity-50" />
        Synchronizing Neural Execution Weights…
      </div>
    );
  }

  const isBuy = forecast.action === 'BUY';
  const isSell = forecast.action === 'SELL';
  const color = isBuy ? 'text-[#22C55E]' : isSell ? 'text-[#EF4444]' : 'text-[#94A3B8]';
  const badge = isBuy ? 'BUY' : isSell ? 'SELL' : 'HOLD';
  const confPct = Math.round(forecast.confidence * 100);
  const expectedReturn = forecast.entryPrice > 0
    ? ((forecast.targetPrice - forecast.entryPrice) / forecast.entryPrice) * 100
    : null;

  return (
    <section aria-label="AI market signal" className={cn("glass-card rounded-2xl p-5 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-[10px] tracking-[0.18em] font-black text-[#8B5CF6] uppercase">
            AI Market Intelligence
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#64748B]">
          Horizon: 4H
        </span>
      </div>

      {/* Main Signal Display */}
      <div className={cn("text-2xl sm:text-3xl font-black tracking-tighter flex items-center justify-between", color)}>
        <div className="flex items-center gap-2">
          <span>{badge}</span>
          {isBuy ? <TrendingUp className="w-6 h-6" /> : isSell ? <TrendingDown className="w-6 h-6" /> : null}
        </div>
        <span className="text-xs font-mono text-white/80 border border-white/10 rounded-full px-2.5 py-1 bg-white/[0.03]">
          {confPct}% Conf.
        </span>
      </div>

      {/* Clean Non-Gimmicky Confidence Meter */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
          <span>Research signal pipeline</span>
          <span className="text-violet-300 mono">{confPct}% Confidence</span>
        </div>
        <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-indigo-400 rounded-full transition-all duration-700"
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>

      {/* Grid of 4 Key Insights */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <div className="elevated rounded-xl p-3">
          <div className="text-[#64748B] text-[9px] uppercase tracking-widest font-bold">Regime</div>
          <div className="text-white font-bold text-xs mt-1 capitalize">{forecast.regime?.replace('_', ' ').toLowerCase() || 'Trending'}</div>
          <div className="text-[#64748B] text-[10px] mt-0.5">Gap: {forecast.bubbleGap ? `${(forecast.bubbleGap * 100).toFixed(1)}%` : '—'}</div>
        </div>

        <div className="elevated rounded-xl p-3">
          <div className="text-[#64748B] text-[9px] uppercase tracking-widest font-bold">Expected Return</div>
          <div className={cn("font-black mono text-sm mt-0.5", expectedReturn == null ? "text-[#64748B]" : expectedReturn >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>
            {expectedReturn == null ? '—' : `${expectedReturn >= 0 ? '+' : ''}${expectedReturn.toFixed(2)}%`}
          </div>
          <div className="text-[10px] text-[#64748B]">Target Projection</div>
        </div>

        <div className="elevated rounded-xl p-3">
          <div className="text-[#64748B] text-[9px] uppercase tracking-widest font-bold">Signal Strength</div>
          <div className={cn("font-black text-xs mt-1", forecast.confidence > 0.75 ? "text-[#22C55E]" : forecast.confidence > 0.55 ? "text-[#F59E0B]" : "text-[#64748B]")}>
            {forecast.confidence > 0.75 ? 'HIGH ALPHA' : forecast.confidence > 0.55 ? 'MODERATE' : 'WEAK'}
          </div>
          <div className="text-[10px] text-[#64748B]">Risk Score {forecast.confidence > 0.8 ? 'LOW' : 'MEDIUM'}</div>
        </div>

        <div className="elevated rounded-xl p-3">
          <div className="text-[#64748B] text-[9px] uppercase tracking-widest font-bold">Book Pressure</div>
          <div className="text-violet-300 font-black mono text-xs mt-1">{(forecast.orderBookPressure * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-[#64748B]">Observed / simulated input</div>
        </div>
      </div>

      {!compact && forecast.reason && (
        <div className="text-[11px] leading-relaxed text-[#94A3B8] bg-[#0B0F17] rounded-xl p-3 border border-white/[0.06]">
          {forecast.reason}
        </div>
      )}

      {/* Target Price Levels */}
      <div className="grid grid-cols-3 gap-2 text-[11px] mono">
        <div className="elevated rounded-xl p-2 text-center">
          <div className="text-[#64748B] text-[9px] uppercase">Entry</div>
          <div className="font-bold text-white">{forecast.entryPrice?.toLocaleString() || '—'}</div>
        </div>
        <div className="elevated rounded-xl p-2 text-center">
          <div className="text-[#64748B] text-[9px] uppercase">Target</div>
          <div className="font-bold text-[#22C55E]">{forecast.targetPrice?.toLocaleString() || '—'}</div>
        </div>
        <div className="elevated rounded-xl p-2 text-center">
          <div className="text-[#64748B] text-[9px] uppercase">Stop</div>
          <div className="font-bold text-[#EF4444]">{forecast.stopLoss?.toLocaleString() || '—'}</div>
        </div>
      </div>

      <p className="text-[10px] text-[#64748B] leading-relaxed">
        AI recommendations reflect probabilistic model inferences. Always review portfolio exposure limits.
      </p>
    </section>
  );
};

export default AISignal;
