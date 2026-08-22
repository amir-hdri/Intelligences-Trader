import React, { useMemo, useState } from 'react';
import type { CorrelationMetrics } from '../../types';
import { Globe, Maximize2, X } from 'lucide-react';

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
    <div className={cn('glass-panel flex flex-col justify-between rounded-2xl p-4 lg:p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-4 w-4 text-blue-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Cross-Asset Inputs</h3>
          {data.simulated && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-black uppercase text-amber-300">
              Simulated macro data
            </span>
          )}
        </div>
        <button
          onClick={() => setShowDetails(true)}
          className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-blue-300 hover:bg-white/[0.08]"
        >
          <Maximize2 className="h-3 w-3" /> Details
        </button>
      </div>

      <div className="space-y-2">
        {covariates.map(item => (
          <div key={item.symbol} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-black text-white">{item.symbol}</div>
                <div className="font-vazir text-[11px] text-[#64748B]">{item.name}</div>
              </div>
              <div className="text-right">
                <div className="mono font-bold text-slate-200">{Number.isFinite(item.value) ? item.value.toLocaleString() : 'N/A'}</div>
                <div className="text-[11px] text-[#64748B]">{item.suffix}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Number.isFinite(item.correlation) ? Math.min(100, Math.abs(item.correlation) * 100) : 0}%` }}
                />
              </div>
              <span className="w-12 text-right font-mono text-[11px] text-blue-300">
                {Number.isFinite(item.correlation) ? item.correlation.toFixed(2) : 'N/A'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-label="Correlation inputs" className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-[#0B0F19] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-blue-300">Available correlation inputs</h3>
              <button aria-label="Close correlation inputs" onClick={() => setShowDetails(false)} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl text-[#94A3B8] hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {availableCorrelations.length ? (
              <dl className="divide-y divide-white/5 text-xs">
                {availableCorrelations.map(([name, value]) => (
                  <div key={name} className="flex justify-between gap-4 py-3"><dt className="text-[#94A3B8]">{name}</dt><dd className="font-mono font-bold text-white">{value.toFixed(4)}</dd></div>
                ))}
              </dl>
            ) : (
              <p className="py-8 text-center text-sm text-[#64748B]">No measured correlation coefficients are available.</p>
            )}
            <p className="text-[11px] text-[#64748B]">No unobserved matrix cells are inferred or fabricated.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketCorrelation;
