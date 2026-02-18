import React from 'react';
import { ArbitrageOpportunity } from '../../types';

interface ArbitragePanelProps {
  opportunities: ArbitrageOpportunity[];
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = ({ opportunities }) => {
  return (
    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
      <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-4">Arbitrage Scanner</h3>
      
      {opportunities.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-gray-600 text-[10px] uppercase mb-1">No active opportunities</div>
          <div className="text-gray-800 text-xs">Market is in efficient equilibrium</div>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opt, i) => (
            <div key={i} className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">{opt.type.replace(/_/g, ' ')}</div>
                  <div className="text-white text-xs font-bold">Converging Profit</div>
                </div>
                <div className="text-green-400 text-sm font-bold">+{opt.profitPercentage.toFixed(2)}%</div>
              </div>
              <p className="text-[10px] text-gray-400 leading-normal mb-3">{opt.details}</p>
              <button className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded transition-colors uppercase">
                Execute Spread
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-[9px] text-gray-600">
        <span>Scanning Spot vs Futures</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          LIVE
        </span>
      </div>
    </div>
  );
};
