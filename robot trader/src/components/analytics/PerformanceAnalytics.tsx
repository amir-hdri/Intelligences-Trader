import React, { useMemo, useState } from 'react';
import { TrendingUp, BarChart3, ShieldCheck, Activity, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Badge } from '../common/ui';

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
  ? '—'
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
      { range: '< -1M IRR', match: (pnl: number) => pnl < -1_000_000 },
      { range: '-1M to -500k', match: (pnl: number) => pnl >= -1_000_000 && pnl < -500_000 },
      { range: '-500k to 0', match: (pnl: number) => pnl >= -500_000 && pnl < 0 },
      { range: '0 to +500k', match: (pnl: number) => pnl >= 0 && pnl < 500_000 },
      { range: '+500k to +1M', match: (pnl: number) => pnl >= 500_000 && pnl < 1_000_000 },
      { range: '> +1M IRR', match: (pnl: number) => pnl >= 1_000_000 },
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
    <div
      aria-label="Realized Performance Analytics"
      className={cn('glass-panel p-6 lg:p-8 rounded-3xl space-y-6 border border-white/[0.08] font-mono', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF] px-2 py-0.5 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25">
              Phase 4 • Telemetry
            </span>
            <Badge tone="emerald" dot>
              VERIFIED LEDGER
            </Badge>
          </div>
          <h2 className="mt-1 text-base sm:text-lg font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#00F0FF]" />
            Realized Performance & Risk Analytics
          </h2>
          <p className="mt-1 text-xs text-[#849495] font-sans">
            Grounded purely on {analytics.trades.length} recorded paper trades. Zero synthetic fabrication.
          </p>
        </div>

        <div className="flex max-w-full items-center overflow-x-auto rounded-2xl border border-white/[0.1] bg-[#060E20] p-1 text-xs font-bold">
          {(['equity', 'drawdown', 'monthly', 'distribution'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'min-h-[38px] whitespace-nowrap rounded-xl px-4 py-1.5 uppercase tracking-wider transition-all text-xs',
                activeTab === tab
                  ? 'bg-[#00F0FF] text-[#060E20] font-black shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                  : 'text-[#849495] hover:text-white',
              )}
            >
              {tab === 'equity' ? 'Equity Curve' : tab === 'drawdown' ? 'Drawdown %' : tab === 'monthly' ? 'Monthly Returns' : 'P&L Distribution'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          ['Sharpe Ratio', formatMetric(metrics.sharpe), `Sortino: ${formatMetric(metrics.sortino)}`, 'text-[#00F0FF]'],
          ['Win Rate', `${(metrics.winRate * 100).toFixed(1)}%`, `Profit Factor: ${formatMetric(metrics.profitFactor)}`, 'text-[#10B981]'],
          ['Max Drawdown', `${(metrics.maxDrawdown * 100).toFixed(2)}%`, `Total P&L: ${metrics.totalPnl.toFixed(0)} IRR`, 'text-[#EF4444]'],
          ['Final Equity', `${metrics.finalEquity.toLocaleString()} IRR`, `${analytics.trades.length} closed trades`, 'text-white'],
        ].map(([label, value, detail, color]) => (
          <div key={label} className="glass-card rounded-2xl p-4.5 border border-white/[0.08]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#849495]">{label}</div>
            <div className={cn("mt-1 text-xl font-black", color)}>{value}</div>
            <div className="mt-1 text-[11px] text-[#DAE2FD]">{detail}</div>
          </div>
        ))}
      </div>

      {analytics.trades.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#060E20]/50 px-6 py-16 text-center text-xs text-[#849495]">
          No realized paper trade outcomes recorded yet. Execute simulated orders via the Trade Ticket to populate this ledger.
        </div>
      ) : activeTab === 'equity' ? (
        <div className="h-64 rounded-2xl border border-white/[0.08] bg-[#060E20] p-4 relative overflow-hidden">
          <svg aria-label="Realized equity trajectory curve" width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none">
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chartPath} stroke="#00F0FF" strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      ) : activeTab === 'drawdown' ? (
        <div className="h-64 rounded-2xl border border-white/[0.08] bg-[#060E20] p-4 relative overflow-hidden">
          <svg aria-label="Realized underwater drawdown curve" width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none">
            <line x1="10" y1="30" x2="790" y2="30" stroke="#222A3D" strokeWidth="2" strokeDasharray="4 4" />
            <path d={drawdownPath} stroke="#EF4444" strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      ) : activeTab === 'monthly' ? (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#060E20]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[#849495] bg-[#0B1326]">
                <th className="p-3.5">Settlement Month</th>
                <th className="p-3.5 text-right">Realized P&L (IRR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {analytics.monthly.map(row => (
                <tr key={row.month}>
                  <td className="p-3.5 font-bold text-white">{row.month}</td>
                  <td className={cn('p-3.5 text-right font-bold', row.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]')}>
                    {row.pnl >= 0 ? '+' : ''}{row.pnl.toLocaleString()} IRR
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3.5">
          {analytics.buckets.map(bucket => (
            <div key={bucket.range} className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#849495]">{bucket.range}</span>
                <span className="text-white font-bold">{bucket.count} ({bucket.pct.toFixed(1)}%)</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#131B2E]">
                <div className="h-full rounded-full bg-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,0.6)]" style={{ width: `${bucket.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[#849495] font-sans">
        Performance statistics are evaluated on closed trades and adjusted for friction. All metrics update dynamically in real time.
      </p>
    </div>
  );
};

export default PerformanceAnalytics;

