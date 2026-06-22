import React, { useState } from 'react';
import { RiskLimits, RiskStatus } from '../../types';
import { ShieldAlert, Percent, ShieldCheck, Flame, Scale, ToggleLeft, ToggleRight, Check } from 'lucide-react';

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border border-indigo-900/30 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-indigo-500" />
            Risk Management Console
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Real-time margin accounting, leverage controls, and hardware-enforced emergency circuit breakers.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-2.5 ${
            riskStatus.isKillSwitchActive 
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${
              riskStatus.isKillSwitchActive ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
            }`} />
            <span className="text-xs font-black tracking-widest uppercase">
              {riskStatus.isKillSwitchActive ? 'KILL SWITCH ACTIVE' : 'LIMITS SECURE'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-indigo-400" /> Daily Drawdown
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {(riskStatus.currentDailyDrawdown * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
            Limit: {(riskLimits.maxDailyDrawdown * 100).toFixed(1)}%
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-400" /> Total Drawdown
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {(riskStatus.currentTotalDrawdown * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
            Limit: {(riskLimits.maxTotalDrawdown * 100).toFixed(1)}%
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-emerald-400" /> Margin Level
          </div>
          <div className={`text-3xl font-black font-mono ${
            riskStatus.margin.isCallRisk ? 'text-rose-400' : 'text-emerald-400'
          }`}>
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
        <form onSubmit={handleSubmit} className="lg:col-span-2 glass-panel p-6 lg:p-8 rounded-3xl space-y-6">
          <h3 className="text-lg font-black uppercase tracking-widest text-indigo-400 mb-2">Configure Risk Limits</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Max Daily Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxDailyDrawdown * 100}
                onChange={(e) => setFormData({ ...formData, maxDailyDrawdown: parseFloat(e.target.value) / 100 })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Max Total Drawdown (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={formData.maxTotalDrawdown * 100}
                onChange={(e) => setFormData({ ...formData, maxTotalDrawdown: parseFloat(e.target.value) / 100 })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Max Position Size (Units)
              </label>
              <input
                type="number"
                step="1"
                min="1000"
                value={formData.maxPositionSize}
                onChange={(e) => setFormData({ ...formData, maxPositionSize: parseInt(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Max Open Trades
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={formData.maxOpenTrades}
                onChange={(e) => setFormData({ ...formData, maxOpenTrades: parseInt(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800/50 pt-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, stopAllTrading: !formData.stopAllTrading })}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {formData.stopAllTrading ? (
                  <ToggleRight className="w-12 h-12 text-rose-500" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-600" />
                )}
              </button>
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-white">Emergency Stop</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Instantly Halt All Executions</span>
              </div>
            </div>

            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-xl shadow-lg shadow-indigo-500/10 active:scale-95 transition-all flex items-center gap-2"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4" /> Save Successful
                </>
              ) : (
                'Save Constraints'
              )}
            </button>
          </div>
        </form>

        {/* Violations and Margin Details */}
        <div className="space-y-6">
          {/* Margin Audit */}
          <div className="glass-panel p-6 rounded-3xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-3">Margin Ledger</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-widest">Used Margin</span>
                <span className="font-mono text-white font-bold">{riskStatus.margin.usedMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-widest">Free Margin</span>
                <span className="font-mono text-emerald-400 font-bold">{riskStatus.margin.freeMargin.toLocaleString()} IRR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-widest">Maintenance Req.</span>
                <span className="font-mono text-white font-bold">{riskStatus.margin.maintenanceRequirement.toLocaleString()} IRR</span>
              </div>
            </div>
          </div>

          {/* Active Violations List */}
          <div className="glass-panel p-6 rounded-3xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-3">Active Violations</h3>
            {riskStatus.violations.length === 0 ? (
              <div className="flex items-center gap-3 text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl text-xs font-semibold">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                No active limit violations detected.
              </div>
            ) : (
              <div className="space-y-3">
                {riskStatus.violations.map((violation, i) => (
                  <div key={i} className="flex items-start gap-3 text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl text-xs font-bold">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
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
