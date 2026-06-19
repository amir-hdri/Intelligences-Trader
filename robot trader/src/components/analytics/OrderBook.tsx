import React from 'react';
import { OrderBook as OrderBookType } from '../../types';

interface OrderBookProps {
  data: OrderBookType;
}

export const OrderBook: React.FC<OrderBookProps> = ({ data }) => {
  const maxQty = Math.max(
    ...data.bids.map(b => b.quantity),
    ...data.asks.map(a => a.quantity),
    1
  );

  return (
    <div className="glass-panel p-5 rounded-2xl font-mono">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Market Depth L2
        </h3>
        {data.isSpoofingDetected && (
          <div className="flex items-center gap-1.5 bg-rose-500/10 text-rose-400 px-2.5 py-1 rounded-md animate-pulse border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">Spoofing Detection</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Asks (Sells) */}
        <div className="flex flex-col-reverse">
          {data.asks.slice(0, 10).map((ask, i) => (
            <div key={i} className="relative flex justify-between py-1 px-2 mb-0.5 group rounded transition-colors hover:bg-white/5">
              <div 
                className="absolute right-0 top-0 bottom-0 bg-rose-500/10 transition-all duration-500 rounded-sm"
                style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
              />
              <span className="text-rose-400 text-[11px] font-bold z-10">{ask.price.toLocaleString()}</span>
              <span className="text-slate-300 text-[11px] z-10">{ask.quantity.toLocaleString()}</span>
            </div>
          ))}
          <div className="text-center text-slate-500 text-[9px] font-black mb-3 uppercase tracking-widest border-b border-slate-800/50 pb-1.5">Asks / Sells</div>
        </div>

        {/* Bids (Buys) */}
        <div>
          <div className="text-center text-slate-500 text-[9px] font-black mb-3 uppercase tracking-widest border-b border-slate-800/50 pb-1.5">Bids / Buys</div>
          {data.bids.slice(0, 10).map((bid, i) => (
            <div key={i} className="relative flex justify-between py-1 px-2 mb-0.5 group rounded transition-colors hover:bg-white/5">
              <div 
                className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 transition-all duration-500 rounded-sm"
                style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
              />
              <span className="text-slate-300 text-[11px] z-10">{bid.quantity.toLocaleString()}</span>
              <span className="text-emerald-400 text-[11px] font-bold z-10">{bid.price.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-800/50">
        <div className="flex justify-between items-center mb-2.5 text-[10px] font-black uppercase tracking-widest">
          <span className="text-slate-500">Order Pressure</span>
          <span className={data.pressure > 0 ? 'text-emerald-400 text-glow' : 'text-rose-400 text-glow'}>
            {(data.pressure * 100).toFixed(1)}% {data.pressure > 0 ? 'BULL' : 'BEAR'}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden flex border border-slate-700/30">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-700 ease-out"
            style={{ width: `${(data.pressure + 1) * 50}%` }}
          />
        </div>
      </div>
    </div>
  );
};
