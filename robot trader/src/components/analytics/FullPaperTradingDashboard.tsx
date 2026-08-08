import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;
  pnl: number;
  isWin: boolean;
  entryPrice: number;
}

interface Metrics {
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  totalPnl: number;
}

interface Report {
  period: string;
  generatedAt: string;
  metrics: Metrics;
  summary: string;
  recommendations: string[];
}

const FullPaperTradingDashboard: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'PPO' | 'TCN'>('PPO');
  const [strategyParams, setStrategyParams] = useState({
    size: 0.01,
    stopLoss: 0.02,
    takeProfit: 0.04,
    confidenceThreshold: 0.65,
  });

  // Fetch metrics
  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/paper-trading/p2/metrics');
      const data = await res.json();
      setMetrics(data.data);
    } catch (e) {
      console.error('Failed to fetch metrics');
    }
  };

  // Fetch trades
  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/paper-trading/trades');
      const data = await res.json();
      setTrades(data.data.trades || []);
    } catch (e) {
      console.error('Failed to fetch trades');
    }
  };

  // Execute ML signal
  const executeMLSignal = async () => {
    setLoading(true);
    try {
      const signal = {
        action: Math.random() > 0.5 ? 'BUY' : 'SELL',
        confidence: 0.75 + Math.random() * 0.2,
        regime: 'TRENDING_UP',
      };
      await fetch('/api/paper-trading/p2/execute-ml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal,
          symbol: 'BTC/USDT',
          marketPrice: 65000 + Math.random() * 2000,
          size: strategyParams.size,
        }),
      });
      await fetchMetrics();
      await fetchTrades();
    } finally {
      setLoading(false);
    }
  };

  // Generate report
  const generateReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    setLoading(true);
    try {
      const res = await fetch('/api/paper-trading/p2/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      setReport(data.data);
    } finally {
      setLoading(false);
    }
  };

  // Update strategy params
  const updateStrategy = async () => {
    await fetch('/api/paper-trading/p2/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, ...strategyParams }),
    });
    alert('Strategy parameters updated');
  };

  // Prepare chart data
  const chartData = trades.slice(0, 30).reverse().map((t, i) => ({
    time: new Date(t.timestamp).toLocaleTimeString(),
    pnl: t.pnl,
    cumulative: trades.slice(0, i + 1).reduce((sum, tr) => sum + tr.pnl, 0),
  }));

  useEffect(() => {
    fetchMetrics();
    fetchTrades();
    const interval = setInterval(() => {
      fetchMetrics();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-[#05070B] text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">P2 Paper Trading Engine — Full Stack</h1>
          <div className="flex gap-3">
            <button
              onClick={executeMLSignal}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Executing...' : 'Execute ML Signal'}
            </button>
            <button onClick={() => generateReport('daily')} className="px-4 py-2 bg-blue-600 rounded-lg">Daily Report</button>
            <button onClick={() => generateReport('weekly')} className="px-4 py-2 bg-blue-600 rounded-lg">Weekly Report</button>
          </div>
        </div>

        {/* KPI Cards */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              ['Sharpe Ratio', metrics.sharpe.toFixed(2)],
              ['Max Drawdown', (metrics.maxDrawdown * 100).toFixed(1) + '%'],
              ['Win Rate', (metrics.winRate * 100).toFixed(1) + '%'],
              ['Total Trades', metrics.totalTrades],
              ['Total PnL', metrics.totalPnl.toFixed(2)],
            ].map(([label, value]) => (
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
            <h3 className="mb-4 text-lg">Cumulative PnL</h3>
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

        {/* Strategy Settings + Model Selection */}
        <div className="bg-[#151C27] p-6 rounded-2xl border border-white/10 mb-8">
          <h3 className="text-lg mb-4">Strategy Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm mb-1">ML Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as any)}
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
                    <td className={t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{t.pnl.toFixed(2)}</td>
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
