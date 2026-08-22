import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(' ');

interface RealizedTrade {
  profit: number;
  timestamp: number;
}

interface PerformanceAnalyticsProps {
  balance: number;
  className?: string;
  tradeHistory: RealizedTrade[];
}

const formatMetric = (value: number | null, digits = 2) => value == null || !Number.isFinite(value)
  ? 'N/A'
  : value.toFixed(digits);

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  balance,
  className,
  tradeHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'equity' | 'drawdown' | 'monthly' | 'distribution'>('equity');

  const analytics = useMemo(() => {
    const trades = tradeHistory
      .filter(trade => Number.isFinite(trade.profit) && Number.isFinite(trade.timestamp))
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    const totalPnl = trades.reduce((sum, trade) => sum + trade.profit, 0);
    const initialEquity = Math.max(1, balance - totalPnl);
    let equity = initialEquity;
    let peak = initialEquity;
    let maxDrawdown = 0;
    const returns: number[] = [];
    const points = [{ timestamp: trades[0]?.timestamp ?? Date.now(), equity, drawdown: 0 }];

    for (const trade of trades) {
      const prior = equity;
      equity += trade.profit;
      returns.push(prior > 0 ? trade.profit / prior : 0);
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? (peak - equity) / peak : 1;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      points.push({ timestamp: trade.timestamp, equity, drawdown });
    }

    const wins = trades.filter(trade => trade.profit > 0);
    const losses = trades.filter(trade => trade.profit < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.profit, 0);
    const grossLoss = -losses.reduce((sum, trade) => sum + trade.profit, 0);
    const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
    const variance = returns.length
      ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
      : 0;
    const downside = returns.filter(value => value < 0);
    const downsideDeviation = downside.length
      ? Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length)
      : 0;
    const standardDeviation = Math.sqrt(Math.max(0, variance));

    const monthly = new Map<string, number>();
    for (const trade of trades) {
      const date = new Date(trade.timestamp);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, (monthly.get(key) || 0) + trade.profit);
    }

    const bucketDefinitions = [
      { range: '< -1k', match: (pnl: number) => pnl < -1_000 },
      { range: '-1k to -500', match: (pnl: number) => pnl >= -1_000 && pnl < -500 },
      { range: '-500 to 0', match: (pnl: number) => pnl >= -500 && pnl < 0 },
      { range: '0 to +500', match: (pnl: number) => pnl >= 0 && pnl < 500 },
      { range: '+500 to +1k', match: (pnl: number) => pnl >= 500 && pnl < 1_000 },
      { range: '> +1k', match: (pnl: number) => pnl >= 1_000 },
    ];
    const buckets = bucketDefinitions.map(definition => {
      const count = trades.filter(trade => definition.match(trade.profit)).length;
      return { range: definition.range, count, pct: trades.length ? (count / trades.length) * 100 : 0 };
    });

    return {
      trades,
      points,
      monthly: [...monthly.entries()].map(([month, pnl]) => ({ month, pnl })),
      buckets,
      metrics: {
        totalPnl,
        finalEquity: equity,
        winRate: trades.length ? wins.length / trades.length : 0,
        profitFactor: grossLoss > Number.EPSILON ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
        sharpe: standardDeviation > Number.EPSILON ? (mean / standardDeviation) * Math.sqrt(252) : 0,
        sortino: downsideDeviation > Number.EPSILON ? (mean / downsideDeviation) * Math.sqrt(252) : 0,
        maxDrawdown,
      },
    };
  }, [balance, tradeHistory]);

  const { metrics, points } = analytics;
  const minEquity = Math.min(...points.map(point => point.equity));
  const maxEquity = Math.max(...points.map(point => point.equity));
  const equityRange = Math.max(1, maxEquity - minEquity);
  const chartPath = points.map((point, index) => {
    const x = points.length === 1 ? 400 : 10 + (index / (points.length - 1)) * 780;
    const y = 220 - ((point.equity - minEquity) / equityRange) * 190;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const drawdownPath = points.map((point, index) => {
    const x = points.length === 1 ? 400 : 10 + (index / (points.length - 1)) * 780;
    const y = 30 + point.drawdown * 180;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className={cn('glass-panel p-4 lg:p-6 rounded-3xl space-y-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-blue-300">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Realized Paper-Ledger Analytics
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Every value below is calculated from {analytics.trades.length} explicitly recorded paper outcomes; empty ledgers remain empty.
          </p>
        </div>
        <div className="flex max-w-full items-center overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-0.5 text-xs font-black">
          {(['equity', 'drawdown', 'monthly', 'distribution'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'min-h-[40px] whitespace-nowrap rounded-lg px-3 py-1.5 capitalize transition-all',
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white',
              )}
            >
              {tab === 'equity' ? 'Equity Curve' : tab === 'drawdown' ? 'Drawdown' : tab === 'monthly' ? 'Monthly P&L' : 'P&L Distribution'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Sharpe Ratio', formatMetric(metrics.sharpe), `Sortino: ${formatMetric(metrics.sortino)}`],
          ['Win Rate', `${(metrics.winRate * 100).toFixed(1)}%`, `Profit Factor: ${formatMetric(metrics.profitFactor)}`],
          ['Max Drawdown', `${(metrics.maxDrawdown * 100).toFixed(2)}%`, `Total P&L: ${metrics.totalPnl.toFixed(0)}`],
          ['Final Equity', metrics.finalEquity.toLocaleString(), `${analytics.trades.length} outcomes`],
        ].map(([label, value, detail]) => (
          <div key={label} className="elevated rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">{label}</div>
            <div className="mono mt-1 text-2xl font-black text-white">{value}</div>
            <div className="mt-0.5 text-[11px] text-[#94A3B8]">{detail}</div>
          </div>
        ))}
      </div>

      {analytics.trades.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center text-sm text-[#64748B]">
          No realized paper outcomes are available. Run a labelled paper simulation to populate this view.
        </div>
      ) : activeTab === 'equity' ? (
        <div className="h-64 rounded-2xl border border-white/[0.05] bg-[#06080E] p-3">
          <svg aria-label="Realized equity curve" width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none">
            <path d={chartPath} stroke="#3B82F6" strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      ) : activeTab === 'drawdown' ? (
        <div className="h-64 rounded-2xl border border-white/[0.05] bg-[#06080E] p-3">
          <svg aria-label="Realized drawdown curve" width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none">
            <line x1="10" y1="30" x2="790" y2="30" stroke="#64748B" />
            <path d={drawdownPath} stroke="#EF4444" strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      ) : activeTab === 'monthly' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-white/10 text-[#64748B]"><th className="p-3">Month</th><th className="p-3 text-right">Realized P&L</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {analytics.monthly.map(row => (
                <tr key={row.month}><td className="p-3 font-mono text-white">{row.month}</td><td className={cn('p-3 text-right font-mono font-bold', row.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{row.pnl.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {analytics.buckets.map(bucket => (
            <div key={bucket.range} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="text-[#94A3B8]">{bucket.range}</span><span className="font-mono text-white">{bucket.count} ({bucket.pct.toFixed(1)}%)</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${bucket.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[#64748B]">
        Research simulation only. No benchmark, alpha, recovery duration, or monthly return is shown unless it can be derived from the recorded ledger.
      </p>
    </div>
  );
};

export default PerformanceAnalytics;
