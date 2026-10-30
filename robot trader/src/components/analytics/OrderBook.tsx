import React, { useState, useMemo } from 'react';
import { OrderBook as OrderBookType } from '../../types';
import { Layers, ChevronDown, ChevronUp, AlertCircle, BarChart3, Flame, ArrowUpRight, ArrowDownRight, Maximize2, X, Activity, Zap } from 'lucide-react';
import { Badge, Modal } from '../common/ui';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface OrderBookProps {
  data: OrderBookType;
  className?: string;
  onSelectPrice?: (price: number) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({ data, className, onSelectPrice }) => {
  const [viewMode, setViewMode] = useState<'depth' | 'heatmap' | 'cumulative'>('depth');
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [showFullModal, setShowFullModal] = useState(false);

  const bids = data?.bids || [];
  const asks = data?.asks || [];

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadPct = bestBid ? (spread / bestBid) * 100 : 0;
  const spreadBps = spreadPct * 100;

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
    <div
      aria-label="Order Book & Level 2 Depth Visualizer"
      className={cn("glass-panel p-5 lg:p-6 rounded-3xl font-mono flex flex-col justify-between border border-white/[0.08] relative overflow-hidden", className)}
    >
      {/* Header with Mode Switcher & Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center text-[#00F0FF]">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">
                Order Book & L2 Depth
              </h3>
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            </div>
            <div className="text-[10px] text-[#849495] font-sans">
              Real-time tick engine & micro-structure feed
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Spoofing detection badge */}
          {data.isSpoofingDetected && (
            <Badge tone="crimson" dot>
              Spoofing Warning
            </Badge>
          )}

          {data.simulated && (
            <Badge tone="amber">
              Simulated
            </Badge>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center rounded-xl bg-[#060E20] p-1 border border-white/[0.08] text-[10px] font-bold">
            <button
              onClick={() => setViewMode('depth')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all",
                viewMode === 'depth' ? "bg-[#00F0FF] text-[#060E20] font-black shadow-sm" : "text-[#849495] hover:text-white"
              )}
            >
              Bars
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all",
                viewMode === 'heatmap' ? "bg-[#00F0FF] text-[#060E20] font-black shadow-sm" : "text-[#849495] hover:text-white"
              )}
            >
              Heatmap
            </button>
            <button
              onClick={() => setViewMode('cumulative')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all",
                viewMode === 'cumulative' ? "bg-[#00F0FF] text-[#060E20] font-black shadow-sm" : "text-[#849495] hover:text-white"
              )}
            >
              Cumulative
            </button>
          </div>

          <button
            aria-label="Expand order book to modal"
            onClick={() => setShowFullModal(true)}
            title="Expand Full Modal"
            className="p-2 rounded-xl bg-[#060E20] border border-white/[0.08] text-[#849495] hover:text-white hover:border-white/20 transition-all min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#00F0FF]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MOBILE SUMMARY (COMPACT VIEW FOR SCREENS < 768px) */}
      <div className="block md:hidden space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div
            onClick={() => onSelectPrice && bestBid && onSelectPrice(bestBid)}
            className="bg-[#060E20] border border-[#10B981]/25 rounded-2xl p-3 cursor-pointer"
          >
            <div className="text-[10px] text-[#849495] uppercase font-bold">Best Bid</div>
            <div className="text-[#10B981] font-black text-sm mt-0.5">{bestBid.toLocaleString()}</div>
            <div className="text-[10px] text-[#849495] mt-0.5">{bids[0]?.quantity || 0} lots</div>
          </div>
          <div
            onClick={() => onSelectPrice && bestAsk && onSelectPrice(bestAsk)}
            className="bg-[#060E20] border border-[#EF4444]/25 rounded-2xl p-3 cursor-pointer"
          >
            <div className="text-[10px] text-[#849495] uppercase font-bold">Best Ask</div>
            <div className="text-[#EF4444] font-black text-sm mt-0.5">{bestAsk.toLocaleString()}</div>
            <div className="text-[10px] text-[#849495] mt-0.5">{asks[0]?.quantity || 0} lots</div>
          </div>
        </div>

        {/* Spread & Imbalance Bar */}
        <div className="p-3.5 rounded-2xl bg-[#060E20] border border-white/[0.06] space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#849495]">Spread: <strong className="text-white">{spread.toLocaleString()} IRR ({spreadBps.toFixed(1)} bps)</strong></span>
            <span className={cn("font-bold", imbalance >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
              Imbalance: {imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#131B2E] overflow-hidden flex">
            <div className="bg-[#10B981] h-full transition-all duration-300" style={{ width: `${bidRatio * 100}%` }} />
            <div className="bg-[#EF4444] h-full transition-all duration-300" style={{ width: `${askRatio * 100}%` }} />
          </div>
        </div>

        {/* Mobile Accordion Toggle */}
        <button
          onClick={() => setIsMobileExpanded(!isMobileExpanded)}
          className="w-full py-3 rounded-xl bg-[#060E20] border border-white/10 hover:bg-white/[0.06] text-xs font-bold text-[#849495] hover:text-white flex items-center justify-center gap-2 min-h-[44px]"
        >
          <span>{isMobileExpanded ? 'Collapse Order Book' : 'View Top 10 Bids & Asks'}</span>
          {isMobileExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Mobile Expanded List */}
        {isMobileExpanded && (
          <div className="grid grid-cols-2 gap-2 pt-2 animate-in fade-in duration-200">
            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase text-[#EF4444] border-b border-[#EF4444]/20 pb-1">Asks</div>
              {asks.slice(0, 8).map((ask, i) => (
                <div
                  key={i}
                  onClick={() => onSelectPrice && onSelectPrice(ask.price)}
                  className="relative flex justify-between px-2 py-1 text-[11px] rounded bg-white/[0.02] cursor-pointer"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[#EF4444]/15 rounded-sm"
                    style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                  />
                  <span className="text-[#EF4444] font-bold z-10">{ask.price.toLocaleString()}</span>
                  <span className="text-white z-10">{ask.quantity}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase text-[#10B981] border-b border-[#10B981]/20 pb-1">Bids</div>
              {bids.slice(0, 8).map((bid, i) => (
                <div
                  key={i}
                  onClick={() => onSelectPrice && onSelectPrice(bid.price)}
                  className="relative flex justify-between px-2 py-1 text-[11px] rounded bg-white/[0.02] cursor-pointer"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-[#10B981]/15 rounded-sm"
                    style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                  />
                  <span className="text-white z-10">{bid.quantity}</span>
                  <span className="text-[#10B981] font-bold z-10">{bid.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP & TABLET TWO-COLUMN PROFESSIONAL BOOK */}
      <div className="hidden md:block">
        {/* Spread Summary Banner */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-[#060E20] border border-white/[0.06] mb-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[#849495] text-[10px] uppercase tracking-wider font-bold">L2 Spread</span>
            <span className="text-white font-black">{spread.toLocaleString()} IRR</span>
            <span className="text-[#00F0FF] text-[11px]">({spreadPct.toFixed(3)}% • {spreadBps.toFixed(1)} bps)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#849495] uppercase font-bold">Pressure</span>
            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black border", imbalance >= 0 ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30")}>
              {imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}% {imbalance >= 0 ? 'BULLISH' : 'BEARISH'}
            </span>
          </div>
        </div>

        {/* 2-Column Grid (Asks & Bids) */}
        <div className="grid grid-cols-2 gap-4">
          {/* Asks (Sells) Column - Reversed so closest to market is at bottom */}
          <div className="flex flex-col-reverse space-y-0.5 space-y-reverse">
            <div className="flex justify-between text-[9px] font-mono font-bold text-[#849495] uppercase tracking-wider border-b border-white/[0.06] pb-1.5 mb-1">
              <span>Price (IRR)</span>
              <span>Size (Lots)</span>
              <span>Count</span>
            </div>
            {asks.slice(0, 10).map((ask, i) => {
              const pct = viewMode === 'cumulative'
                ? ((cumulativeAsks[i]?.cumQty || 1) / maxCumQty) * 100
                : (ask.quantity / maxQty) * 100;
              const heatOpacity = viewMode === 'heatmap' ? 0.08 + (ask.quantity / maxQty) * 0.4 : 0.15;

              return (
                <div
                  key={i}
                  onClick={() => onSelectPrice && onSelectPrice(ask.price)}
                  className="relative flex justify-between items-center py-1 px-2.5 group rounded-lg hover:bg-white/5 transition-colors text-[11px] cursor-pointer"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[#EF4444] rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%`, opacity: heatOpacity }}
                  />
                  <span className="text-[#EF4444] font-bold z-10 group-hover:underline">{ask.price.toLocaleString()}</span>
                  <span className="text-white z-10">{ask.quantity.toLocaleString()}</span>
                  <span className="text-[#849495] text-[10px] z-10">{ask.count || 1}</span>
                </div>
              );
            })}
          </div>

          {/* Bids (Buys) Column */}
          <div className="flex flex-col space-y-0.5">
            <div className="flex justify-between text-[9px] font-mono font-bold text-[#849495] uppercase tracking-wider border-b border-white/[0.06] pb-1.5 mb-1">
              <span>Count</span>
              <span>Size (Lots)</span>
              <span className="text-right">Price (IRR)</span>
            </div>
            {bids.slice(0, 10).map((bid, i) => {
              const pct = viewMode === 'cumulative'
                ? ((cumulativeBids[i]?.cumQty || 1) / maxCumQty) * 100
                : (bid.quantity / maxQty) * 100;
              const heatOpacity = viewMode === 'heatmap' ? 0.08 + (bid.quantity / maxQty) * 0.4 : 0.15;

              return (
                <div
                  key={i}
                  onClick={() => onSelectPrice && onSelectPrice(bid.price)}
                  className="relative flex justify-between items-center py-1 px-2.5 group rounded-lg hover:bg-white/5 transition-colors text-[11px] cursor-pointer"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-[#10B981] rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%`, opacity: heatOpacity }}
                  />
                  <span className="text-[#849495] text-[10px] z-10">{bid.count || 1}</span>
                  <span className="text-white z-10">{bid.quantity.toLocaleString()}</span>
                  <span className="text-[#10B981] font-bold z-10 text-right group-hover:underline">{bid.price.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-time Depth Imbalance Bar */}
        <div className="mt-3.5 pt-3 border-t border-white/[0.06]">
          <div className="h-2 w-full bg-[#060E20] rounded-full overflow-hidden flex p-[1px] border border-white/[0.08]">
            <div className="bg-[#10B981] h-full transition-all duration-500 rounded-l-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: `${bidRatio * 100}%` }} />
            <div className="bg-[#EF4444] h-full transition-all duration-500 rounded-r-full shadow-[0_0_8px_rgba(239,68,68,0.5)]" style={{ width: `${askRatio * 100}%` }} />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#849495] mt-1.5 font-mono">
            <span className="text-[#10B981] font-bold">Bids: {totalBidQty.toLocaleString()} ({(bidRatio * 100).toFixed(0)}%)</span>
            <span className="font-bold text-white uppercase">Queue Micro-Dynamics: {data.queueDynamics?.isHerdingDetected ? 'Clustered' : 'Balanced'}</span>
            <span className="text-[#EF4444] font-bold">Asks: {totalAskQty.toLocaleString()} ({(askRatio * 100).toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* FULLSCREEN MODAL FOR L2 DEPTH */}
      <Modal
        isOpen={showFullModal}
        onClose={() => setShowFullModal(false)}
        title="Full L2 Order Depth (20 Ticks)"
        maxWidth="lg"
      >
        <div className="grid grid-cols-2 gap-4 font-mono text-xs max-h-[65vh] overflow-y-auto">
          {/* Asks */}
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase text-[#EF4444] border-b border-[#EF4444]/30 pb-1.5 flex justify-between">
              <span>Ask Price</span>
              <span>Volume</span>
            </div>
            {asks.map((ask, i) => (
              <div
                key={i}
                onClick={() => {
                  if (onSelectPrice) onSelectPrice(ask.price);
                  setShowFullModal(false);
                }}
                className="relative flex justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/5 cursor-pointer"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#EF4444]/20 rounded-sm"
                  style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                />
                <span className="text-[#EF4444] font-bold z-10">{ask.price.toLocaleString()}</span>
                <span className="text-white z-10">{ask.quantity.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Bids */}
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase text-[#10B981] border-b border-[#10B981]/30 pb-1.5 flex justify-between">
              <span>Volume</span>
              <span>Bid Price</span>
            </div>
            {bids.map((bid, i) => (
              <div
                key={i}
                onClick={() => {
                  if (onSelectPrice) onSelectPrice(bid.price);
                  setShowFullModal(false);
                }}
                className="relative flex justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/5 cursor-pointer"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-[#10B981]/20 rounded-sm"
                  style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                />
                <span className="text-white z-10">{bid.quantity.toLocaleString()}</span>
                <span className="text-[#10B981] font-bold z-10">{bid.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OrderBook;

