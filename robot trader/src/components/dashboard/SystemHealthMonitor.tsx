import React, { useMemo } from 'react';
import { SystemMetrics } from '../../types';
import { Activity, ShieldAlert, ShieldCheck, Cpu, Database, HardDrive, Wifi, Shield } from 'lucide-react';

interface SystemHealthMonitorProps {
  metrics: SystemMetrics;
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
}

export const SystemHealthMonitor: React.FC<SystemHealthMonitorProps> = ({
  metrics,
  connectionState,
}) => {

  const logs = useMemo(() => [
    { time: '13:08:21', service: 'TseProxy', msg: 'Real-time WebSocket handshake completed successfully.' },
    { time: '13:08:18', service: 'AiBackend', msg: 'ONNX runtime session initialized. Thread pool allocated: 4.' },
    { time: '13:08:15', service: 'WebWorker', msg: 'SharedArrayBuffer allocated. Concurrency checks active.' },
    { time: '13:08:10', service: 'System', msg: 'FedAvg client updates loaded. Momentum multiplier set to 0.95.' }
  ], []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border border-indigo-900/30 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-500" />
            System Health Monitor
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Real-time analytics for Node workers, memory pools, network latency, and ONNX engine integrity.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-2.5 ${
            connectionState === 'CONNECTED'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : connectionState === 'CONNECTING'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <Wifi className="w-4 h-4" />
            <span className="text-xs font-black tracking-widest uppercase">
              {connectionState}
            </span>
          </div>
        </div>
      </div>

      {/* Health Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> API Uptime
          </div>
          <div className="text-3xl font-black text-white font-mono">{metrics.uptime}</div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">Continuous runtime</div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-sky-400" /> Node Latency
          </div>
          <div className="text-3xl font-black text-white font-mono">{metrics.latency} ms</div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">Network roundtrip</div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-purple-400" /> Worker Thread Pool
          </div>
          <div className="text-3xl font-black text-white font-mono">4 / 4 Active</div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">Background processes</div>
        </div>

        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
          <div className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-[0.2em] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" /> ONNX Target Accuracy
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">
            {(metrics.accuracy * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-2 uppercase font-bold">Inference calibration</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Memory Pools & CPU Load */}
        <div className="lg:col-span-2 glass-panel p-6 lg:p-8 rounded-3xl space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-3">Resources Allocation</h3>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                <span>SharedArrayBuffer Utilization</span>
                <span className="font-mono text-white">41.2%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: '41.2%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                <span>Background Worker Load</span>
                <span className="font-mono text-white">18.5%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: '18.5%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                <span>Memory Pool Allocation</span>
                <span className="font-mono text-white">256MB / 512MB</span>
              </div>
              <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: '50%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Distributed Tracer Log */}
        <div className="glass-panel p-6 rounded-3xl space-y-4 flex flex-col h-[280px]">
          <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 border-b border-slate-800/50 pb-3 flex-shrink-0">
            System Event Log
          </h3>
          <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-2.5 scrollbar-thin">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 hover:bg-white/[0.02] p-1.5 rounded transition-colors">
                <span className="text-slate-500">{log.time}</span>
                <span className="text-indigo-400 font-bold uppercase tracking-wide">[{log.service}]</span>
                <span className="text-slate-300 font-sans">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
