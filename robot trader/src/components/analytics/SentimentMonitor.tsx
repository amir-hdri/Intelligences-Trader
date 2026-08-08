import React from 'react';
import { SentimentData } from '../../types';
import { Newspaper, MessageSquare, TrendingUp } from 'lucide-react';

interface SentimentMonitorProps {
  data: SentimentData;
}

export const SentimentMonitor: React.FC<SentimentMonitorProps> = ({ data }) => {
  return (
    <div className="glass-panel p-5 rounded-3xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
          <MessageSquare className="w-3 h-3 text-indigo-500" />
          NLP Sentiment Engine
        </h3>
        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border shadow-sm ${
          data.politicalRiskIndex > 60 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
          data.politicalRiskIndex < 40 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
        }`}>
          {data.politicalRiskIndex > 60 ? 'VOLATILE TENSION' : data.politicalRiskIndex < 40 ? 'MARKET STABILITY' : 'NEUTRAL TONE'}
        </span>
      </div>

      <div className="flex items-center gap-6 mb-8 p-4 glass-card rounded-2xl border-slate-700/20">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              className="text-slate-800/50"
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <circle
              className={`${data.politicalRiskIndex > 50 ? 'text-rose-500' : 'text-emerald-500'} transition-all duration-1000`}
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeDasharray={`${data.politicalRiskIndex}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-black text-white leading-none">{data.score > 0 ? '+' : ''}{data.score.toFixed(2)}</span>
            <span className="text-[8px] font-black text-slate-500 uppercase">Beta</span>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 leading-relaxed italic">
          <span className="text-slate-200 font-bold">{data.simulated ? 'Generated-news sentiment demo' : 'Sentiment feed'}</span> detected a <span className={`font-black ${data.score > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{data.label.toUpperCase()}</span> bias. {data.simulated ? 'These headlines are simulated and are not an official news feed.' : ''}
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto max-h-[220px] pr-2 scrollbar-thin scrollbar-thumb-slate-800/50">
        {data.news.map((n) => (
          <div key={n.id} className="group relative pl-4 transition-all hover:pl-5">
            <div className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${
              n.impactEffect === 'DOLLAR_BULLISH' ? 'bg-amber-500' : 'bg-indigo-500'
            }`} />
            <div className="flex justify-between items-start mb-1.5">
              <span className={`text-[8px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-widest ${
                n.impactEffect === 'DOLLAR_BULLISH' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                {n.impactEffect.replace('_', ' ')}
              </span>
              <span className="text-[9px] font-mono text-slate-600">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-[12px] text-slate-200 font-semibold leading-snug line-clamp-2 group-hover:text-white transition-colors">{n.title}</div>
            <div className="flex items-center gap-1.5 mt-2">
               <Newspaper className="w-2.5 h-2.5 text-slate-600" />
               <div className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{n.source}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
