import React from 'react';
import { CorrelationMetrics } from '../../types';

interface MarketCorrelationProps {
  data: CorrelationMetrics;
}

export const MarketCorrelation: React.FC<MarketCorrelationProps> = ({ data }) => {
  const items = [
    { label: 'USD Free', value: data.usdFree, color: 'text-indigo-400', suffix: 'IRR', shadow: 'shadow-indigo-500/10' },
    { label: 'USD Nima', value: data.usdNima, color: 'text-sky-400', suffix: 'IRR', shadow: 'shadow-sky-500/10' },
    { label: 'Global Gold', value: data.globalGold, color: 'text-amber-400', suffix: 'USD/oz', shadow: 'shadow-amber-500/10' },
    { label: 'LME Copper', value: data.globalCopper, color: 'text-orange-400', suffix: 'USD/MT', shadow: 'shadow-orange-500/10' },
  ];

  return (
    <div className="glass-panel p-5 rounded-2xl">
      <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] mb-5">Macro Covariates</h3>
      
      <div className="grid grid-cols-2 gap-3.5 mb-8">
        {items.map((item, i) => (
          <div key={i} className={`glass-card p-3.5 rounded-xl border-slate-700/30 ${item.shadow}`}>
            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1.5">{item.label}</div>
            <div className={`text-base font-black ${item.color} tracking-tight`}>
              {item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[8px] font-bold text-slate-500 ml-0.5 uppercase tracking-tighter">{item.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {Object.entries(data.correlations).map(([key, val], i) => (
          <div key={i} className="flex flex-col group">
            <div className="flex justify-between text-[10px] mb-2 font-black uppercase tracking-widest">
              <span className="text-slate-500 group-hover:text-indigo-400 transition-colors">{key.replace('_', ' vs ')}</span>
              <span className="text-slate-300">{(val * 100).toFixed(0)}% Intensity</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/20">
              <div 
                className="h-full bg-gradient-to-r from-indigo-600 to-sky-400 transition-all duration-1000"
                style={{ width: `${val * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
