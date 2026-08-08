import React, { useState, useMemo } from 'react';
import { OrderBook as OrderBookType } from '../../types';
import { Layers, ChevronDown, ChevronUp, AlertCircle, BarChart3, Flame, ArrowUpRight, ArrowDownRight, Maximize2, X } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface OrderBookProps {
  data: OrderBookType;
  className?: string;
}

export const OrderBook: React.FC<OrderBookProps> = ({ data, className }) => {
  const [viewMode, setViewMode] = useState<'depth' | 'heatmap' | 'cumulative'>('depth');
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [showFullModal, setShowFullModal] = useState(false);

  const bids = data?.bids || [];
  const asks = data?.asks || [];

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadPct = bestBid ? (spread / bestBid) * 100 : 0;

  const totalBidQty = useMemo(() => bids.reduce((sum, b) => sum + b.quantity, 0), [bids]);
  const totalAskQty = useMemo(() => asks.reduce((sum, a) => sum + a.quantity, 0), [asks]);
  const totalVolume = totalBidQty + totalAskQty || 1;
  const bidRatio = totalBidQty / totalVolume;
  const askRatio = totalAskQty / totalVolume;
  const imbalance = ((totalBidQty - totalAskQty) / totalVolume) * 100;

  const maxQty = useMemo(() => {
    return Math.max(...bids.map((b) => b.quantity), ...asks.map((a) => a.quantity), 1);
  }, [bids, asks]);

  // Cumulative depth calculation
  const cumulativeBids = useMemo(() => {
    let acc = 0;
    return bids.map((b) => {
      acc += b.quantity;
      return { ...b, cumQty: acc };
    });
  }, [bids]);

  const cumulativeAsks = useMemo(() => {
    let acc = 0;
    return asks.map((a) => {
      acc += a.quantity;
      return { ...a, cumQty: acc };
    });
  }, [asks]);

  const maxCumQty = Math.max(
    cumulativeBids[cumulativeBids.length - 1]?.cumQty || 1,
    cumulativeAsks[cumulativeAsks.length - 1]?.cumQty || 1
  );

  return (
    <div className={cn("glass-panel p-4 lg:p-5 rounded-2xl font-mono flex flex-col justify-between", className)}>
      {/* Header with Mode Switcher & Spoofing Warning */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <h3 className="text-slate-300 font-black text-xs uppercase tracking-widest flex items-center gap-1.5">
            Order Book & L2 Depth
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Spoofing detection badge */}
          {data.isSpoofingDetected && (
            <span className="flex items-center gap-1 bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full text-[10px] font-black border border-rose-500/30 animate-pulse">
              <AlertCircle className="w-3 h-3" />
              SPOOFING
            </span>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08] text-[10px] font-black">
            <button
              onClick={() => setViewMode('depth')}
              className={cn("px-2 py-1 rounded-lg transition-all", viewMode === 'depth' ? "bg-violet-600 text-white" : "text-[#94A3B8]")}
            >
              Bars
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={cn("px-2 py-1 rounded-lg transition-all", viewMode === 'heatmap' ? "bg-violet-600 text-white" : "text-[#94A3B8]")}
            >
              Heatmap
            </button>
            <button
              onClick={() => setViewMode('cumulative')}
              className={cn("px-2 py-1 rounded-lg transition-all", viewMode === 'cumulative' ? "bg-violet-600 text-white" : "text-[#94A3B8]")}
            >
              Cumul.
            </button>
          </div>

          <button
            onClick={() => setShowFullModal(true)}
            title="Expand Full Modal"
            className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#94A3B8] hover:text-white min-h-[32px] min-w-[32px] grid place-items-center"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MOBILE COMPACT SUMMARY (VISIBLE ON MOBILE PHONES) */}
      <div className="block md:hidden space-y-3">
        {/* Key Metrics Quick Card */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="elevated rounded-xl p-3">
            <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Best Bid</div>
            <div className="text-emerald-400 font-black text-sm mt-0.5">{bestBid.toLocaleString()}</div>
            <div className="text-[10px] text-[#94A3B8] mt-1">{bids[0]?.quantity || 0} units</div>
          </div>
          <div className="elevated rounded-xl p-3">
            <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Best Ask</div>
            <div className="text-red-400 font-black text-sm mt-0.5">{bestAsk.toLocaleString()}</div>
            <div className="text-[10px] text-[#94A3B8] mt-1">{asks[0]?.quantity || 0} units</div>
          </div>
        </div>

        {/* Spread & Imbalance Bar */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#64748B]">Spread: <strong className="text-white">{spread.toLocaleString()} ({spreadPct.toFixed(2)}%)</strong></span>
            <span className={cn("font-bold", imbalance >= 0 ? "text-emerald-400" : "text-red-400")}>
              Imbalance: {imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${bidRatio * 100}%` }} />
            <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${askRatio * 100}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-[#64748B]">
            <span>Bids: {totalBidQty.toLocaleString()}</span>
            <span>Asks: {totalAskQty.toLocaleString()}</span>
          </div>
        </div>

        {/* Mobile Accordion Toggle */}
        <button
          onClick={() => setIsMobileExpanded(!isMobileExpanded)}
          className="w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-xs font-bold text-[#94A3B8] hover:text-white flex items-center justify-center gap-2 min-h-[44px]"
        >
          <span>{isMobileExpanded ? 'Hide Full Order Book' : 'View Top 10 Bids & Asks'}</span>
          {isMobileExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Mobile Expanded List */}
        {isMobileExpanded && (
          <div className="grid grid-cols-2 gap-2 pt-2 animate-in fade-in duration-200">
            {/* Asks (Sells) */}
            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase text-red-400 border-b border-red-500/20 pb-1">Asks / Sells</div>
              {asks.slice(0, 7).map((ask, i) => (
                <div key={i} className="relative flex justify-between px-1.5 py-1 text-[11px] rounded bg-white/[0.02]">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded-sm"
                    style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                  />
                  <span className="text-red-400 font-bold z-10">{ask.price.toLocaleString()}</span>
                  <span className="text-slate-300 z-10">{ask.quantity}</span>
                </div>
              ))}
            </div>

            {/* Bids (Buys) */}
            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase text-emerald-400 border-b border-emerald-500/20 pb-1">Bids / Buys</div>
              {bids.slice(0, 7).map((bid, i) => (
                <div key={i} className="relative flex justify-between px-1.5 py-1 text-[11px] rounded bg-white/[0.02]">
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 rounded-sm"
                    style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                  />
                  <span className="text-slate-300 z-10">{bid.quantity}</span>
                  <span className="text-emerald-400 font-bold z-10">{bid.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP & TABLET TWO-COLUMN PROFESSIONAL BOOK */}
      <div className="hidden md:block">
        {/* Spread Summary Banner */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[#64748B] text-[10px] uppercase tracking-wider">Spread</span>
            <span className="text-white font-black">{spread.toLocaleString()}</span>
            <span className="text-[#64748B] text-[11px]">({spreadPct.toFixed(3)}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#64748B] uppercase">Imbalance</span>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-black", imbalance >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 2-Column Grid (Asks & Bids) */}
        <div className="grid grid-cols-2 gap-4">
          {/* Asks (Sells) Column - Reversed so closest to market is at bottom */}
          <div className="flex flex-col-reverse space-y-0.5 space-y-reverse">
            <div className="flex justify-between text-[9px] font-black text-[#64748B] uppercase tracking-widest border-b border-slate-800 pb-1 mb-1">
              <span>Price (IRR)</span>
              <span>Size</span>
              <span>Orders</span>
            </div>
            {asks.slice(0, 8).map((ask, i) => {
              const pct = viewMode === 'cumulative'
                ? ((cumulativeAsks[i]?.cumQty || 1) / maxCumQty) * 100
                : (ask.quantity / maxQty) * 100;
              const heatOpacity = viewMode === 'heatmap' ? 0.05 + (ask.quantity / maxQty) * 0.35 : 0.12;

              return (
                <div key={i} className="relative flex justify-between items-center py-1 px-2 group rounded hover:bg-white/5 transition-colors text-[11px]">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-500 rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%`, opacity: heatOpacity }}
                  />
                  <span className="text-red-400 font-bold z-10">{ask.price.toLocaleString()}</span>
                  <span className="text-slate-200 z-10">{ask.quantity.toLocaleString()}</span>
                  <span className="text-slate-500 text-[10px] z-10">{ask.count || 1}</span>
                </div>
              );
            })}
          </div>

          {/* Bids (Buys) Column */}
          <div className="flex flex-col space-y-0.5">
            <div className="flex justify-between text-[9px] font-black text-[#64748B] uppercase tracking-widest border-b border-slate-800 pb-1 mb-1">
              <span>Orders</span>
              <span>Size</span>
              <span className="text-right">Price (IRR)</span>
            </div>
            {bids.slice(0, 8).map((bid, i) => {
              const pct = viewMode === 'cumulative'
                ? ((cumulativeBids[i]?.cumQty || 1) / maxCumQty) * 100
                : (bid.quantity / maxQty) * 100;
              const heatOpacity = viewMode === 'heatmap' ? 0.05 + (bid.quantity / maxQty) * 0.35 : 0.12;

              return (
                <div key={i} className="relative flex justify-between items-center py-1 px-2 group rounded hover:bg-white/5 transition-colors text-[11px]">
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%`, opacity: heatOpacity }}
                  />
                  <span className="text-slate-500 text-[10px] z-10">{bid.count || 1}</span>
                  <span className="text-slate-200 z-10">{bid.quantity.toLocaleString()}</span>
                  <span className="text-emerald-400 font-bold z-10 text-right">{bid.price.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-time Depth Imbalance Bar */}
        <div className="mt-3 pt-3 border-t border-slate-800/60">
          <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${bidRatio * 100}%` }} />
            <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${askRatio * 100}%` }} />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#64748B] mt-1.5 font-sans">
            <span>Bids: {totalBidQty.toLocaleString()} ({(bidRatio * 100).toFixed(0)}%)</span>
            <span className="font-bold text-white uppercase">Queue Herding {data.queueDynamics?.isHerdingDetected ? 'Active' : 'Balanced'}</span>
            <span>Asks: {totalAskQty.toLocaleString()} ({(askRatio * 100).toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* FULLSCREEN MODAL FOR L2 DEPTH */}
      {showFullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-3xl bg-[#0B0F19] border border-white/10 p-6 shadow-2xl overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-violet-300">
                Full Depth Order Book — 20 Levels
              </h3>
              <button
                onClick={() => setShowFullModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-[#64748B] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Sells */}
              <div className="space-y-1">
                <div className="text-xs font-black uppercase text-red-400 pb-1">Asks / Sells</div>
                {asks.map((ask, i) => (
                  <div key={i} className="relative flex justify-between px-2 py-1 text-xs rounded bg-white/[0.02]">
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-red-500/15 rounded-sm"
                      style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                    />
                    <span className="text-red-400 font-bold z-10">{ask.price.toLocaleString()}</span>
                    <span className="text-slate-300 z-10">{ask.quantity.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Buys */}
              <div className="space-y-1">
                <div className="text-xs font-black uppercase text-emerald-400 pb-1">Bids / Buys</div>
                {bids.map((bid, i) => (
                  <div key={i} className="relative flex justify-between px-2 py-1 text-xs rounded bg-white/[0.02]">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-emerald-500/15 rounded-sm"
                      style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                    />
                    <span className="text-slate-300 z-10">{bid.quantity.toLocaleString()}</span>
                    <span className="text-emerald-400 font-bold z-10">{bid.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBook;
