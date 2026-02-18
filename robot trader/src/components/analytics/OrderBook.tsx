import React from 'react';
import { OrderBook as OrderBookType } from '../../types';

interface OrderBookProps {
  data: OrderBookType;
}

export const OrderBook: React.FC<OrderBookProps> = ({ data }) => {
  const maxQty = Math.max(
    ...data.bids.map(b => b.quantity),
    ...data.asks.map(a => a.quantity)
  );

  return (
    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 font-mono text-xs">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-gray-400 font-bold uppercase tracking-wider">Market Depth (Level 2)</h3>
        {data.isSpoofingDetected && (
          <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded animate-pulse border border-red-500/50">
            SPOOFING ALERT
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Asks (Sells) */}
        <div className="flex flex-col-reverse">
          {data.asks.map((ask, i) => (
            <div key={i} className="relative flex justify-between py-1 px-2 mb-0.5 group">
              <div 
                className="absolute right-0 top-0 bottom-0 bg-red-500/10 transition-all"
                style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
              />
              <span className="text-red-400 z-10">{ask.price.toLocaleString()}</span>
              <span className="text-gray-300 z-10">{ask.quantity.toLocaleString()}</span>
            </div>
          ))}
          <div className="text-center text-gray-500 mb-2 border-b border-gray-800 pb-1 uppercase tracking-tighter">Asks</div>
        </div>

        {/* Bids (Buys) */}
        <div>
          <div className="text-center text-gray-500 mb-2 border-b border-gray-800 pb-1 uppercase tracking-tighter">Bids</div>
          {data.bids.map((bid, i) => (
            <div key={i} className="relative flex justify-between py-1 px-2 mb-0.5 group">
              <div 
                className="absolute left-0 top-0 bottom-0 bg-green-500/10 transition-all"
                style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
              />
              <span className="text-gray-300 z-10">{bid.quantity.toLocaleString()}</span>
              <span className="text-green-400 z-10">{bid.price.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex justify-between items-center mb-1 text-[10px]">
          <span className="text-gray-500 uppercase">Order Pressure</span>
          <span className={data.pressure > 0 ? 'text-green-400' : 'text-red-400'}>
            {(data.pressure * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${(data.pressure + 1) * 50}%` }}
          />
        </div>
      </div>
    </div>
  );
};
