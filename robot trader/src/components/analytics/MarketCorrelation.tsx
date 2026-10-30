import React, { useMemo, useState } from 'react';
import type { CorrelationMetrics } from '../../types';
import { Globe, Maximize2, X, TrendingUp, TrendingDown, Layers, Activity } from 'lucide-react';
import { Badge, Modal } from '../common/ui';

const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(' ');

interface MarketCorrelationProps {
  data: CorrelationMetrics;
  className?: string;
}

export const MarketCorrelation: React.FC<MarketCorrelationProps> = ({ data, className }) => {
  const [showDetails, setShowDetails] = useState(false);
  const covariates = useMemo(() => [
    { symbol: 'USD FREE', name: 'دلار آزاد', value: data.usdFree, suffix: 'IRR', correlation: data.correlations.USD_IME },
    { symbol: 'USD NIMA', name: 'دلار نیما', value: data.usdNima, suffix: 'IRR', correlation: data.correlations.USD_NIMA_IME },
    { symbol: 'GOLD (XAU)', name: 'انس جهانی طلا', value: data.globalGold, suffix: 'USD/oz', correlation: data.correlations.GOLD_IME },
    { symbol: 'COPPER (LME)', name: 'مس جهانی', value: data.globalCopper, suffix: 'USD/MT', correlation: data.correlations.COPPER_IME },
    { symbol: 'BRENT OIL', name: 'نفت برنت', value: data.globalBrent, suffix: 'USD/bbl', correlation: data.correlations.BRENT_PETRO },
  ], [data]);

  const availableCorrelations = Object.entries(data.correlations)
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]));

  return (
    <div
      aria-label="Cross-Asset Macro Correlation Matrix"
      className={cn('glass-panel flex flex-col justify-between rounded-3xl p-5 lg:p-6 border border-white/[0.08] relative overflow-hidden', className)}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Macro Covariates & Correlations
            </h3>
            <span className="text-[10px] text-[#849495] font-sans">
              Intermarket asset transmission coefficients
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data.simulated && (
            <Badge tone="amber">
              Simulated Macro
            </Badge>
          )}
          <button
            onClick={() => setShowDetails(true)}
            aria-label="View full correlation matrix"
            className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#060E20] px-3 py-1.5 text-xs font-mono font-bold text-[#00F0FF] hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-[#00F0FF]"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Details
          </button>
        </div>
      </div>

      {/* Covariates List */}
      <div className="space-y-2.5">
        {covariates.map(item => {
          const isPositive = (item.correlation || 0) >= 0;
          const absCorrelation = Math.min(100, Math.abs(item.correlation || 0) * 100);

          return (
            <div
              key={item.symbol}
              className="rounded-2xl border border-white/[0.06] bg-[#060E20] p-3 text-xs transition-all hover:border-white/15"
            >
              <div className="flex items-center justify-between gap-3 font-mono">
                <div>
                  <div className="font-bold text-white tracking-wide">{item.symbol}</div>
                  <div className="font-vazir text-[10px] text-[#849495]">{item.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-white text-xs">
                    {Number.isFinite(item.value) ? item.value.toLocaleString() : '—'}
                  </div>
                  <div className="text-[9px] text-[#849495]">{item.suffix}</div>
                </div>
              </div>

              {/* Correlation Bar & Coefficient */}
              <div className="mt-2.5 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#131B2E] p-[1px]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isPositive
                        ? "bg-gradient-to-r from-[#00F0FF]/60 to-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                        : "bg-gradient-to-r from-[#EF4444]/60 to-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                    )}
                    style={{ width: `${absCorrelation}%` }}
                  />
                </div>
                <span className={cn(
                  "w-12 text-right font-mono text-[11px] font-black",
                  isPositive ? "text-[#00F0FF]" : "text-[#EF4444]"
                )}>
                  {Number.isFinite(item.correlation) ? (item.correlation > 0 ? `+${item.correlation.toFixed(2)}` : item.correlation.toFixed(2)) : 'N/A'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="Full Covariance & Intermarket Matrix"
        maxWidth="md"
      >
        <div className="space-y-4 font-mono text-xs">
          {availableCorrelations.length ? (
            <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#060E20] border border-white/[0.08] p-3">
              {availableCorrelations.map(([name, value]) => {
                const isPos = value >= 0;
                return (
                  <div key={name} className="flex justify-between items-center py-2.5 px-2">
                    <span className="text-[#DAE2FD]">{name}</span>
                    <span className={cn("font-bold font-mono px-2 py-0.5 rounded-lg", isPos ? "bg-[#00F0FF]/10 text-[#00F0FF]" : "bg-[#EF4444]/10 text-[#EF4444]")}>
                      {value > 0 ? `+${value.toFixed(4)}` : value.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[#849495]">No measured correlation coefficients are available.</p>
          )}
          <p className="text-[10px] text-[#849495] leading-relaxed">
            Coefficients are computed via rolling Pearson correlation matrix of log-returns across 252-day lookback windows.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default MarketCorrelation;

