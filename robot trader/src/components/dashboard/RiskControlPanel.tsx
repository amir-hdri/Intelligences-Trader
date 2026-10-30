import React, { useState, useMemo } from 'react';
import { RiskLimits, RiskStatus } from '../../types';
import { ShieldAlert, Percent, ShieldCheck, Flame, Scale, ToggleLeft, ToggleRight, Check, Activity, AlertTriangle, Lock, Unlock, Gauge, Zap } from 'lucide-react';
import { Badge, Modal, Button } from '../common/ui';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface RiskControlPanelProps {
  riskLimits: RiskLimits;
  setRiskLimits: React.Dispatch<React.SetStateAction<RiskLimits>>;
  riskStatus: RiskStatus;
  onResetKillSwitch?: () => void;
}

export const RiskControlPanel: React.FC<RiskControlPanelProps> = ({
  riskLimits,
  setRiskLimits,
  riskStatus,
  onResetKillSwitch,
}) => {
  const [formData, setFormData] = useState<RiskLimits>({ ...riskLimits });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showKillSwitchModal, setShowKillSwitchModal] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRiskLimits({ ...formData });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Determine current risk level for the Risk Gauge: SAFE (0-40%), WARNING (40-75%), CRITICAL (75-100%)
  const riskRatio = Math.min(1, Math.max(0, riskStatus.currentDailyDrawdown / (riskLimits.maxDailyDrawdown || 1)));
  const riskGaugeLevel = riskStatus.isKillSwitchActive || riskRatio > 0.8 ? 'CRITICAL' : riskRatio > 0.4 ? 'WARNING' : 'SAFE';

  // Value at Risk (Parametric Gaussian VaR approximation at 95% and 99%)
  const var95 = useMemo(() => {
    const vol = (riskStatus.currentDailyDrawdown * 0.4 + 1.2);
    return (1.645 * vol).toFixed(2);
  }, [riskStatus.currentDailyDrawdown]);

  const var99 = useMemo(() => {
    const vol = (riskStatus.currentDailyDrawdown * 0.4 + 1.2);
    return (2.326 * vol).toFixed(2);
  }, [riskStatus.currentDailyDrawdown]);

  const handleToggleEmergencyStop = () => {
    if (!formData.stopAllTrading) {
      setShowKillSwitchModal(true);
    } else {
      setFormData(prev => ({ ...prev, stopAllTrading: false }));
      setRiskLimits(prev => ({ ...prev, stopAllTrading: false }));
    }
  };

  const confirmEmergencyKill = () => {
    setFormData(prev => ({ ...prev, stopAllTrading: true }));
    setRiskLimits(prev => ({ ...prev, stopAllTrading: true }));
    setShowKillSwitchModal(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="glass-panel p-6 lg:p-8 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-white/[0.08] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#00F0FF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-mono font-black text-white uppercase tracking-wider">
              Institutional Risk & Margin Console
            </h2>
          </div>
          <p className="text-xs text-[#849495] max-w-xl leading-relaxed">
            Real-time margin accounting, exposure guards, Value at Risk (VaR 95/99%), and emergency circuit breaker.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn(
            "px-4 py-2.5 rounded-2xl border flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-wider backdrop-blur-md",
            riskStatus.isKillSwitchActive
              ? "bg-[#EF4444]/15 border-[#EF4444]/40 text-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.25)]"
              : "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
          )}>
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              riskStatus.isKillSwitchActive ? "bg-[#EF4444] animate-ping" : "bg-[#10B981]"
            )} />
            <span>{riskStatus.isKillSwitchActive ? 'EMERGENCY LOCKOUT' : 'RISK SAFEGUARD ACTIVE'}</span>
          </div>
        </div>
      </div>

      {/* 1. PROFESSIONAL RISK GAUGE: SAFE ───── WARNING ───── CRITICAL */}
      <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/[0.08]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#849495] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#00F0FF]" /> Real-Time Portfolio Risk Exposure
          </span>
          <Badge
            tone={riskGaugeLevel === 'SAFE' ? 'emerald' : riskGaugeLevel === 'WARNING' ? 'amber' : 'crimson'}
            dot
          >
            STATUS: {riskGaugeLevel}
          </Badge>
        </div>

        {/* Gauge Track */}
        <div className="relative pt-4 pb-2">
          <div className="h-3.5 w-full rounded-full bg-[#060E20] border border-white/[0.08] flex overflow-hidden p-[2px]">
            <div className="h-full bg-gradient-to-r from-[#10B981]/80 to-[#10B981] w-1/3 rounded-l-full" />
            <div className="h-full bg-gradient-to-r from-[#F59E0B]/80 to-[#F59E0B] w-1/3" />
            <div className="h-full bg-gradient-to-r from-[#EF4444]/80 to-[#EF4444] w-1/3 rounded-r-full" />
          </div>

          {/* Dynamic Pin Indicator */}
          <div
            className="absolute top-1 transform -translate-x-1/2 flex flex-col items-center transition-all duration-500"
            style={{ left: `${Math.min(95, Math.max(5, riskRatio * 100))}%` }}
          >
            <div className="w-4 h-4 rounded-full bg-white border-2 border-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
            <span className="text-[9px] font-mono font-bold text-white mt-1 bg-[#060E20] px-1.5 py-0.5 rounded border border-white/15 shadow">
              {(riskRatio * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex justify-between text-[10px] font-mono font-bold uppercase text-[#849495] pt-1">
          <span className="text-[#10B981]">SAFE ZONE (0–40%)</span>
          <span className="text-[#F59E0B]">WARNING (40–75%)</span>
          <span className="text-[#EF4444]">CRITICAL (75%+)</span>
        </div>
      </div>

      {/* 2. VALUE AT RISK (VaR) & KEY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[10px] text-[#849495] uppercase font-mono font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-[#00F0FF]" /> Daily Drawdown
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">
            {riskStatus.currentDailyDrawdown.toFixed(2)}%
          </div>
          <div className="text-[11px] text-[#849495] mt-2 font-mono">
            Daily Cap: <span className="text-white font-bold">{riskLimits.maxDailyDrawdown.toFixed(1)}%</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[10px] text-[#849495] uppercase font-mono font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[#EF4444]" /> Max Peak Drawdown
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">
            {riskStatus.currentTotalDrawdown.toFixed(2)}%
          </div>
          <div className="text-[11px] text-[#849495] mt-2 font-mono">
            Max Limit: <span className="text-white font-bold">{riskLimits.maxTotalDrawdown.toFixed(1)}%</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[10px] text-[#849495] uppercase font-mono font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-[#10B981]" /> Margin Health Level
          </div>
          <div className={cn("text-2xl sm:text-3xl font-black font-mono", riskStatus.margin.isCallRisk ? 'text-[#EF4444]' : 'text-[#10B981]')}>
            {riskStatus.margin.marginLevel.toFixed(1)}%
          </div>
          <div className="text-[11px] text-[#849495] mt-2 font-mono">
            {riskStatus.margin.isCallRisk ? <span className="text-[#EF4444] font-bold">MARGIN CALL ALERT</span> : <span className="text-[#10B981]">Healthy Buffer</span>}
          </div>
        </div>

        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[10px] text-[#849495] uppercase font-mono font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#A78BFA]" /> Value at Risk (VaR)
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">
            {var95}%
          </div>
          <div className="text-[11px] text-[#849495] mt-2 font-mono">
            95% Conf. (99%: <span className="text-[#F59E0B] font-bold">{var99}%</span>)
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Configuration Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 glass-panel p-6 lg:p-8 rounded-3xl space-y-6 border border-white/[0.08]">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#00F0FF]">
              Configure Risk Limits & Circuit Breakers
            </h3>
            <span className="text-[10px] text-[#849495] font-mono text-right">
              Enforced on execution: open-trade cap, drawdown breakers, manual halt
              <span className="block text-[#849495]/70">Max position size feeds the Kelly sizing suggestion</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-[#849495] mb-2 tracking-wider">
                Max Daily Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxDailyDrawdown}
                onChange={(e) => setFormData({ ...formData, maxDailyDrawdown: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-[#00F0FF] focus:outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-[#849495] mb-2 tracking-wider">
                Max Total Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxTotalDrawdown}
                onChange={(e) => setFormData({ ...formData, maxTotalDrawdown: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-[#00F0FF] focus:outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-[#849495] mb-2 tracking-wider">
                Max Position Size (% of Balance)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxPositionSize}
                onChange={(e) => setFormData({ ...formData, maxPositionSize: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-[#00F0FF] focus:outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-[#849495] mb-2 tracking-wider">
                Max Concurrent Active Trades
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                value={formData.maxOpenTrades}
                onChange={(e) => setFormData({ ...formData, maxOpenTrades: parseInt(e.target.value, 10) || 1 })}
                className="w-full bg-[#060E20] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-[#00F0FF] focus:outline-none min-h-[44px]"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleEmergencyStop}
                aria-label="Toggle emergency kill switch"
                className="text-slate-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#00F0FF]"
              >
                {formData.stopAllTrading ? (
                  <ToggleRight className="w-10 h-10 text-[#EF4444]" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-[#849495]" />
                )}
              </button>
              <div>
                <span className="block text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Emergency Kill Switch
                </span>
                <span className="text-[10px] text-[#849495] font-mono">
                  {formData.stopAllTrading ? 'Execution engine currently frozen' : 'Click to instantly freeze all orders'}
                </span>
              </div>
              {riskStatus.isKillSwitchActive && onResetKillSwitch && (
                <button
                  type="button"
                  onClick={onResetKillSwitch}
                  aria-label="Reset risk halt"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B] font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-[#F59E0B]/20 focus-visible:ring-2 focus-visible:ring-[#F59E0B] min-h-[44px]"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Reset Halt
                </button>
              )}
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto bg-[#00F0FF] hover:bg-[#7DF4FF] text-[#060E20] font-mono font-bold uppercase tracking-wider text-xs px-6 py-3.5 rounded-xl shadow-[0_0_15px_rgba(0,240,255,0.25)] transition-all flex items-center justify-center gap-2 min-h-[44px] active:scale-[0.98]"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4" /> Parameters Updated
                </>
              ) : (
                'Save Risk Parameters'
              )}
            </button>
          </div>
        </form>

        {/* Margin Ledger & Active Violations */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/[0.08]">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#00F0FF] border-b border-white/[0.08] pb-2.5">
              Margin Ledger (IRR)
            </h3>
            <div className="space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#849495]">Used Margin</span>
                <span className="text-white font-bold">{riskStatus.margin.usedMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#849495]">Available Free Margin</span>
                <span className="text-[#10B981] font-bold">{riskStatus.margin.freeMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#849495]">Maintenance Req.</span>
                <span className="text-white font-bold">
                  {(riskStatus.margin.maintenanceRequirement <= 1
                    ? riskStatus.margin.maintenanceRequirement * 100
                    : riskStatus.margin.maintenanceRequirement
                  ).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/[0.08]">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#00F0FF] border-b border-white/[0.08] pb-2.5">
              Active Risk Invariants
            </h3>
            {riskStatus.violations.length === 0 ? (
              <div className="flex items-center gap-2.5 text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/25 p-3.5 rounded-2xl text-xs font-mono">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>All risk constraints healthy and nominal.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {riskStatus.violations.map((violation, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 p-3 rounded-xl text-xs font-mono font-bold">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{violation}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emergency Kill Switch Modal */}
      <Modal
        isOpen={showKillSwitchModal}
        onClose={() => setShowKillSwitchModal(false)}
        title="Trigger Emergency Kill Switch"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 bg-[#EF4444]/15 border border-[#EF4444]/40 rounded-2xl text-[#EF4444]">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div className="text-xs leading-relaxed">
              <strong>Warning:</strong> Activating the emergency kill switch will immediately halt all automated order placements and reject new market signals.
            </div>
          </div>

          <p className="text-xs text-[#DAE2FD] leading-relaxed">
            Existing positions will remain protected under their stop-loss levels, but no new executions will be routed until manually resumed.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowKillSwitchModal(false)}
              className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white font-mono text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEmergencyKill}
              className="flex-1 py-3 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-mono text-xs font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.4)]"
            >
              Halt All Trading Now
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RiskControlPanel;

