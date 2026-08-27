import React, { useState } from 'react';
import { RiskLimits, RiskStatus } from '../../types';
import { ShieldAlert, Percent, ShieldCheck, Flame, Scale, ToggleLeft, ToggleRight, Check, Activity, AlertTriangle } from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface RiskControlPanelProps {
  riskLimits: RiskLimits;
  setRiskLimits: (limits: RiskLimits) => void;
  riskStatus: RiskStatus;
}

export const RiskControlPanel: React.FC<RiskControlPanelProps> = ({
  riskLimits,
  setRiskLimits,
  riskStatus,
}) => {
  const [formData, setFormData] = useState<RiskLimits>({ ...riskLimits });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRiskLimits({ ...formData });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Determine current risk level for the Risk Gauge: SAFE (0-40%), WARNING (40-75%), CRITICAL (75-100%)
  const riskRatio = Math.min(1, Math.max(0, riskStatus.currentDailyDrawdown / (riskLimits.maxDailyDrawdown || 1)));
  const riskGaugeLevel = riskStatus.isKillSwitchActive || riskRatio > 0.8 ? 'CRITICAL' : riskRatio > 0.4 ? 'WARNING' : 'SAFE';

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border border-indigo-900/30 rounded-3xl p-5 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-lg lg:text-2xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-indigo-500" />
            Risk & Margin Console
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Real-time margin accounting, exposure guards, Value at Risk (VaR), and emergency circuit breakers.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={cn(
            "px-4 py-2.5 rounded-xl border flex items-center gap-2.5",
            riskStatus.isKillSwitchActive
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          )}>
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              riskStatus.isKillSwitchActive ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
            )} />
            <span className="text-xs font-black tracking-widest uppercase">
              {riskStatus.isKillSwitchActive ? 'KILL SWITCH ACTIVE' : 'LIMITS SECURE'}
            </span>
          </div>
        </div>
      </div>

      {/* 1. PROFESSIONAL RISK GAUGE: SAFE ───── WARNING ───── CRITICAL */}
      <div className="glass-panel p-5 lg:p-6 rounded-3xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#64748B]">Real-Time Risk Gauge</span>
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border",
            riskGaugeLevel === 'SAFE' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
            riskGaugeLevel === 'WARNING' ? "bg-amber-500/10 text-amber-300 border-amber-500/30" :
            "bg-rose-500/10 text-rose-400 border-rose-500/30"
          )}>
            STATUS: {riskGaugeLevel}
          </span>
        </div>

        {/* Gauge Track */}
        <div className="relative pt-4 pb-2">
          <div className="h-3 w-full rounded-full bg-slate-800 flex overflow-hidden">
            <div className="h-full bg-emerald-500 w-1/3 opacity-80" />
            <div className="h-full bg-amber-500 w-1/3 opacity-80" />
            <div className="h-full bg-rose-500 w-1/3 opacity-80" />
          </div>

          {/* Dynamic Pin Indicator */}
          <div
            className="absolute top-1 transform -translate-x-1/2 flex flex-col items-center transition-all duration-500"
            style={{ left: `${Math.min(95, Math.max(5, riskRatio * 100))}%` }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-violet-600 shadow-xl" />
            <span className="text-[9px] font-black mono text-white mt-1 bg-[#101620] px-1 rounded border border-white/10">
              CURRENT
            </span>
          </div>
        </div>

        <div className="flex justify-between text-[10px] mono font-bold uppercase text-[#64748B] pt-1">
          <span className="text-emerald-400">SAFE (0–40%)</span>
          <span className="text-amber-400">WARNING (40–75%)</span>
          <span className="text-rose-400">CRITICAL (75%+)</span>
        </div>
      </div>

      {/* 2. THREE KEY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <div className="glass-panel p-5 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-400 uppercase font-black mb-2 tracking-[0.2em] flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-indigo-400" /> Daily Drawdown
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {riskStatus.currentDailyDrawdown.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
            Limit: {riskLimits.maxDailyDrawdown.toFixed(1)}%
          </div>
        </div>

        <div className="glass-panel p-5 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-400 uppercase font-black mb-2 tracking-[0.2em] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-400" /> Total Drawdown
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {riskStatus.currentTotalDrawdown.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
            Limit: {riskLimits.maxTotalDrawdown.toFixed(1)}%
          </div>
        </div>

        <div className="glass-panel p-5 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-400 uppercase font-black mb-2 tracking-[0.2em] flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-emerald-400" /> Margin Level
          </div>
          <div className={cn("text-3xl font-black font-mono", riskStatus.margin.isCallRisk ? 'text-rose-400' : 'text-emerald-400')}>
            {riskStatus.margin.marginLevel.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
            {riskStatus.margin.isCallRisk ? 'CALL RISK DETECTED' : 'MARGIN HEALTHY'}
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Risk Configuration Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 glass-panel p-5 lg:p-8 rounded-3xl space-y-6">
          <h3 className="text-base lg:text-lg font-black uppercase tracking-widest text-indigo-400">
            Configure Risk Limits & Circuit Breakers
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2 tracking-wider">
                Max Daily Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxDailyDrawdown}
                onChange={(e) => setFormData({ ...formData, maxDailyDrawdown: parseFloat(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2 tracking-wider">
                Max Total Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxTotalDrawdown}
                onChange={(e) => setFormData({ ...formData, maxTotalDrawdown: parseFloat(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2 tracking-wider">
                Max Position Size (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxPositionSize}
                onChange={(e) => setFormData({ ...formData, maxPositionSize: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 outline-none min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2 tracking-wider">
                Max Open Trades
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={formData.maxOpenTrades}
                onChange={(e) => setFormData({ ...formData, maxOpenTrades: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 outline-none min-h-[44px]"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/50 pt-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, stopAllTrading: !formData.stopAllTrading })}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {formData.stopAllTrading ? (
                  <ToggleRight className="w-10 h-10 text-rose-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-600" />
                )}
              </button>
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-white">Emergency Stop</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Instantly Halt All Executions</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 min-h-[44px]"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4" /> Constraints Saved
                </>
              ) : (
                'Save Constraints'
              )}
            </button>
          </div>
        </form>

        {/* Margin Ledger & Active Violations */}
        <div className="space-y-6">
          <div className="glass-panel p-5 lg:p-6 rounded-3xl space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-2.5">
              Margin Ledger (IRR)
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-widest">Used Margin</span>
                <span className="font-mono text-white font-bold">{riskStatus.margin.usedMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-widest">Free Margin</span>
                <span className="font-mono text-emerald-400 font-bold">{riskStatus.margin.freeMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-widest">Maintenance Req.</span>
                <span className="font-mono text-white font-bold">
                  {(riskStatus.margin.maintenanceRequirement <= 1
                    ? riskStatus.margin.maintenanceRequirement * 100
                    : riskStatus.margin.maintenanceRequirement
                  ).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 lg:p-6 rounded-3xl space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-2.5">
              Active Risk Violations
            </h3>
            {riskStatus.violations.length === 0 ? (
              <div className="flex items-center gap-2.5 text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-2xl text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                No active limit violations detected.
              </div>
            ) : (
              <div className="space-y-2">
                {riskStatus.violations.map((violation, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl text-xs font-bold">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{violation}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskControlPanel;
