import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { apiJson } from '../../services/apiFetch';
import { Play, RotateCw, FileText, CheckCircle, XCircle, Clock, Zap, TrendingUp, Sliders, ShieldCheck } from 'lucide-react';
import { Badge, Button } from '../common/ui';

interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;
  pnl: number;
  netPnl?: number;
  isWin: boolean;
  entryPrice?: number;
  fee?: number;
}

interface Metrics {
  sharpe: number;
  sortino?: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor?: number;
  totalTrades: number;
  totalPnl: number;
  accuracy?: number;
}

interface Report {
  period: string;
  generatedAt: string;
  metrics: Metrics;
  summary: string;
  recommendations: string[];
}

interface BacktestResult {
  metrics: Metrics;
  finalEquity: number;
  totalReturnPct: number;
  trades: Trade[];
}

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SAF1403', 'GOLD1403'];

const DETERMINISTIC_SIGNALS: { action: 'BUY' | 'SELL'; confidence: number; regime: string }[] = [
  { action: 'BUY', confidence: 0.82, regime: 'TRENDING_UP' },
  { action: 'BUY', confidence: 0.71, regime: 'TRENDING_UP' },
  { action: 'SELL', confidence: 0.76, regime: 'TRENDING_DOWN' },
  { action: 'BUY', confidence: 0.68, regime: 'RANGING' },
  { action: 'SELL', confidence: 0.8, regime: 'TRENDING_DOWN' },
];

interface FullPaperTradingDashboardProps {
  accessToken?: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const FullPaperTradingDashboard: React.FC<FullPaperTradingDashboardProps> = ({ accessToken = '' }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signalIndex, setSignalIndex] = useState(0);
  const [selectedModel, setSelectedModel] = useState<'PPO' | 'TCN'>('PPO');
  const [selectedSymbol, setSelectedSymbol] = useState(SYMBOLS[0]);
  const [backtestCandles, setBacktestCandles] = useState(60);
  const [strategyParams, setStrategyParams] = useState({
    size: 0.01,
    stopLoss: 0.02,
    takeProfit: 0.04,
    confidenceThreshold: 0.65,
  });

  const fetchMetrics = useCallback(async () => {
    const response = await apiJson<Envelope<Metrics>>('/api/paper-trading/p2/metrics', accessToken);
    setMetrics(response.data);
  }, [accessToken]);

  const fetchTrades = useCallback(async () => {
    const response = await apiJson<Envelope<{ trades: Trade[] }>>('/api/paper-trading/trades', accessToken);
    setTrades(response.data.trades || []);
  }, [accessToken]);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([fetchMetrics(), fetchTrades()]);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to refresh paper-trading data');
    }
  }, [fetchMetrics, fetchTrades]);

  const executeMLSignal = async () => {
    setLoading(true);
    try {
      const signal = DETERMINISTIC_SIGNALS[signalIndex % DETERMINISTIC_SIGNALS.length];
      setSignalIndex((i) => i + 1);
      setError(null);
      setSuccessMessage(null);
      await apiJson<Envelope<unknown>>('/api/paper-trading/p2/execute-ml', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          signal,
          symbol: selectedSymbol,
          marketPrice: 65000 + signalIndex * 5,
          size: strategyParams.size,
        }),
      });
      await refresh();
      setSuccessMessage('Deterministic research signal executed in the paper simulator.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Signal execution failed');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    setLoading(true);
    try {
      setError(null);
      const response = await apiJson<Envelope<Report>>('/api/paper-trading/p2/report', accessToken, {
        method: 'POST',
        body: JSON.stringify({ period }),
      });
      setReport(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Report generation failed');
    } finally {
      setLoading(false);
    }
  };

  const updateStrategy = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiJson<Envelope<unknown>>('/api/paper-trading/p2/strategy', accessToken, {
        method: 'POST',
        body: JSON.stringify({ model: selectedModel, ...strategyParams }),
      });
      setSuccessMessage('Paper strategy configuration saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Strategy update failed');
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    setLoading(true);
    try {
      const n = Math.max(10, Math.min(500, Math.round(backtestCandles)));
      const candles = Array.from({ length: n }, (_, i) => {
        const close = 100 + i * 0.5 + Math.sin(i) * 2;
        return {
          timestamp: i,
          open: close - 0.4,
          high: close + 0.6,
          low: close - 0.8,
          close,
          volume: 1000 + i * 10,
        };
      });
      const signals = candles.slice(0, n - 1).map((c, i) => {
        const sig = DETERMINISTIC_SIGNALS[i % DETERMINISTIC_SIGNALS.length];
        return { action: sig.action, confidence: sig.confidence, regime: sig.regime, qty: strategyParams.size };
      });
      setError(null);
      const response = await apiJson<Envelope<BacktestResult>>('/api/paper-trading/p2/backtest', accessToken, {
        method: 'POST',
        body: JSON.stringify({ candles, signals }),
      });
      setBacktest(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  const chartData = React.useMemo(() => {
    const recentTrades = trades.slice(0, 30).reverse();
    let cumulative = 0;
    return recentTrades.map((t) => {
      const pnl = Number.isFinite(t.netPnl) ? t.netPnl! : Number.isFinite(t.pnl) ? t.pnl : 0;
      cumulative += pnl;
      return {
        time: Number.isFinite(t.timestamp) ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        pnl,
        cumulative,
      };
    });
  }, [trades]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void fetchMetrics().catch(caught => setError(caught instanceof Error ? caught.message : 'Metrics refresh failed'));
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh, fetchMetrics]);

  const formatMetric = (value: number | null | undefined, transform: (v: number) => string): string =>
    Number.isFinite(value as number) ? transform(value as number) : '—';

  const kpis = metrics
    ? [
        { label: 'Sharpe Ratio', value: formatMetric(metrics.sharpe, v => v.toFixed(2)), tone: 'cyan' as const },
        { label: 'Max Drawdown', value: formatMetric(metrics.maxDrawdown, v => (v * 100).toFixed(1) + '%'), tone: 'crimson' as const },
        { label: 'Win Rate', value: formatMetric(metrics.winRate, v => (v * 100).toFixed(1) + '%'), tone: 'emerald' as const },
        { label: 'Profit Factor', value: formatMetric(metrics.profitFactor ?? null, v => v.toFixed(2)), tone: 'cyan' as const },
        { label: 'Total PnL', value: formatMetric(metrics.totalPnl, v => `${v > 0 ? '+' : ''}${v.toLocaleString()}`), tone: metrics.totalPnl >= 0 ? 'emerald' as const : 'crimson' as const },
      ]
    : [];

  return (
    <div
      aria-label="P2 Paper Trading & Execution Simulator"
      className="space-y-6 animate-in fade-in duration-300"
    >
      {/* Alert Notices */}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[#EF4444]/40 bg-[#EF4444]/15 p-4 text-xs font-mono text-[#FCA5A5]">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="rounded-xl bg-[#EF4444]/20 hover:bg-[#EF4444]/30 px-3 py-1 font-bold">Retry</button>
        </div>
      )}

      {successMessage && (
        <div role="status" className="rounded-2xl border border-[#10B981]/40 bg-[#10B981]/15 p-4 text-xs font-mono text-[#6EE7B7]">
          {successMessage}
        </div>
      )}

      {/* Header Banner */}
      <div className="glass-panel p-6 lg:p-8 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-white/[0.08] relative overflow-hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
              <Zap className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-mono font-bold text-white uppercase tracking-wider">
              P2 Paper Trading & Execution Simulator
            </h1>
          </div>
          <p className="text-xs text-[#849495] max-w-xl leading-relaxed">
            Deterministic scenario execution, fee-adjusted order fills, and high-fidelity book emulation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[#060E20] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-[#00F0FF] focus:outline-none min-h-[40px]"
          >
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={executeMLSignal}
            disabled={loading}
            className="px-4 py-2 bg-[#10B981] hover:bg-[#34D399] text-[#060E20] font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 min-h-[40px] flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? 'Executing…' : 'Run Scenario Signal'}</span>
          </button>
          <div className="flex rounded-xl bg-[#060E20] p-1 border border-white/[0.08] text-xs font-mono">
            <button onClick={() => generateReport('daily')} className="px-2.5 py-1 rounded-lg text-[#849495] hover:text-white transition-colors">Daily</button>
            <button onClick={() => generateReport('weekly')} className="px-2.5 py-1 rounded-lg text-[#849495] hover:text-white transition-colors">Weekly</button>
            <button onClick={() => generateReport('monthly')} className="px-2.5 py-1 rounded-lg text-[#849495] hover:text-white transition-colors">Monthly</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden space-y-1">
              <div className="text-[10px] text-[#849495] uppercase font-mono font-bold tracking-wider">{kpi.label}</div>
              <div className="text-2xl font-mono font-black text-white mt-1">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Cumulative PnL (Net of Fees)</h3>
            <span className="text-[10px] font-mono text-[#10B981]">Realized Alpha</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#131B2E" />
                <XAxis dataKey="time" stroke="#849495" fontSize={10} tickLine={false} />
                <YAxis stroke="#849495" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060E20', borderColor: '#00F0FF', borderRadius: 12, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="cumulative" stroke="#00F0FF" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Trade PnL Distribution</h3>
            <span className="text-[10px] font-mono text-[#00F0FF]">Per-Trade Delta</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#131B2E" />
                <XAxis dataKey="time" stroke="#849495" fontSize={10} tickLine={false} />
                <YAxis stroke="#849495" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060E20', borderColor: '#10B981', borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="pnl" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Backtest Compatibility Harness */}
      <div className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">P2 Backtest Sandbox</h3>
            <p className="text-[10px] text-[#849495]">Deterministic candle synthesis for rapid strategy iteration</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={10}
              max={500}
              value={backtestCandles}
              onChange={(e) => setBacktestCandles(parseInt(e.target.value, 10) || 60)}
              className="w-24 bg-[#060E20] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:border-[#00F0FF] focus:outline-none"
            />
            <button
              onClick={runBacktest}
              disabled={loading}
              className="px-4 py-2 bg-[#00F0FF] hover:bg-[#7DF4FF] text-[#060E20] font-mono font-bold text-xs uppercase rounded-xl transition-all disabled:opacity-50"
            >
              Run Scenario
            </button>
          </div>
        </div>

        {backtest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06]">
              <div className="text-[#849495] text-[10px] uppercase">Final Simulated Equity</div>
              <div className="text-white font-bold text-sm mt-1">{Number.isFinite(backtest.finalEquity) ? backtest.finalEquity.toLocaleString() : '—'}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06]">
              <div className="text-[#849495] text-[10px] uppercase">Net Return</div>
              <div className="text-[#10B981] font-bold text-sm mt-1">{Number.isFinite(backtest.totalReturnPct) ? `+${backtest.totalReturnPct.toFixed(2)}%` : '—'}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06]">
              <div className="text-[#849495] text-[10px] uppercase">Sharpe Ratio</div>
              <div className="text-[#00F0FF] font-bold text-sm mt-1">{Number.isFinite(backtest.metrics?.sharpe) ? backtest.metrics.sharpe.toFixed(2) : '—'}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06]">
              <div className="text-[#849495] text-[10px] uppercase">Max Drawdown</div>
              <div className="text-[#EF4444] font-bold text-sm mt-1">{Number.isFinite(backtest.metrics?.maxDrawdown) ? `${(backtest.metrics.maxDrawdown * 100).toFixed(1)}%` : '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Settings + Model Selection */}
      <div className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#00F0FF] flex items-center gap-2">
            <Sliders className="w-4 h-4" /> Strategy Hyperparameters
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          <div>
            <label className="block text-[#849495] mb-2 uppercase text-[10px] font-bold">Neural Model Architecture</label>
            <select
              value={selectedModel}
              onChange={(e) => {
                if (e.target.value === 'PPO' || e.target.value === 'TCN') setSelectedModel(e.target.value);
              }}
              className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl p-3 text-white focus:border-[#00F0FF] focus:outline-none"
            >
              <option value="PPO">Proximal Policy Optimization (PPO)</option>
              <option value="TCN">Temporal Convolutional Network (TCN)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Object.keys(strategyParams).map((key) => (
              <div key={key}>
                <label className="block text-[#849495] mb-1 capitalize text-[10px]">{key}</label>
                <input
                  type="number"
                  step="0.01"
                  value={strategyParams[key as keyof typeof strategyParams]}
                  onChange={(e) =>
                    setStrategyParams({ ...strategyParams, [key]: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl px-3 py-2 text-white focus:border-[#00F0FF] focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={updateStrategy}
            className="px-6 py-2.5 bg-[#00F0FF] hover:bg-[#7DF4FF] text-[#060E20] font-mono font-bold text-xs uppercase rounded-xl transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)]"
          >
            Save Strategy Configuration
          </button>
        </div>
      </div>

      {/* Trade History */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/[0.08] flex flex-col">
        <div className="p-5 lg:p-6 border-b border-white/[0.06] flex justify-between items-center bg-[#060E20]/60">
          <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">
            Simulated Trade Journal
          </h3>
          <span className="text-[10px] font-mono text-[#849495]">Recent 25 Fills</span>
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs font-mono">
            <thead className="bg-[#060E20] text-[#849495] font-bold uppercase tracking-wider sticky top-0 border-b border-white/[0.06]">
              <tr>
                <th className="px-5 py-3.5 text-left">Time</th>
                <th className="px-5 py-3.5 text-left">Symbol</th>
                <th className="px-5 py-3.5 text-left">Side</th>
                <th className="px-5 py-3.5 text-right">Price</th>
                <th className="px-5 py-3.5 text-right">Fee</th>
                <th className="px-5 py-3.5 text-right">PnL</th>
                <th className="px-5 py-3.5 text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {trades.slice(0, 25).map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-[#849495] text-[10px]">
                    {Number.isFinite(t.timestamp) ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-3 text-white font-bold">{t.symbol}</td>
                  <td className="px-5 py-3">
                    <Badge tone={t.action === 'BUY' ? 'emerald' : 'crimson'}>{t.action}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right text-white">{Number.isFinite(t.entryPrice) ? t.entryPrice!.toLocaleString() : '—'}</td>
                  <td className="px-5 py-3 text-right text-[#849495]">{(t.fee ?? 0).toLocaleString()}</td>
                  <td className={`px-5 py-3 text-right font-bold ${(t.netPnl ?? t.pnl ?? 0) >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                    {(t.netPnl ?? t.pnl ?? 0) > 0 ? '+' : ''}{(t.netPnl ?? t.pnl ?? 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {t.isWin ? <Badge tone="emerald">WIN</Badge> : <Badge tone="crimson">LOSS</Badge>}
                  </td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-[#849495] uppercase">
                    No simulated trades in buffer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report */}
      {report && (
        <div className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-3">
          <h3 className="text-sm font-mono font-bold uppercase text-[#00F0FF]">{report.period.toUpperCase()} Execution Audit</h3>
          <p className="text-xs text-[#DAE2FD] leading-relaxed font-sans">{report.summary}</p>
          <div className="text-xs space-y-2 pt-2">
            <strong className="text-white font-mono uppercase text-[10px]">Strategic Recommendations:</strong>
            <ul className="list-disc pl-5 space-y-1 text-[#849495] font-sans">
              {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default FullPaperTradingDashboard;

