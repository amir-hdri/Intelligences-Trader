import React, { useState, useEffect } from 'react';

interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;
  pnl: number;
  isWin: boolean;
}

interface Metrics {
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  totalPnl: number;
}

const PaperTradingDashboard: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/paper-trading/p2/metrics');
      const data = await res.json();
      setMetrics(data.data);
    } catch (e) {
      console.error('Failed to fetch P2 metrics');
    }
  };

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/paper-trading/trades');
      const data = await res.json();
      setTrades(data.data.trades || []);
    } catch (e) {
      console.error('Failed to fetch trades');
    }
  };

  const executeMLSignal = async () => {
    setLoading(true);
    try {
      const signal = { action: 'BUY', confidence: 0.82, regime: 'TRENDING_UP' };
      await fetch('/api/paper-trading/p2/execute-ml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal, symbol: 'BTC/USDT', marketPrice: 65000, size: 0.01 }),
      });
      await fetchMetrics();
      await fetchTrades();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchTrades();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-[#0B0F17] text-white rounded-xl border border-white/10">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">P2 Paper Trading Dashboard</h2>
        <button
          onClick={executeMLSignal}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50"
        >
          {loading ? 'Executing...' : 'Execute ML Signal'}
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            ['Sharpe', metrics.sharpe.toFixed(2)],
            ['Max DD', (metrics.maxDrawdown * 100).toFixed(1) + '%'],
            ['Win Rate', (metrics.winRate * 100).toFixed(1) + '%'],
            ['Trades', metrics.totalTrades],
            ['Total PnL', metrics.totalPnl.toFixed(2)],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#151C27] p-4 rounded-lg">
              <div className="text-xs text-gray-400">{label}</div>
              <div className="text-2xl font-mono mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trade History */}
      <div>
        <h3 className="text-lg mb-3">Recent Trades</h3>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="py-2">Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>PnL</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 20).map((t) => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-1.5 font-mono text-xs">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </td>
                  <td>{t.symbol}</td>
                  <td className={t.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                    {t.action}
                  </td>
                  <td className={t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {t.pnl.toFixed(2)}
                  </td>
                  <td>{t.isWin ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaperTradingDashboard;
