import React, { useMemo } from 'react';
import { SystemMetrics } from '../../types';
import { Activity, ShieldAlert, ShieldCheck, Cpu, Database, Wifi, Shield, Server, Zap, Radio } from 'lucide-react';
import { Badge } from '../common/ui';

interface SystemHealthMonitorProps {
  metrics: SystemMetrics;
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
}

export const SystemHealthMonitor: React.FC<SystemHealthMonitorProps> = ({
  metrics,
  connectionState,
}) => {
  const logs = useMemo(() => [
    { time: 'INFO', service: 'WebSocket', msg: `Current gateway state: ${connectionState}.` },
    { time: 'INFO', service: 'Telemetry', msg: 'Host CPU and memory telemetry is not exposed to the browser.' },
    { time: 'INFO', service: 'Models', msg: 'Accuracy remains unverified until an out-of-sample evaluation completes.' },
  ], [connectionState]);
  const configuredWorkers = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));

  return (
    <div
      aria-label="Client Runtime Telemetry & Health"
      className="space-y-6 animate-in fade-in duration-300 font-mono"
    >
      {/* 1. Header Banner */}
      <div className="glass-panel border border-white/[0.08] rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF] px-2 py-0.5 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25">
              Client Telemetry
            </span>
            <Badge tone="cyan" dot>
              SYSTEM ACTIVE
            </Badge>
          </div>
          <h2 className="text-lg lg:text-xl font-black text-white uppercase tracking-wider flex items-center gap-3">
            <Activity className="w-6 h-6 text-[#00F0FF]" />
            Client Runtime Telemetry Monitor
          </h2>
          <p className="text-xs text-[#849495] mt-1 max-w-xl font-sans">
            Client-side view of WebSocket connection state, session uptime, worker pool capacity, and model calibration status.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-4 py-2.5 rounded-2xl border flex items-center gap-2.5 ${
            connectionState === 'CONNECTED'
              ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
              : connectionState === 'RECONNECTING'
                ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]'
          }`}>
            <Wifi className="w-4 h-4" />
            <span className="text-xs font-black tracking-wider uppercase">
              {connectionState}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Health Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[9px] text-[#849495] uppercase font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#00F0FF]" /> Session Uptime
          </div>
          <div className="text-2xl font-black text-white font-mono">{metrics.uptime}</div>
          <div className="text-[10px] text-[#849495] mt-1 uppercase">Client session elapsed</div>
        </div>

        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[9px] text-[#849495] uppercase font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[#A855F7]" /> Worker Pool Capacity
          </div>
          <div className="text-2xl font-black text-white font-mono">{configuredWorkers} Max Threads</div>
          <div className="text-[10px] text-[#849495] mt-1 uppercase">Configured browser worker cap</div>
        </div>

        <div className="glass-card p-5 rounded-3xl border border-white/[0.08] relative overflow-hidden">
          <div className="text-[9px] text-[#849495] uppercase font-bold mb-2 tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00F0FF]" /> Model Calibration
          </div>
          <div className="text-2xl font-black text-[#00F0FF] font-mono">
            {metrics.accuracy > 0 ? `${(metrics.accuracy * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-[#849495] mt-1 uppercase">Inference precision</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3. Resource Telemetry Panel */}
        <div className="lg:col-span-2 glass-panel p-6 lg:p-8 rounded-3xl space-y-4 border border-white/[0.08]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-white/[0.06] pb-3">
            Hardware & Worker Allocation
          </h3>
          <div className="space-y-4 text-xs text-[#849495] leading-relaxed font-sans">
            <p>
              Browser client environments operate in sandboxed thread domains. The worker pool offloads multi-timeframe market analysis and walk-forward backtesting, while WebSocket message parsing still runs on the main thread.
            </p>
            <div className="rounded-2xl border border-white/[0.1] bg-[#060E20] p-4 text-[#DAE2FD] text-xs font-mono">
              Telemetry Status: Active Client-Observed Connection
            </div>
          </div>
        </div>

        {/* 4. Event Stream Log */}
        <div className="glass-panel p-6 rounded-3xl space-y-3 flex flex-col h-[280px] border border-white/[0.08]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-white/[0.06] pb-3 flex-shrink-0">
            Telemetry Event Stream
          </h3>
          <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-2">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 p-1.5 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/[0.05]">
                <span className="text-[#849495]">{log.time}</span>
                <span className="text-[#00F0FF] font-bold uppercase">[{log.service}]</span>
                <span className="text-white font-sans">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthMonitor;

