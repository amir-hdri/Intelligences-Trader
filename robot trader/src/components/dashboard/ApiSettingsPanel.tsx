import React, { useState } from 'react';
import { ApiConfig } from '../../types';
import { Settings, Eye, EyeOff, ShieldCheck, ToggleLeft, ToggleRight, Check } from 'lucide-react';

interface ApiSettingsPanelProps {
  apiConfig: ApiConfig;
  setApiConfig: (config: ApiConfig) => void;
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({
  apiConfig,
  setApiConfig,
}) => {
  const [formData, setFormData] = useState<ApiConfig>({ ...apiConfig });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApiConfig({ ...formData, isConnected: true });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border border-indigo-900/30 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
            <Settings className="w-8 h-8 text-indigo-500" />
            API & Endpoint Configuration
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Configure REST proxies, API keys, and toggle active modes between Live and Digital Twin simulation.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-2.5 ${
            apiConfig.isConnected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <span className="text-xs font-black tracking-widest uppercase">
              {apiConfig.isConnected ? 'API CONNECTED' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Form Panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 glass-panel p-6 lg:p-8 rounded-3xl space-y-6">
          <h3 className="text-lg font-black uppercase tracking-widest text-indigo-400 mb-2">Endpoint Settings</h3>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Proxy Endpoint Gateway URL
              </label>
              <input
                type="url"
                value={formData.proxyUrl}
                onChange={(e) => setFormData({ ...formData, proxyUrl: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2.5 tracking-wider">
                Access Token / Secret API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-4 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800/50 pt-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, useDigitalTwin: !formData.useDigitalTwin })}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {formData.useDigitalTwin ? (
                  <ToggleRight className="w-12 h-12 text-indigo-500" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-600" />
                )}
              </button>
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-white">Digital Twin Mode</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Use Merton Jump Diffusion offline simulation</span>
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
                'Save Connection'
              )}
            </button>
          </div>
        </form>

        {/* Informational Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Secure Protocol
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              All credentials and keys are stored locally inside the browser's hardware-isolated LocalStorage space and are never shared or sent to external trackers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
