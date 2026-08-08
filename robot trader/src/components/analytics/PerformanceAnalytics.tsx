import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Calendar,
  PieChart,
  Activity,
  Layers,
  Percent,
  Sliders,
  DollarSign
} from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface PerformanceAnalyticsProps {
  balance?: number;
  winRate?: number;
  profitFactor?: number;
  className?: string;
}

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  balance = 1000000,
  winRate = 0.68,
  profitFactor = 2.45,
  className
}) => {
  const [activeTab, setActiveTab] = useState<'equity' | 'drawdown' | 'monthly' | 'distribution' | 'scatter'>('equity');

  // Simulated 30-day equity curve vs benchmark
  const equityPoints = useMemo(() => {
    const points = [];
    let eq = balance * 0.85;
    let bmk = balance * 0.90;
    const now = Date.now();
    for (let i = 30; i >= 0; i--) {
      const dayTime = now - i * 24 * 60 * 60 * 1000;
      const change = (Math.sin(i * 0.4) * 0.015 + (Math.random() - 0.4) * 0.02) * eq;
      const bmkChange = (Math.sin(i * 0.3) * 0.008 + (Math.random() - 0.48) * 0.012) * bmk;
      eq += change;
      bmk += bmkChange;
      points.push({
        day: 30 - i,
        time: new Date(dayTime).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        equity: Math.round(eq),
        benchmark: Math.round(bmk),
        drawdown: -Math.max(0, Math.min(12, Math.abs(Math.sin(i * 0.5) * 6.5 + (Math.random() * 2))))
      });
    }
    return points;
  }, [balance]);

  const maxEquity = Math.max(...equityPoints.map((p) => p.equity));
  const minEquity = Math.min(...equityPoints.map((p) => p.equity));
  const maxDd = Math.min(...equityPoints.map((p) => p.drawdown));

  // Monthly returns matrix (Years x Months)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyData = [
    { year: 2026, returns: [3.4, 2.1, -1.2, 4.5, 1.8, 5.2, 3.1, 2.8, null, null, null, null], ytd: 23.8 },
    { year: 2025, returns: [1.8, 4.2, 2.9, -0.8, 3.7, 6.1, 2.4, -1.5, 4.0, 3.2, 5.1, 2.0], ytd: 38.6 },
    { year: 2024, returns: [2.5, 1.9, 3.8, 4.1, -2.1, 1.5, 3.9, 4.8, 2.2, -0.4, 3.5, 4.2], ytd: 29.4 },
  ];

  // P&L Distribution buckets
  const pnlBuckets = [
    { range: '< -$1k', count: 4, pct: 6 },
    { range: '-$500 to -$1k', count: 8, pct: 12 },
    { range: '$0 to -$500', count: 12, pct: 18 },
    { range: '$0 to +$500', count: 19, pct: 28 },
    { range: '+$500 to +$1k', count: 16, pct: 24 },
    { range: '> +$1k', count: 9, pct: 12 },
  ];

  return (
    <div className={cn("glass-panel p-4 lg:p-6 rounded-3xl space-y-6", className)}>
      {/* Header with KPI cards & Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-violet-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            Performance & Return Analytics
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Statistical distribution, drawdown profiles, and benchmark alpha metrics.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08] text-xs font-black overflow-x-auto scrollbar-none">
          {(['equity', 'drawdown', 'monthly', 'distribution', 'scatter'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all capitalize whitespace-nowrap min-h-[32px]",
                activeTab === t ? "bg-violet-600 text-white shadow-sm" : "text-[#94A3B8] hover:text-white"
              )}
            >
              {t === 'equity' ? 'Equity Curve' : t === 'drawdown' ? 'Drawdown' : t === 'monthly' ? 'Monthly Heatmap' : t === 'distribution' ? 'P&L Dist' : 'Risk/Return'}
            </button>
          ))}
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="elevated rounded-2xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Sharpe Ratio</div>
          <div className="text-2xl font-black mono text-emerald-400 mt-1">2.48</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Sortino: 3.12</div>
        </div>
        <div className="elevated rounded-2xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Win Rate</div>
          <div className="text-2xl font-black mono text-violet-300 mt-1">{(winRate * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Profit Factor: {profitFactor.toFixed(2)}</div>
        </div>
        <div className="elevated rounded-2xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Max Drawdown</div>
          <div className="text-2xl font-black mono text-rose-400 mt-1">{maxDd.toFixed(2)}%</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Recovery: 4.2 days</div>
        </div>
        <div className="elevated rounded-2xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Annualized CAGR</div>
          <div className="text-2xl font-black mono text-sky-400 mt-1">+34.8%</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Benchmark Alpha: +18.2%</div>
        </div>
      </div>

      {/* 1. EQUITY CURVE TIME SERIES */}
      {activeTab === 'equity' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              Intelligence Trader Portfolio
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              IME Benchmark Index
            </span>
          </div>

          <div className="h-64 w-full relative bg-[#06080E] rounded-2xl border border-white/[0.05] p-3">
            <svg width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none" className="overflow-visible">
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.33, 0.66, 1].map((pct) => (
                <line
                  key={pct}
                  x1="10"
                  y1={20 + 190 * pct}
                  x2="790"
                  y2={20 + 190 * pct}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />
              ))}

              {/* Benchmark Line */}
              <path
                d={equityPoints
                  .map((p, i) => {
                    const x = 10 + (i / (equityPoints.length - 1)) * 780;
                    const y = 220 - ((p.benchmark - minEquity * 0.95) / (maxEquity - minEquity * 0.95)) * 190;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ')}
                stroke="#64748B"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                fill="none"
              />

              {/* Portfolio Area & Line */}
              <path
                d={
                  equityPoints
                    .map((p, i) => {
                      const x = 10 + (i / (equityPoints.length - 1)) * 780;
                      const y = 220 - ((p.equity - minEquity * 0.95) / (maxEquity - minEquity * 0.95)) * 190;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .join(' ') + ` L 790 220 L 10 220 Z`
                }
                fill="url(#equityGrad)"
              />
              <path
                d={equityPoints
                  .map((p, i) => {
                    const x = 10 + (i / (equityPoints.length - 1)) * 780;
                    const y = 220 - ((p.equity - minEquity * 0.95) / (maxEquity - minEquity * 0.95)) * 190;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ')}
                stroke="#8B5CF6"
                strokeWidth="2.5"
                fill="none"
              />
            </svg>
          </div>
        </div>
      )}

      {/* 2. DRAWDOWN AREA CHART */}
      {activeTab === 'drawdown' && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-[#94A3B8]">
            <span>Underwater Drawdown Profile</span>
            <span className="text-rose-400 font-bold">Max Peak: {maxDd.toFixed(2)}%</span>
          </div>

          <div className="h-64 w-full bg-[#06080E] rounded-2xl border border-white/[0.05] p-3">
            <svg width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none" className="overflow-visible">
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.0" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0.4" />
                </linearGradient>
              </defs>

              {/* Zero line */}
              <line x1="10" y1="30" x2="790" y2="30" stroke="#64748B" strokeWidth="1.5" />
              <text x="740" y="24" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">0.0% Peak</text>

              {/* Max Drawdown marker */}
              <line x1="10" y1="210" x2="790" y2="210" stroke="#EF4444" strokeDasharray="3 3" strokeWidth="1" />
              <text x="700" y="204" fill="#EF4444" fontSize="10" fontFamily="JetBrains Mono">Max DD -12.4%</text>

              {/* Drawdown Area */}
              <path
                d={
                  `M 10 30 ` +
                  equityPoints
                    .map((p, i) => {
                      const x = 10 + (i / (equityPoints.length - 1)) * 780;
                      const y = 30 + (Math.abs(p.drawdown) / 14) * 180;
                      return `L ${x} ${y}`;
                    })
                    .join(' ') +
                  ` L 790 30 Z`
                }
                fill="url(#ddGrad)"
              />
              <path
                d={
                  `M 10 30 ` +
                  equityPoints
                    .map((p, i) => {
                      const x = 10 + (i / (equityPoints.length - 1)) * 780;
                      const y = 30 + (Math.abs(p.drawdown) / 14) * 180;
                      return `L ${x} ${y}`;
                    })
                    .join(' ')
                }
                stroke="#EF4444"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </div>
        </div>
      )}

      {/* 3. MONTHLY RETURNS HEATMAP */}
      {activeTab === 'monthly' && (
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs mono">
            <thead>
              <tr className="border-b border-white/10 text-[10px] text-[#64748B] uppercase">
                <th className="p-2 text-left">Year</th>
                {months.map((m) => (
                  <th key={m} className="p-2">{m}</th>
                ))}
                <th className="p-2 text-right">YTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {monthlyData.map((row) => (
                <tr key={row.year} className="hover:bg-white/[0.02]">
                  <td className="p-2 text-left font-bold text-white">{row.year}</td>
                  {row.returns.map((val, idx) => (
                    <td key={idx} className="p-2">
                      {val === null ? (
                        <span className="text-white/20">—</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                            val >= 3
                              ? "bg-emerald-500/25 text-emerald-300"
                              : val > 0
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-rose-500/20 text-rose-300"
                          )}
                        >
                          {val > 0 ? '+' : ''}{val.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right font-black text-emerald-400">+{row.ytd}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. P&L DISTRIBUTION HISTOGRAM */}
      {activeTab === 'distribution' && (
        <div className="space-y-3">
          <div className="text-xs text-[#94A3B8]">Profit & Loss Trade Frequency Distribution</div>
          <div className="space-y-2">
            {pnlBuckets.map((b) => (
              <div key={b.range} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#94A3B8]">{b.range}</span>
                  <span className="text-white font-bold">{b.count} trades ({b.pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      b.range.includes('+') ? "bg-emerald-500" : "bg-rose-500"
                    )}
                    style={{ width: `${b.pct * 3}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. RISK / RETURN SCATTER PLOT */}
      {activeTab === 'scatter' && (
        <div className="h-64 w-full bg-[#06080E] rounded-2xl border border-white/[0.05] p-4 flex flex-col justify-between">
          <div className="flex justify-between text-xs text-[#94A3B8]">
            <span>Strategy Risk / Return Cluster</span>
            <span className="text-emerald-400 font-bold">Sharpe Optimal: Top Left</span>
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 border border-white/10 opacity-30">
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-white/10" />
              <div />
            </div>

            {/* Scatter points */}
            {[
              { label: 'Neural Alpha', x: 28, y: 78, color: 'bg-violet-400' },
              { label: 'Momentum IME', x: 55, y: 64, color: 'bg-emerald-400' },
              { label: 'Basis Arbitrage', x: 18, y: 48, color: 'bg-sky-400' },
              { label: 'Trend Follower', x: 42, y: 58, color: 'bg-amber-400' },
              { label: 'Mean Revert', x: 70, y: 35, color: 'bg-rose-400' },
            ].map((pt) => (
              <div
                key={pt.label}
                className="absolute flex items-center gap-1.5 transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                style={{ left: `${pt.x}%`, top: `${100 - pt.y}%` }}
              >
                <span className={cn("w-3.5 h-3.5 rounded-full shadow-lg border border-white/40 group-hover:scale-125 transition-transform", pt.color)} />
                <span className="text-[10px] font-bold text-white whitespace-nowrap bg-black/60 px-1.5 py-0.5 rounded">
                  {pt.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between text-[10px] text-[#64748B] mono">
            <span>← Lower Volatility (Risk)</span>
            <span>Higher Return ↑</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceAnalytics;
