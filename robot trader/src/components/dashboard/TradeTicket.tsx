import React, { useState, useMemo } from 'react';
import { ExpertForecast, RiskStatus, SymbolInfo } from '../../types';
import { Target, AlertTriangle, ShieldCheck, Play, ArrowRight, X, Check, RefreshCw } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface TradeTicketProps {
  symbol: SymbolInfo;
  forecast: ExpertForecast | null;
  riskStatus: RiskStatus;
  onExecuteTrade: (order: {
    action: 'BUY' | 'SELL';
    qty: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    leverage: number;
  }) => void;
  className?: string;
}

export const TradeTicket: React.FC<TradeTicketProps> = ({
  symbol,
  forecast,
  riskStatus,
  onExecuteTrade,
  className
}) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>(forecast?.action === 'SELL' ? 'SELL' : 'BUY');
  const [quantity, setQuantity] = useState<number>(10);
  // Real market price fallback - no hard-coded 2481 etc., use symbol limits or forecast
  const fallbackPrice = symbol.priceLimit?.up ?? 1000000;
  const [entryPrice, setEntryPrice] = useState<number>(forecast?.entryPrice || fallbackPrice);
  const [stopLoss, setStopLoss] = useState<number>(forecast?.stopLoss || (fallbackPrice * 0.97));
  const [takeProfit, setTakeProfit] = useState<number>(forecast?.targetPrice || (fallbackPrice * 1.05));
  const [leverage, setLeverage] = useState<number>(3);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  // Sync state when forecast changes
  React.useEffect(() => {
    if (forecast) {
      if (forecast.action === 'BUY' || forecast.action === 'SELL') {
        setSide(forecast.action);
      }
      setEntryPrice(forecast.entryPrice);
      setStopLoss(forecast.stopLoss);
      setTakeProfit(forecast.targetPrice);
    }
  }, [forecast]);

  // Risk, Reward, and Risk/Reward calculations
  const riskAmount = useMemo(() => {
    const diff = Math.abs(entryPrice - stopLoss);
    return Math.round(diff * quantity);
  }, [entryPrice, stopLoss, quantity]);

  const rewardAmount = useMemo(() => {
    const diff = Math.abs(takeProfit - entryPrice);
    return Math.round(diff * quantity);
  }, [takeProfit, entryPrice, quantity]);

  const riskRewardRatio = useMemo(() => {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk === 0) return 0;
    return (reward / risk).toFixed(2);
  }, [entryPrice, stopLoss, takeProfit]);

  const estFees = useMemo(() => {
    return Math.round(quantity * entryPrice * 0.0008);
  }, [quantity, entryPrice]);

  const handleReviewOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setShowReviewModal(true);
  };

  const handleFinalConfirm = () => {
    onExecuteTrade({
      action: side,
      qty: quantity,
      entry: entryPrice,
      stopLoss,
      takeProfit,
      leverage
    });
    setShowReviewModal(false);
  };

  return (
    <div className={cn("glass-panel p-5 lg:p-6 rounded-3xl space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
            Professional Trade Ticket
          </h3>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
          LEVERAGE {leverage}×
        </span>
      </div>

      <form onSubmit={handleReviewOrder} className="space-y-4">
        {/* BUY / SELL Side Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#06080E] border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={cn(
              "py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 touch-target",
              side === 'BUY'
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-slate-400 hover:text-white"
            )}
          >
            BUY {symbol.name.split(' ')[0]}
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={cn(
              "py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 touch-target",
              side === 'SELL'
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "text-slate-400 hover:text-white"
            )}
          >
            SELL {symbol.name.split(' ')[0]}
          </button>
        </div>

        {/* Quantity & Entry Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#64748B]">Quantity (Units)</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm mono text-white min-h-[44px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#64748B]">Entry Price</span>
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl bg-[#101620] border border-white/10 px-3 py-2 text-sm mono text-white min-h-[44px]"
            />
          </label>
        </div>

        {/* Stop Loss & Take Profit */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-red-400">Stop Loss</span>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl bg-[#101620] border border-red-500/20 px-3 py-2 text-sm mono text-red-300 min-h-[44px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Take Profit</span>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl bg-[#101620] border border-emerald-500/20 px-3 py-2 text-sm mono text-emerald-300 min-h-[44px]"
            />
          </label>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] font-black uppercase text-[#64748B]">
            <span>Leverage Multiplier</span>
            <span className="text-white mono">{leverage}×</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            className="w-full accent-blue-500 h-2 bg-slate-800 rounded-lg cursor-pointer min-h-[32px]"
          />
        </div>

        {/* Risk / Reward Metrics Breakdown */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-center mono">
          <div className="elevated rounded-xl p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Risk ($)</div>
            <div className="font-black text-rose-400 text-xs mt-0.5">${riskAmount.toLocaleString()}</div>
          </div>
          <div className="elevated rounded-xl p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Reward ($)</div>
            <div className="font-black text-emerald-400 text-xs mt-0.5">${rewardAmount.toLocaleString()}</div>
          </div>
          <div className="elevated rounded-xl p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-[#64748B]">R / R Ratio</div>
            <div className="font-black text-blue-300 text-xs mt-0.5">1 : {riskRewardRatio}</div>
          </div>
        </div>

        {/* Review Order Action Button (48px height) */}
        <button
          type="submit"
          disabled={riskStatus.isKillSwitchActive}
          className={cn(
            "w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white shadow-xl transition-all flex items-center justify-center gap-2 trade-target",
            riskStatus.isKillSwitchActive
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : side === 'BUY'
              ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
              : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
          )}
        >
          <span>Review {side} Order</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* 2-STEP CONFIRMATION MODAL / FULL-SCREEN BOTTOM SHEET */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0B0F19] border border-white/10 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-blue-300">
                Confirm Execution — Paper Trading
              </span>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-[#64748B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={cn(
              "text-2xl font-black",
              side === 'BUY' ? "text-emerald-400" : "text-red-400"
            )}>
              {side} {symbol.name}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mono">
              <div className="elevated rounded-xl p-3">
                <div className="text-[#64748B] text-[11px] uppercase">Qty × Entry</div>
                <div className="font-black text-white text-sm mt-0.5">{quantity} × {entryPrice.toLocaleString()}</div>
              </div>
              <div className="elevated rounded-xl p-3">
                <div className="text-[#64748B] text-[11px] uppercase">Max Risk</div>
                <div className="font-black text-rose-400 text-sm mt-0.5">${riskAmount.toLocaleString()}</div>
              </div>
              <div className="elevated rounded-xl p-3">
                <div className="text-[#64748B] text-[11px] uppercase">Expected Reward</div>
                <div className="font-black text-emerald-400 text-sm mt-0.5">${rewardAmount.toLocaleString()}</div>
              </div>
              <div className="elevated rounded-xl p-3">
                <div className="text-[#64748B] text-[11px] uppercase">Risk / Reward</div>
                <div className="font-black text-blue-300 text-sm mt-0.5">1 : {riskRewardRatio}</div>
              </div>
            </div>

            <div className="text-xs text-[#94A3B8] bg-white/[0.02] p-3 rounded-xl border border-white/[0.04]">
              Leverage {leverage}× • Est. exchange fees: ${estFees.toLocaleString()} • Stop Loss is actively monitored.
            </div>

            {/* Separated Cancel and Confirm Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 font-bold text-xs text-[#94A3B8] hover:text-white trade-target"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalConfirm}
                className={cn(
                  "flex-1 py-3 rounded-xl font-black text-xs text-white uppercase tracking-wider shadow-xl trade-target flex items-center justify-center gap-1.5",
                  side === 'BUY' ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
                )}
              >
                <Check className="w-4 h-4" />
                <span>Confirm Trade</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeTicket;
