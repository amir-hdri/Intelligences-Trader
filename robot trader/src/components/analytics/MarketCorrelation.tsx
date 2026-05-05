import React from 'react';
import { CorrelationMetrics } from '../../types';

interface MarketCorrelationProps {
  data: CorrelationMetrics;
}

export const MarketCorrelation: React.FC<MarketCorrelationProps> = ({ data }) => {
  const items = [
    { label: 'USD Free', value: data.usdFree, color: 'text-indigo-400', suffix: 'IRR' },
    { label: 'USD Nima', value: data.usdNima, color: 'text-sky-400', suffix: 'IRR' },
    { label: 'Global Gold', value: data.globalGold, color: 'text-amber-400', suffix: 'USD/oz' },
    { label: 'LME Copper', value: data.globalCopper, color: 'text-orange-400', suffix: 'USD/MT' },
  ];

  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
      <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-4">Dynamic Covariates</h3>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        {items.map((item, i) => (
          <div key={i} className="bg-slate-800/30 p-2 rounded border border-slate-700/50">
            <div className="text-[10px] text-slate-500 uppercase">{item.label}</div>
            <div className={`text-sm font-bold ${item.color}`}>
              {item.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[9px] font-normal opacity-50">{item.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Object.entries(data.correlations).map(([key, val], i) => (
          <div key={i} className="flex flex-col">
            <div className="flex justify-between text-[10px] mb-1 uppercase tracking-tighter">
              <span className="text-gray-500">{key.replace('_', ' vs ')}</span>
              <span className="text-gray-300">{(val * 100).toFixed(0)}% Match</span>
            </div>
            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500"
                style={{ width: `${val * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
