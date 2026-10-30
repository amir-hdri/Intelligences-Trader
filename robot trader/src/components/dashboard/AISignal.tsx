import React from 'react';
import { TrendingUp, TrendingDown, Sparkles, Cpu, ShieldCheck, Gauge as GaugeIcon, Activity } from 'lucide-react';
import type { ExpertForecast } from '../../types';
import { Badge } from '../common/ui';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export const AISignal: React.FC<{
  forecast: ExpertForecast | null;
  compact?: boolean;
  className?: string;
}> = ({
  forecast,
  compact,
  className
}) => {
  if (!forecast) {
    return (
      <div
        className={cn(
          "glass-card rounded-3xl p-8 text-center border border-white/[0.08] relative overflow-hidden",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <div className="w-12 h-12 rounded-2xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 mx-auto flex items-center justify-center mb-3">
          <Sparkles className="w-6 h-6 text-[#00F0FF] animate-pulse" />
        </div>
        <h4 className="text-sm font-mono font-bold text-white">Synchronizing Neural Execution Weights</h4>
        <p className="text-xs text-[#849495] mt-1">Calibrating ensemble features from live order book depth...</p>
      </div>
    );
  }

  const isBuy = forecast.action === 'BUY';
  const isSell = forecast.action === 'SELL';
  const confPct = Math.round((forecast.confidence || 0) * 100);

  const expectedReturn = forecast.entryPrice > 0
    ? ((forecast.targetPrice - forecast.entryPrice) / forecast.entryPrice) * 100
    : 0;

  const riskScore = forecast.confidence > 0.75 ? 'LOW RISK' : forecast.confidence > 0.55 ? 'MODERATE' : 'ELEVATED';

  return (
    <section
      aria-label="AI Market Intelligence Signal"
      className={cn(
        "glass-panel rounded-3xl p-6 space-y-5 border border-white/[0.08] relative overflow-hidden transition-all duration-300",
        isBuy && "hover:border-[#10B981]/40 hover:shadow-[0_0_25px_rgba(16,185,129,0.12)]",
        isSell && "hover:border-[#EF4444]/40 hover:shadow-[0_0_25px_rgba(239,68,68,0.12)]",
        className
      )}
    >
      {/* Glow highlight in corner */}
      <div
        className={cn(
          "absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none",
          isBuy ? "bg-[#10B981]" : isSell ? "bg-[#EF4444]" : "bg-[#00F0FF]"
        )}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div>
            <div className="text-[11px] font-mono tracking-wider font-bold text-[#00F0FF] uppercase flex items-center gap-1.5">
              <span>Deep Quant Ensemble</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
            </div>
            <div className="text-[10px] text-[#849495] font-mono">Horizon: 4H TCN + LSTM Attention</div>
          </div>
        </div>

        <Badge tone={isBuy ? 'emerald' : isSell ? 'crimson' : 'slate'} dot>
          {forecast.action} RECOMMENDED
        </Badge>
      </div>

      {/* Primary Signal Display */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-[#849495] font-mono uppercase tracking-wider">Consensus Direction</div>
          <div className="flex items-center gap-2.5 mt-0.5">
            <span
              className={cn(
                "text-3xl sm:text-4xl font-black font-mono tracking-tight",
                isBuy ? "text-[#10B981]" : isSell ? "text-[#EF4444]" : "text-[#DAE2FD]"
              )}
            >
              {forecast.action}
            </span>
            {isBuy ? (
              <div className="w-9 h-9 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <TrendingUp className="w-5 h-5" />
              </div>
            ) : isSell ? (
              <div className="w-9 h-9 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                <TrendingDown className="w-5 h-5" />
              </div>
            ) : null}
          </div>
        </div>

        {/* Confidence Badge Meter */}
        <div className="text-right flex flex-col items-end">
          <span className="text-xs text-[#849495] font-mono uppercase tracking-wider">Inference Confidence</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white">{confPct}</span>
            <span className="text-sm font-mono text-[#00F0FF] font-bold">%</span>
          </div>
          <span className="text-[10px] font-mono text-[#10B981] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> {riskScore}
          </span>
        </div>
      </div>

      {/* Linear Confidence Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] uppercase font-mono font-bold tracking-wider text-[#849495]">
          <span>Neural Confidence Dispersion</span>
          <span className="text-[#DAE2FD]">{confPct}% Robustness</span>
        </div>
        <div className="h-2 w-full bg-[#060E20] border border-white/[0.08] rounded-full overflow-hidden p-[1px]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isBuy
                ? "bg-gradient-to-r from-[#00F0FF] to-[#10B981] shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                : isSell
                ? "bg-gradient-to-r from-[#F59E0B] to-[#EF4444] shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                : "bg-gradient-to-r from-[#8B5CF6] to-[#00F0FF]"
            )}
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>

      {/* 4 Feature Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#131B2E]/90 border border-white/[0.06] rounded-2xl p-3">
          <div className="text-[#849495] text-[9px] uppercase font-mono font-bold tracking-wider">Regime</div>
          <div className="text-white font-mono font-bold text-xs mt-1 capitalize truncate">
            {forecast.regime?.replace('_', ' ').toLowerCase() || 'Trending'}
          </div>
          <div className="text-[10px] text-[#00F0FF] font-mono mt-0.5">
            Gap: {forecast.bubbleGap ? `${(forecast.bubbleGap * 100).toFixed(1)}%` : '0.0%'}
          </div>
        </div>

        <div className="bg-[#131B2E]/90 border border-white/[0.06] rounded-2xl p-3">
          <div className="text-[#849495] text-[9px] uppercase font-mono font-bold tracking-wider">Target Return</div>
          <div
            className={cn(
              "font-mono font-black text-xs mt-1",
              expectedReturn >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
            )}
          >
            {expectedReturn >= 0 ? '+' : ''}{expectedReturn.toFixed(2)}%
          </div>
          <div className="text-[10px] text-[#849495] font-mono mt-0.5">4H Horizon</div>
        </div>

        <div className="bg-[#131B2E]/90 border border-white/[0.06] rounded-2xl p-3">
          <div className="text-[#849495] text-[9px] uppercase font-mono font-bold tracking-wider">Order Book Bias</div>
          <div className="text-[#00F0FF] font-mono font-bold text-xs mt-1">
            {((forecast.orderBookPressure || 0.5) * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-[#849495] font-mono mt-0.5">Bids vs Asks</div>
        </div>

        <div className="bg-[#131B2E]/90 border border-white/[0.06] rounded-2xl p-3">
          <div className="text-[#849495] text-[9px] uppercase font-mono font-bold tracking-wider">Sentiment Score</div>
          <div className="text-[#A78BFA] font-mono font-bold text-xs mt-1">
            {forecast.sentimentScore ? `${(forecast.sentimentScore * 100).toFixed(0)} / 100` : '50 / 100'}
          </div>
          <div className="text-[10px] text-[#849495] font-mono mt-0.5">NLP Macro Index</div>
        </div>
      </div>

      {/* Target Price Levels Table */}
      <div className="grid grid-cols-3 gap-2.5 font-mono text-xs">
        <div className="bg-[#060E20] border border-white/[0.08] rounded-2xl p-3 text-center">
          <div className="text-[#849495] text-[9px] uppercase tracking-wider font-bold">Entry Level</div>
          <div className="font-bold text-white text-sm mt-0.5">
            {forecast.entryPrice ? forecast.entryPrice.toLocaleString() : '—'}
          </div>
        </div>
        <div className="bg-[#060E20] border border-[#10B981]/25 rounded-2xl p-3 text-center shadow-[0_0_10px_rgba(16,185,129,0.1)]">
          <div className="text-[#10B981] text-[9px] uppercase tracking-wider font-bold">Target (TP)</div>
          <div className="font-bold text-[#10B981] text-sm mt-0.5">
            {forecast.targetPrice ? forecast.targetPrice.toLocaleString() : '—'}
          </div>
        </div>
        <div className="bg-[#060E20] border border-[#EF4444]/25 rounded-2xl p-3 text-center shadow-[0_0_10px_rgba(239,68,68,0.1)]">
          <div className="text-[#EF4444] text-[9px] uppercase tracking-wider font-bold">Stop Loss (SL)</div>
          <div className="font-bold text-[#EF4444] text-sm mt-0.5">
            {forecast.stopLoss ? forecast.stopLoss.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {/* AI Synthesis Summary */}
      {forecast.reason && (
        <div className="text-xs text-[#94A3B8] bg-[#060E20]/80 rounded-2xl p-3.5 border border-white/[0.06] leading-relaxed font-sans">
          <span className="text-[#00F0FF] font-mono font-bold text-[10px] uppercase block mb-1">
            Ensemble Synthesis:
          </span>
          {forecast.reason}
        </div>
      )}
    </section>
  );
};

export default AISignal;

