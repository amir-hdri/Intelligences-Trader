import React, { useState, useMemo } from 'react';
import { TradeLogEntry } from '../../types';
import { History, Search, ArrowUpDown, ShieldCheck, TrendingUp, Cpu, Smile } from 'lucide-react';

interface TradeLogsPanelProps {
  tradeLogs: TradeLogEntry[];
}

export const TradeLogsPanel: React.FC<TradeLogsPanelProps> = ({ tradeLogs }) => {
  const [search, setSearch] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedLogs = useMemo(() => {
    let result = tradeLogs.filter(log => 
      log.symbol.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.reason.toLowerCase().includes(search.toLowerCase())
    );

    result = [...result].sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      return sortDirection === 'asc' ? diff : -diff;
    });

    return result;
  }, [tradeLogs, search, sortDirection]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border border-indigo-900/30 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
            <History className="w-8 h-8 text-indigo-500" />
            Trade Execution Logs
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Immutable audit record of all automated transactions, decision boundaries, and system states.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-white font-mono">{tradeLogs.length}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-1">Total Operations Logs</div>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by Symbol, Action or Reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
          />
        </div>

        <button
          onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
          className="w-full sm:w-auto bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 hover:text-white transition-colors active:scale-95"
        >
          <ArrowUpDown className="w-4 h-4 text-indigo-400" />
          <span>Sort: {sortDirection === 'desc' ? 'Newest First' : 'Oldest First'}</span>
        </button>
      </div>

      {/* Logs Table */}
      <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl">
        {filteredAndSortedLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-sm font-semibold">No trade logs found matching your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-500 uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-800/50">
                <tr>
                  <th className="px-6 py-5">Timestamp / ID</th>
                  <th className="px-6 py-5">Symbol</th>
                  <th className="px-6 py-5">Action</th>
                  <th className="px-6 py-5 text-right">Price</th>
                  <th className="px-6 py-5">Decision Reason</th>
                  <th className="px-6 py-5 text-center">State Metrics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {filteredAndSortedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                    <td className="px-6 py-4">
                      <span className="block text-slate-300 text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                      <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">{log.id.slice(0, 8)}...</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-800/40 border border-slate-800 text-[10px] text-white font-bold rounded-lg uppercase tracking-wide">
                        {log.symbol}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        log.action === 'BUY' 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm' 
                          : log.action === 'SELL' 
                            ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-sm'
                            : 'bg-slate-800 border border-slate-700 text-slate-400 shadow-sm'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-white font-black text-xs">
                      {log.price.toLocaleString()} IRR
                    </td>
                    <td className="px-6 py-4 text-xs font-sans text-slate-400 group-hover:text-slate-200 transition-colors max-w-xs truncate">
                      {log.reason}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-3 text-[10px] uppercase font-bold text-slate-500">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                          <span>RSI: {log.metricsAtTrade.rsi.toFixed(0)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Regime: {log.metricsAtTrade.regime.replace('TRENDING_', '')}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Smile className="w-3.5 h-3.5 text-purple-400" />
                          <span>Sentiment: {(log.metricsAtTrade.sentiment * 100).toFixed(0)}%</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
