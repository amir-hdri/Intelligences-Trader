import React from 'react';
import { LayoutDashboard, Database, BrainCircuit, Settings, Activity, ShieldAlert, History, Zap, Layers, TrendingUp, X } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  status: 'OPERATIONAL' | 'WARNING' | 'CRITICAL' | 'KILL_SWITCH_ACTIVE';
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, status, isOpen, setIsOpen }) => {
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
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar Container */}
      <div className={`fixed lg:static inset-y-0 left-0 w-72 glass-panel lg:border-r border-slate-800/50 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">KalayBot</h1>
              <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">AI Engine v2.5</span>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 mb-4">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (window.innerWidth < 1024) setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                  ? 'bg-gradient-to-r from-indigo-600/20 to-purple-600/5 text-white border border-indigo-500/20 shadow-lg shadow-indigo-500/10' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'text-indigo-400 scale-110' : 'group-hover:scale-110'}`} />
                <span className={`font-semibold tracking-wide text-sm ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]" />}
              </button>
            );
          })}
        </nav>

        <div className="p-6 mt-auto">
          <div className={`rounded-2xl p-4 border relative overflow-hidden group ${
            status === 'OPERATIONAL' ? 'bg-emerald-500/5 border-emerald-500/20' : 
            status === 'KILL_SWITCH_ACTIVE' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-tr ${
              status === 'OPERATIONAL' ? 'from-emerald-500 to-transparent' : 
              status === 'KILL_SWITCH_ACTIVE' ? 'from-rose-500 to-transparent' : 'from-amber-500 to-transparent'
            }`} />
            <div className="relative z-10 flex items-center gap-3 mb-2">
              <div className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  status === 'OPERATIONAL' ? 'bg-emerald-400' : 
                  status === 'KILL_SWITCH_ACTIVE' ? 'bg-rose-400' : 'bg-amber-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  status === 'OPERATIONAL' ? 'bg-emerald-500' : 
                  status === 'KILL_SWITCH_ACTIVE' ? 'bg-rose-500' : 'bg-amber-500'
                }`}></span>
              </div>
              <span className={`text-xs font-black uppercase tracking-widest ${
                status === 'OPERATIONAL' ? 'text-emerald-400 text-glow' : 
                status === 'KILL_SWITCH_ACTIVE' ? 'text-rose-400 text-glow' : 'text-amber-400'
              }`}>{status.replace('_', ' ')}</span>
            </div>
            <p className="relative z-10 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Secure Connection Active</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
