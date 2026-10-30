import React from 'react';
import { ArbitrageOpportunity } from '../../types';
import { Zap, Activity, Repeat, ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '../common/ui';

interface ArbitragePanelProps {
  opportunities: ArbitrageOpportunity[];
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = ({ opportunities }) => {
  return (
    <div
      aria-label="Cross-Market Arbitrage Scanner"
      className="glass-panel p-5 lg:p-6 rounded-3xl overflow-hidden relative border border-white/[0.08] space-y-4"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">
              Cross-Market Arbitrage Scanner
            </h3>
            <span className="text-[10px] text-[#849495] font-sans">
              Spot vs forward basis spread detection
            </span>
          </div>
        </div>

        <Badge tone="amber" dot>
          SIMULATED FEED
        </Badge>
      </div>

      {opportunities.length === 0 ? (
        <div className="text-center py-10 rounded-2xl bg-[#060E20] border border-dashed border-white/[0.08] space-y-2">
          <Activity className="w-6 h-6 mx-auto text-[#00F0FF] opacity-60 animate-pulse" />
          <div className="text-white font-mono text-xs font-bold uppercase tracking-wider">
            Market Equilibrium Verified
          </div>
          <div className="text-[#849495] text-[11px] font-sans">
            No statistical basis mispricings exceeding net transaction cost friction.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opt, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-[#060E20] border border-white/[0.08] hover:border-[#00F0FF]/30 transition-all space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] font-mono font-bold text-[#00F0FF] uppercase tracking-wider px-2 py-0.5 rounded bg-[#00F0FF]/10 border border-[#00F0FF]/20">
                    {opt.type.replace(/_/g, ' ')}
                  </span>
                  <div className="text-white text-sm font-mono font-bold mt-1.5">
                    Basis Convergence Signal
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[#10B981] text-base font-black">
                    +{opt.profitPercentage.toFixed(2)}%
                  </div>
                  <div className="text-[8px] text-[#849495] uppercase font-bold">
                    Net Expected Alpha
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#DAE2FD] leading-relaxed font-sans">
                {opt.details}
              </p>

              <div className="w-full py-2.5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-[#F59E0B] text-[10px] font-mono font-bold uppercase tracking-wider text-center">
                Simulated Signal — Execution Disabled
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center text-[10px] font-mono text-[#849495]">
        <span>Basis spread derived from synthetic candle feed</span>
        <span className="text-[#F59E0B]">Detection only</span>
      </div>
    </div>
  );
};

export default ArbitragePanel;
