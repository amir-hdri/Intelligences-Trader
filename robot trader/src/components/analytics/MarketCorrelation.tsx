import React from 'react';
import { CorrelationMetrics } from '../../types';

interface MarketCorrelationProps {
  data: CorrelationMetrics;
}

export const MarketCorrelation: React.FC<MarketCorrelationProps> = ({ data }) => {
  const items = [
    { label: 'USD Free', value: data.usdFree, color: 'text-blue-400', suffix: 'IRR' },
    { label: 'USD Nima', value: data.usdNima, color: 'text-cyan-400', suffix: 'IRR' },
    { label: 'Global Gold', value: data.globalGold, color: 'text-yellow-400', suffix: 'USD/oz' },
    { label: 'Global Brent', value: data.globalBrent, color: 'text-gray-300', suffix: 'USD/bbl' },
  ];

  return (
    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
      <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-4">Correlation Engine</h3>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        {items.map((item, i) => (
          <div key={i} className="bg-black/30 p-2 rounded border border-gray-800/50">
            <div className="text-[10px] text-gray-500 uppercase">{item.label}</div>
            <div className={`text-sm font-bold ${item.color}`}>
              {item.value.toLocaleString()} <span className="text-[9px] font-normal opacity-50">{item.suffix}</span>
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
