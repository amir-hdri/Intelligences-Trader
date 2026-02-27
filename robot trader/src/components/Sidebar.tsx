import React from 'react';
import { LayoutDashboard, Database, BrainCircuit, Settings, Activity, ShieldAlert, History, Zap, Layers, TrendingUp } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  status: 'OPERATIONAL' | 'WARNING' | 'CRITICAL' | 'KILL_SWITCH_ACTIVE';
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, status }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'intelligence', label: 'Intelligence', icon: Layers },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'data', label: 'Market Data', icon: Database },
    { id: 'strategy', label: 'Strategy Lab', icon: BrainCircuit },
    { id: 'risk', label: 'Risk Control', icon: ShieldAlert },
    { id: 'logs', label: 'Trade Logs', icon: History },
    { id: 'monitoring', label: 'System Health', icon: Activity },
    { id: 'settings', label: 'API Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 h-screen border-r border-slate-800 flex flex-col">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-lg">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">KalayBot AI</h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-1 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                isActive 
                ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className={`rounded-xl p-4 ${
          status === 'OPERATIONAL' ? 'bg-emerald-500/5' : 
          status === 'KILL_SWITCH_ACTIVE' ? 'bg-rose-500/10' : 'bg-amber-500/10'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              status === 'OPERATIONAL' ? 'bg-emerald-500' : 
              status === 'KILL_SWITCH_ACTIVE' ? 'bg-rose-500' : 'bg-amber-500'
            }`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              status === 'OPERATIONAL' ? 'text-emerald-500' : 
              status === 'KILL_SWITCH_ACTIVE' ? 'text-rose-500' : 'text-amber-500'
            }`}>{status.replace('_', ' ')}</span>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Secure Connection v2.5.0</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
