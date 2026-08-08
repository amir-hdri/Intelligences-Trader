import React, { useState } from 'react';
import { CorrelationMetrics } from '../../types';
import { TrendingUp, Maximize2, X, Globe, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface MarketCorrelationProps {
  data: CorrelationMetrics;
  className?: string;
}

export const MarketCorrelation: React.FC<MarketCorrelationProps> = ({ data, className }) => {
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  const topCovariates = [
    { symbol: 'USD FREE', name: 'دلار آزاد', value: data?.usdFree || 650000, suffix: 'IRR', corr: 0.88, color: 'text-violet-400' },
    { symbol: 'USD NIMA', name: 'دلار نیما', value: data?.usdNima || 420000, suffix: 'IRR', corr: 0.76, color: 'text-sky-400' },
    { symbol: 'GOLD (XAU)', name: 'انس جهانی طلا', value: data?.globalGold || 2350, suffix: 'USD/oz', corr: 0.92, color: 'text-amber-400' },
    { symbol: 'COPPER (LME)', name: 'مس جهانی', value: data?.globalCopper || 8400, suffix: 'USD/MT', corr: 0.64, color: 'text-orange-400' },
    { symbol: 'BRENT OIL', name: 'نفت برنت', value: data?.globalBrent || 85, suffix: 'USD/bbl', corr: 0.45, color: 'text-emerald-400' },
  ];

  // Full correlation matrix matrix values
  const matrixLabels = ['IME', 'USD_FREE', 'USD_NIMA', 'GOLD', 'COPPER', 'OIL'];
  const fullMatrix = [
    [1.00, 0.88, 0.76, 0.92, 0.64, 0.45],
    [0.88, 1.00, 0.81, 0.84, 0.52, 0.38],
    [0.76, 0.81, 1.00, 0.70, 0.48, 0.30],
    [0.92, 0.84, 0.70, 1.00, 0.61, 0.42],
    [0.64, 0.52, 0.48, 0.61, 1.00, 0.58],
    [0.45, 0.38, 0.30, 0.42, 0.58, 1.00],
  ];

  return (
    <div className={cn("glass-panel p-4 lg:p-5 rounded-2xl flex flex-col justify-between", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-violet-400" />
          <h3 className="text-slate-300 font-black text-xs uppercase tracking-widest">
            Cross-Asset Correlation
          </h3>
        </div>

        <button
          onClick={() => setShowMatrixModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-violet-300 text-[11px] font-bold min-h-[32px]"
        >
          <Maximize2 className="w-3 h-3" />
          <span>View Matrix</span>
        </button>
      </div>

      {/* MOBILE COMPACT REPRESENTATION: Clean list with correlation badges */}
      <div className="block md:hidden space-y-2">
        {topCovariates.map((item) => (
          <div key={item.symbol} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs">
            <div>
              <div className="font-black text-white">{item.symbol}</div>
              <div className="text-[10px] text-[#64748B] font-vazir">{item.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="mono font-bold text-slate-200">{item.value.toLocaleString()}</div>
                <div className="text-[9px] text-[#64748B]">{item.suffix}</div>
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded-lg text-[10px] font-mono font-black border",
                item.corr > 0.7 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                item.corr > 0.4 ? "bg-violet-500/10 text-violet-300 border-violet-500/20" :
                "bg-white/5 text-[#94A3B8] border-white/10"
              )}>
                {item.corr > 0 ? '+' : ''}{item.corr.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP / TABLET SCROLLABLE MATRIX HEATMAP */}
      <div className="hidden md:block overflow-x-auto">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {topCovariates.slice(0, 4).map((item) => (
            <div key={item.symbol} className="glass-card p-3 rounded-xl">
              <div className="flex justify-between items-center text-[10px] text-[#64748B] font-bold uppercase mb-1">
                <span>{item.symbol}</span>
                <span className={item.color}>{item.corr > 0 ? '+' : ''}{item.corr.toFixed(2)}</span>
              </div>
              <div className="text-sm font-black mono text-white">
                {item.value.toLocaleString()} <span className="text-[9px] font-normal text-[#64748B]">{item.suffix}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Mini Correlation Progress Bars */}
        <div className="space-y-2 text-xs">
          {topCovariates.map((item) => (
            <div key={item.symbol} className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-[#64748B]">
                <span className="text-slate-300">{item.symbol} vs IME</span>
                <span className="mono text-violet-300">{(item.corr * 100).toFixed(0)}% Intensity</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-indigo-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.abs(item.corr) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FULL MATRIX MODAL */}
      {showMatrixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl bg-[#0B0F19] border border-white/10 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-violet-300">
                Full 6×6 Correlation Heatmap
              </h3>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-[#64748B] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs mono">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-2 text-left text-[10px] text-[#64748B]">ASSET</th>
                    {matrixLabels.map((l) => (
                      <th key={l} className="p-2 text-[10px] text-[#64748B]">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {matrixLabels.map((rowLabel, rIdx) => (
                    <tr key={rowLabel}>
                      <td className="p-2 text-left font-bold text-slate-300 text-[11px]">{rowLabel}</td>
                      {fullMatrix[rIdx].map((val, cIdx) => {
                        const intensity = Math.abs(val);
                        const isSelf = rIdx === cIdx;
                        return (
                          <td key={cIdx} className="p-2">
                            <span
                              className={cn(
                                "inline-block px-2 py-1 rounded text-[10px] font-black",
                                isSelf ? "bg-white/10 text-white" :
                                val > 0.8 ? "bg-emerald-500/20 text-emerald-300" :
                                val > 0.5 ? "bg-violet-500/20 text-violet-300" :
                                "bg-white/5 text-[#94A3B8]"
                              )}
                            >
                              {val.toFixed(2)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-[#64748B] pt-2">
              Values close to +1.0 indicate strong positive co-movement with Iranian Mercantile Exchange commodities.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketCorrelation;
