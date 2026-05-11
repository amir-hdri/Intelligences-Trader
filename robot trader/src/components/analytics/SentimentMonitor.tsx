import React from 'react';
import { SentimentData } from '../../types';

interface SentimentMonitorProps {
  data: SentimentData;
}

export const SentimentMonitor: React.FC<SentimentMonitorProps> = ({ data }) => {
  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider">Macro Political NLP</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          data.politicalRiskIndex > 60 ? 'bg-rose-500/20 text-rose-400' :
          data.politicalRiskIndex < 40 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
        }`}>
          {data.politicalRiskIndex > 60 ? 'HIGH TENSION' : data.politicalRiskIndex < 40 ? 'STABLE' : 'NEUTRAL'}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-16 h-16">
          <svg className="w-full h-full" viewBox="0 0 36 36">
            <path
              className="text-slate-800"
              strokeDasharray="100, 100"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className={`${data.politicalRiskIndex > 50 ? 'text-rose-500' : 'text-emerald-500'}`}
              strokeDasharray={`${data.politicalRiskIndex}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
            {data.score > 0 ? '+' : ''}{data.score.toFixed(2)}
          </div>
        </div>
        <div className="text-xs text-gray-400 leading-tight">
          ParsBERT analysis shows a <span className="text-white">{data.label.toLowerCase()}</span> bias in recent IME-related press releases.
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto max-h-[200px] pr-1 scrollbar-thin scrollbar-thumb-gray-800">
        {data.news.map((n) => (
          <div key={n.id} className="border-l-2 border-gray-800 pl-3 py-1">
            <div className="flex justify-between items-start mb-1">
              <span className={`text-[9px] font-bold px-1 rounded ${
                n.impactEffect === 'DOLLAR_BULLISH' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {n.impactEffect}
              </span>
              <span className="text-[9px] text-gray-600">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-[11px] text-gray-300 font-medium line-clamp-2">{n.title}</div>
            <div className="text-[9px] text-gray-500 mt-1">{n.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
