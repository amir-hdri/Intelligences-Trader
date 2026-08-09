import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { apiJson } from '../../services/apiFetch';

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

// Deterministic signal generator — no Math.random. Cycles through a fixed
// sequence of actions with a fixed confidence so results are reproducible.
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

const FullPaperTradingDashboard: React.FC<FullPaperTradingDashboardProps> = ({ accessToken = '' }) => {
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

  // Execute a deterministic ML signal
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

  // Build a deterministic synthetic candle series + signals for the backtest.
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

  // Prepare chart data
  const chartData = trades.slice(0, 30).reverse().map((t, i) => {
    const cumulative = trades.slice(0, i + 1).reduce((sum, tr) => sum + (tr.netPnl ?? tr.pnl), 0);
    return {
      time: new Date(t.timestamp).toLocaleTimeString(),
      pnl: t.netPnl ?? t.pnl,
      cumulative,
    };
  });

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void fetchMetrics().catch(caught => setError(caught instanceof Error ? caught.message : 'Metrics refresh failed'));
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh, fetchMetrics]);

  const kpis = metrics
    ? [
        ['Sharpe Ratio', metrics.sharpe.toFixed(2)],
        ['Max Drawdown', (metrics.maxDrawdown * 100).toFixed(1) + '%'],
        ['Win Rate', (metrics.winRate * 100).toFixed(1) + '%'],
        ['Profit Factor', (metrics.profitFactor ?? 0).toFixed(2)],
        ['Total PnL', metrics.totalPnl.toFixed(2)],
      ]
    : [];

  return (
    <div className="p-6 bg-[#05070B] text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <span>{error}</span>
            <button onClick={() => void refresh()} className="rounded-lg border border-rose-400/30 px-3 py-1 text-xs font-bold">Retry</button>
          </div>
        )}
        {successMessage && (
          <div role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {successMessage}
          </div>
        )}
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          Research simulation only: generated signals, paper fills, and reports are not broker orders or verified live performance.
        </div>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold">P2 Paper Trading Research Simulator</h1>
            <p className="text-sm text-gray-400 mt-1">
              Deterministic scenario execution, fees, order-book simulation, and optional PostgreSQL persistence.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-[#0B0F17] border border-white/20 rounded p-2 text-sm"
            >
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={executeMLSignal}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Executing…' : 'Run Scenario Signal'}
            </button>
            <button onClick={() => generateReport('daily')} className="px-4 py-2 bg-blue-600 rounded-lg">Daily</button>
            <button onClick={() => generateReport('weekly')} className="px-4 py-2 bg-blue-600 rounded-lg">Weekly</button>
            <button onClick={() => generateReport('monthly')} className="px-4 py-2 bg-blue-600 rounded-lg">Monthly</button>
          </div>
        </div>

        {/* KPI Cards */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {kpis.map(([label, value]) => (
              <div key={label} className="bg-[#151C27] p-5 rounded-2xl border border-white/10">
                <div className="text-sm text-gray-400">{label}</div>
                <div className="text-3xl font-mono mt-2 tracking-tighter">{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10">
            <h3 className="mb-4 text-lg">Cumulative PnL (Net of Fees)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10">
            <h3 className="mb-4 text-lg">Trade PnL Distribution</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="pnl" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Backtest */}
        <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10 mb-8">
          <h3 className="text-lg mb-1">Legacy P2 Backtest Harness</h3>
          <p className="text-xs text-gray-400 mb-4">Compatibility runner only. Use “Walk-Forward Backtest” for immutable snapshots, scenarios, ML provenance, and audited results.</p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm mb-1">Candles</label>
              <input
                type="number"
                min={10}
                max={500}
                value={backtestCandles}
                onChange={(e) => setBacktestCandles(parseInt(e.target.value, 10) || 60)}
                className="w-32 bg-[#0B0F17] border border-white/20 rounded p-2"
              />
            </div>
            <button onClick={runBacktest} disabled={loading} className="px-5 py-2 bg-cyan-600 rounded-lg disabled:opacity-50">
              Run Backtest
            </button>
          </div>
          {backtest && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="elevated rounded-xl p-3 bg-[#0B0F17]">
                <div className="text-gray-400 text-xs">Final Equity</div>
                <div className="font-mono font-bold">{backtest.finalEquity.toLocaleString()}</div>
              </div>
              <div className="elevated rounded-xl p-3 bg-[#0B0F17]">
                <div className="text-gray-400 text-xs">Return %</div>
                <div className="font-mono font-bold">{backtest.totalReturnPct.toFixed(2)}%</div>
              </div>
              <div className="elevated rounded-xl p-3 bg-[#0B0F17]">
                <div className="text-gray-400 text-xs">Sharpe</div>
                <div className="font-mono font-bold">{backtest.metrics.sharpe.toFixed(2)}</div>
              </div>
              <div className="elevated rounded-xl p-3 bg-[#0B0F17]">
                <div className="text-gray-400 text-xs">Max Drawdown</div>
                <div className="font-mono font-bold">{(backtest.metrics.maxDrawdown * 100).toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>

        {/* Strategy Settings + Model Selection */}
        <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10 mb-8">
          <h3 className="text-lg mb-4">Strategy Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm mb-1">ML Model</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  if (e.target.value === 'PPO' || e.target.value === 'TCN') setSelectedModel(e.target.value);
                }}
                className="w-full bg-[#0B0F17] border border-white/20 rounded p-2"
              >
                <option value="PPO">PPO</option>
                <option value="TCN">TCN</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.keys(strategyParams).map((key) => (
                <div key={key}>
                  <label className="block text-sm mb-1 capitalize">{key}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={strategyParams[key as keyof typeof strategyParams]}
                    onChange={(e) =>
                      setStrategyParams({ ...strategyParams, [key]: parseFloat(e.target.value) })
                    }
                    className="w-full bg-[#0B0F17] border border-white/20 rounded p-2"
                  />
                </div>
              ))}
            </div>
          </div>
          <button onClick={updateStrategy} className="mt-4 px-5 py-2 bg-violet-600 rounded-lg">Save Strategy</button>
        </div>

        {/* Trade History */}
        <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10 mb-8">
          <h3 className="text-lg mb-4">Trade History</h3>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-white/10">
                  <th className="py-3">Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Price</th>
                  <th>Fee</th>
                  <th>PnL</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 25).map((t) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 font-mono text-xs">{new Date(t.timestamp).toLocaleString()}</td>
                    <td>{t.symbol}</td>
                    <td className={t.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{t.action}</td>
                    <td>{t.entryPrice?.toFixed(2)}</td>
                    <td>{(t.fee ?? 0).toFixed(2)}</td>
                    <td className={(t.netPnl ?? t.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(t.netPnl ?? t.pnl).toFixed(2)}
                    </td>
                    <td>{t.isWin ? '✓ Win' : '✗ Loss'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Report */}
        {report && (
          <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg mb-3">{report.period.toUpperCase()} Report</h3>
            <p className="text-sm text-gray-400 mb-4">{report.summary}</p>
            <div className="text-sm">
              <strong>Recommendations:</strong>
              <ul className="list-disc pl-5 mt-2">
                {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FullPaperTradingDashboard;
