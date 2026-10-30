import React, { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ApiConfig } from '../../types';
import { Eye } from 'lucide-react';

interface ApiSettingsPanelProps {
  apiConfig: ApiConfig;
  setApiConfig: Dispatch<SetStateAction<ApiConfig>>;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onLogout: () => void;
  onTestConnection: () => Promise<boolean>;
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({
  apiConfig,
  setApiConfig,
  onLogin,
  onLogout,
  onTestConnection,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  const handleLogin = async () => {
    setAuthPending(true);
    try {
      const authenticated = await onLogin(username.trim(), password);
      if (authenticated) setPassword('');
    } finally {
      setAuthPending(false);
    }
  };

  const handleTestConnection = async () => {
    setConnectionState('testing');
    const verified = await onTestConnection();
    setConnectionState(verified ? 'ok' : 'error');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="text-xs font-black uppercase tracking-widest text-violet-300">
          API Proxy & Integration
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-[#94A3B8]">Market Proxy URL</span>
          <input
            value={apiConfig.proxyUrl}
            onChange={(e) => setApiConfig({ ...apiConfig, proxyUrl: e.target.value })}
            className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 mono text-xs text-white min-h-[44px]"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[#94A3B8]">Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 text-xs text-white min-h-[44px]"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[#94A3B8]">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleLogin();
              }}
              className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 text-xs text-white min-h-[44px]"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void handleLogin()}
            disabled={authPending}
            className="min-h-[44px] rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {authPending ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            onClick={onLogout}
            disabled={!apiConfig.apiKey}
            className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 text-xs font-black text-slate-300 disabled:opacity-40"
          >
            Clear session
          </button>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-[#94A3B8]">Bearer Access Token (advanced/manual)</span>
          <div className="relative">
            <input
              type="password"
              value={apiConfig.apiKey}
              onChange={(e) => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
              placeholder="••••••••••••"
              className="w-full rounded-xl bg-[#101620] border border-white/10 px-3.5 py-2.5 mono text-xs text-white pr-10 min-h-[44px]"
            />
            <Eye className="w-4 h-4 absolute right-3.5 top-3.5 text-[#64748B]" />
          </div>
        </label>
        <label className="flex items-center gap-2.5 text-xs text-slate-300 pt-1">
          <input
            type="checkbox"
            checked={apiConfig.useDigitalTwin}
            onChange={(e) => setApiConfig({ ...apiConfig, useDigitalTwin: e.target.checked })}
            className="min-h-[20px] min-w-[20px] accent-violet-600 rounded"
          />
          <span>Use Digital Twin (Adaptive Simulation fallback)</span>
        </label>
        <button
          onClick={() => void handleTestConnection()}
          disabled={connectionState === 'testing'}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60 text-white font-black text-xs min-h-[44px]"
        >
          {connectionState === 'testing' ? 'Testing Connection…' : connectionState === 'ok' ? 'Connection Verified ✓' : connectionState === 'error' ? 'Retry Connection Test' : 'Save & Test Connection'}
        </button>
      </div>

      <div className="glass-card rounded-3xl p-6 text-xs text-[#94A3B8] space-y-3">
        <div className="font-bold text-white text-sm">Real-time Architecture</div>
        <p>
          Intelligences Trader operates with dual WebSocket & REST data channels. Fallback to high-fidelity digital twins (deterministic simulation) preserves continuous model inference. Paper Trading Engine now uses trade ledger evaluation, not random.
        </p>
      </div>
    </div>
  );
};
