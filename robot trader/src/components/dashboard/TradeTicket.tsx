import React, { useState, useMemo, useEffect } from 'react';
import { ExpertForecast, RiskStatus, SymbolInfo } from '../../types';
import { Target, AlertTriangle, ShieldCheck, Play, ArrowRight, X, Check, RefreshCw, Zap, Sliders, DollarSign, Layers } from 'lucide-react';
import { Badge, Modal } from '../common/ui';

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
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET' | 'STOP'>('LIMIT');
  const [quantity, setQuantity] = useState<number>(10);

  const fallbackPrice = symbol.priceLimit?.up ?? 1000000;
  const [entryPrice, setEntryPrice] = useState<number>(forecast?.entryPrice || fallbackPrice);
  const [stopLoss, setStopLoss] = useState<number>(forecast?.stopLoss || Math.round(fallbackPrice * 0.97));
  const [takeProfit, setTakeProfit] = useState<number>(forecast?.targetPrice || Math.round(fallbackPrice * 1.05));
  const [leverage, setLeverage] = useState<number>(3);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  // Sync state when forecast changes
  useEffect(() => {
    if (forecast) {
      if (forecast.action === 'BUY' || forecast.action === 'SELL') {
        setSide(forecast.action);
      }
      if (forecast.entryPrice > 0) setEntryPrice(forecast.entryPrice);
      if (forecast.stopLoss > 0) setStopLoss(forecast.stopLoss);
      if (forecast.targetPrice > 0) setTakeProfit(forecast.targetPrice);
    }
  }, [forecast]);

  // Risk, Reward, and Risk/Reward calculations
  const riskAmount = useMemo(() => {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss) || !Number.isFinite(quantity)) return 0;
    const diff = Math.abs(entryPrice - stopLoss);
    return Math.round(diff * quantity);
  }, [entryPrice, stopLoss, quantity]);

  const rewardAmount = useMemo(() => {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(takeProfit) || !Number.isFinite(quantity)) return 0;
    const diff = Math.abs(takeProfit - entryPrice);
    return Math.round(diff * quantity);
  }, [takeProfit, entryPrice, quantity]);

  const riskRewardRatio = useMemo((): string => {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) return '0.00';
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk === 0) return '0.00';
    return (reward / risk).toFixed(2);
  }, [entryPrice, stopLoss, takeProfit]);

  const estFees = useMemo(() => {
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice)) return 0;
    return Math.round(quantity * entryPrice * 0.0008);
  }, [quantity, entryPrice]);

  const estLiquidation = useMemo(() => {
    if (!Number.isFinite(entryPrice) || leverage <= 1) return 0;
    const marginRatio = 1 / leverage;
    return side === 'BUY'
      ? Math.round(entryPrice * (1 - marginRatio * 0.9))
      : Math.round(entryPrice * (1 + marginRatio * 0.9));
  }, [entryPrice, leverage, side]);

  const handleQuickLots = (lots: number) => {
    setQuantity(Math.max(1, Math.round(lots)));
  };

  const handleQuickSL = (deltaPct: number) => {
    if (side === 'BUY') {
      setStopLoss(Math.round(entryPrice * (1 - deltaPct / 100)));
    } else {
      setStopLoss(Math.round(entryPrice * (1 + deltaPct / 100)));
    }
  };

  const handleQuickTP = (deltaPct: number) => {
    if (side === 'BUY') {
      setTakeProfit(Math.round(entryPrice * (1 + deltaPct / 100)));
    } else {
      setTakeProfit(Math.round(entryPrice * (1 - deltaPct / 100)));
    }
  };

  const handleReviewOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0 || entryPrice <= 0) return;
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
    <div
      aria-label="Order Execution Gateway"
      className={cn("glass-panel p-6 rounded-3xl space-y-5 border border-white/[0.08] relative overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-center">
            <Target className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Institutional Order Ticket
            </h3>
            <span className="text-[10px] text-[#849495] font-mono">
              Market: {symbol.name} ({symbol.id})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={riskStatus.isKillSwitchActive ? 'crimson' : 'emerald'} dot>
            {riskStatus.isKillSwitchActive ? 'LOCKOUT' : 'GATEWAY OPEN'}
          </Badge>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF]">
            {leverage}× LEVERAGE
          </span>
        </div>
      </div>

      <form onSubmit={handleReviewOrder} className="space-y-4">
        {/* BUY / SELL Side Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#060E20] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={cn(
              "py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 touch-target",
              side === 'BUY'
                ? "bg-[#10B981] text-[#060E20] shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                : "text-[#849495] hover:text-white hover:bg-white/[0.04]"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-current" />
            BUY LONG
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={cn(
              "py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 touch-target",
              side === 'SELL'
                ? "bg-[#EF4444] text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]"
                : "text-[#849495] hover:text-white hover:bg-white/[0.04]"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-current" />
            SELL SHORT
          </button>
        </div>

        {/* Order Type Tabs */}
        <div className="flex gap-1 bg-[#060E20] p-1 rounded-xl border border-white/[0.06]">
          {(['LIMIT', 'MARKET', 'STOP'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all",
                orderType === type
                  ? "bg-[#131B2E] text-[#00F0FF] border border-[#00F0FF]/30 shadow-sm"
                  : "text-[#849495] hover:text-[#DAE2FD]"
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Quantity & Quick Lot Sizes */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#849495]">
            <span>Position Quantity (Lots)</span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#849495]">Lots</span>
              {[25, 50, 75, 100].map((lots) => (
                <button
                  key={lots}
                  type="button"
                  onClick={() => handleQuickLots(lots)}
                  className="px-1.5 py-0.5 min-w-[32px] rounded bg-white/[0.04] hover:bg-white/[0.1] text-[#00F0FF] font-bold text-[9px] border border-white/[0.06]"
                >
                  {lots}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            min="1"
            max="10000"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-xl bg-[#060E20] border border-white/[0.1] px-3.5 py-2.5 text-sm font-mono text-white focus:border-[#00F0FF] focus:ring-1 focus:ring-[#00F0FF]/50 focus:outline-none min-h-[44px]"
          />
        </div>

        {/* Entry Price */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#849495]">
            <span>Entry Execution Price (IRR)</span>
            {forecast?.entryPrice && (
              <button
                type="button"
                onClick={() => setEntryPrice(forecast.entryPrice)}
                className="text-[9px] text-[#00F0FF] hover:underline flex items-center gap-0.5"
              >
                <Zap className="w-2.5 h-2.5" /> AI Suggestion
              </button>
            )}
          </div>
          <input
            type="number"
            value={entryPrice}
            disabled={orderType === 'MARKET'}
            onChange={(e) => setEntryPrice(Math.max(0, parseFloat(e.target.value) || 0))}
            className={cn(
              "w-full rounded-xl bg-[#060E20] border border-white/[0.1] px-3.5 py-2.5 text-sm font-mono text-white focus:border-[#00F0FF] focus:ring-1 focus:ring-[#00F0FF]/50 focus:outline-none min-h-[44px]",
              orderType === 'MARKET' && "opacity-50 cursor-not-allowed bg-[#0F172A]"
            )}
          />
        </div>

        {/* Stop Loss & Take Profit with Quick Deltas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#EF4444]">
              <span>Stop Loss (SL)</span>
              <div className="flex gap-1">
                {[1, 3, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleQuickSL(d)}
                    className="px-1 py-0.5 min-w-[32px] rounded bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] text-[9px] font-bold"
                  >
                    -{d}%
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full rounded-xl bg-[#060E20] border border-[#EF4444]/30 px-3.5 py-2.5 text-sm font-mono text-[#FCA5A5] focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]/50 focus:outline-none min-h-[44px]"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#10B981]">
              <span>Take Profit (TP)</span>
              <div className="flex gap-1">
                {[2, 5, 10].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleQuickTP(d)}
                    className="px-1 py-0.5 min-w-[32px] rounded bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#10B981] text-[9px] font-bold"
                  >
                    +{d}%
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full rounded-xl bg-[#060E20] border border-[#10B981]/30 px-3.5 py-2.5 text-sm font-mono text-[#6EE7B7] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/50 focus:outline-none min-h-[44px]"
            />
          </div>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-[10px] font-mono font-bold uppercase text-[#849495]">
            <span>Leverage Multiplier</span>
            <span className="text-[#00F0FF]">{leverage}× Leverage</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value, 10) || 1)}
              className="flex-1 accent-[#00F0FF] h-2 bg-[#060E20] rounded-lg cursor-pointer min-h-[32px]"
            />
            <div className="flex gap-1">
              {[1, 2, 5, 10, 20].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLeverage(l)}
                  className={cn(
                    "px-1.5 py-0.5 min-w-[32px] rounded text-[9px] font-mono font-bold transition-colors",
                    leverage === l
                      ? "bg-[#00F0FF] text-[#060E20]"
                      : "bg-white/[0.04] hover:bg-white/[0.1] text-[#849495]"
                  )}
                >
                  {l}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Risk / Reward Metrics Breakdown */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
          <div className="bg-[#060E20] border border-white/[0.06] rounded-2xl p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-[#849495]">Risk Loss</div>
            <div className="font-bold text-[#EF4444] text-xs mt-0.5 truncate">{riskAmount.toLocaleString()} IRR</div>
          </div>
          <div className="bg-[#060E20] border border-white/[0.06] rounded-2xl p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-[#849495]">Target Gain</div>
            <div className="font-bold text-[#10B981] text-xs mt-0.5 truncate">{rewardAmount.toLocaleString()} IRR</div>
          </div>
          <div className="bg-[#060E20] border border-white/[0.06] rounded-2xl p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-[#849495]">R / R Ratio</div>
            <div className="font-bold text-[#00F0FF] text-xs mt-0.5 truncate">1 : {riskRewardRatio}</div>
          </div>
        </div>

        {/* Liquidation & Fees Telemetry */}
        <div className="flex justify-between items-center text-[10px] font-mono text-[#849495] px-1">
          <span>Est. Liq Price: <span className="text-[#F59E0B] font-bold">{estLiquidation ? estLiquidation.toLocaleString() : '—'} IRR</span></span>
          <span>Fees (0.08%): <span className="text-[#DAE2FD]">{estFees.toLocaleString()} IRR</span></span>
        </div>

        {/* Review Order Action Button */}
        <button
          type="submit"
          disabled={riskStatus.isKillSwitchActive || quantity <= 0 || entryPrice <= 0}
          className={cn(
            "w-full py-3.5 rounded-2xl font-mono font-bold text-xs uppercase tracking-widest text-white shadow-xl transition-all flex items-center justify-center gap-2 trade-target min-h-[48px] active:scale-[0.99]",
            riskStatus.isKillSwitchActive || quantity <= 0 || entryPrice <= 0
              ? "bg-[#131B2E] text-[#849495] cursor-not-allowed border border-white/[0.04]"
              : side === 'BUY'
              ? "bg-[#10B981] text-[#060E20] hover:bg-[#34D399] shadow-[0_0_20px_rgba(16,185,129,0.3)] font-black"
              : "bg-[#EF4444] text-white hover:bg-[#F87171] shadow-[0_0_20px_rgba(239,68,68,0.3)] font-black"
          )}
        >
          <span>Transmit {side} Order</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* 2-STEP CONFIRMATION MODAL */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="Confirm Order Transmission"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className={cn(
            "text-2xl font-mono font-black",
            side === 'BUY' ? "text-[#10B981]" : "text-[#EF4444]"
          )}>
            {side} {quantity} × {symbol.name}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[#131B2E] border border-white/[0.08] rounded-2xl p-3">
              <div className="text-[#849495] text-[10px] uppercase">Entry Value</div>
              <div className="font-bold text-white text-sm mt-0.5">{(quantity * entryPrice).toLocaleString()} IRR</div>
            </div>
            <div className="bg-[#131B2E] border border-white/[0.08] rounded-2xl p-3">
              <div className="text-[#849495] text-[10px] uppercase">Max Capital Risk</div>
              <div className="font-bold text-[#EF4444] text-sm mt-0.5">{riskAmount.toLocaleString()} IRR</div>
            </div>
            <div className="bg-[#131B2E] border border-white/[0.08] rounded-2xl p-3">
              <div className="text-[#849495] text-[10px] uppercase">Expected Reward</div>
              <div className="font-bold text-[#10B981] text-sm mt-0.5">{rewardAmount.toLocaleString()} IRR</div>
            </div>
            <div className="bg-[#131B2E] border border-white/[0.08] rounded-2xl p-3">
              <div className="text-[#849495] text-[10px] uppercase">Risk / Reward</div>
              <div className="font-bold text-[#00F0FF] text-sm mt-0.5">1 : {riskRewardRatio}</div>
            </div>
          </div>

          <div className="text-xs text-[#94A3B8] bg-[#060E20] p-3 rounded-2xl border border-white/[0.06] leading-relaxed">
            Order will route through deterministic risk engine with {leverage}× leverage. Stop loss triggers automatically at {stopLoss.toLocaleString()} IRR.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReviewModal(false)}
              className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 font-mono font-bold text-xs text-[#94A3B8] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinalConfirm}
              className={cn(
                "flex-1 py-3 rounded-xl font-mono font-black text-xs uppercase tracking-wider shadow-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]",
                side === 'BUY'
                  ? "bg-[#10B981] text-[#060E20] hover:bg-[#34D399] shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "bg-[#EF4444] text-white hover:bg-[#F87171] shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              )}
            >
              <Check className="w-4 h-4" />
              <span>Confirm Execution</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TradeTicket;

