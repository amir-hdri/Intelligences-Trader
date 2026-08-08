import React, { useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  Globe,
  BarChart3,
  BrainCircuit,
  Zap,
  Target,
  ShieldCheck,
  History,
  Activity,
  Cpu,
  TrendingUp,
  ShieldAlert,
  Database,
  Search,
  Settings,
  Menu,
  X,
  ChevronDown,
  Bell,
  Sun,
  Moon,
  Command,
  Zap as ZapIcon,
  PieChart,
  RefreshCw,
  TrendingDown
} from 'lucide-react';
import { TimeFrame } from '../../types';

export type NavGroup = {
  label: string;
  items: { id: string; label: string; icon: any }[];
};

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Terminal Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Market Intelligence',
    items: [
      { id: 'intelligence', label: 'Intelligence Hub', icon: Layers },
      { id: 'overview', label: 'Market Overview', icon: Globe },
      { id: 'orderbook', label: 'Order Book Depth', icon: BarChart3 },
      { id: 'correlations', label: 'Cross-Correlations', icon: TrendingUp },
      { id: 'sentiment', label: 'NLP Sentiment', icon: BrainCircuit },
      { id: 'arbitrage', label: 'Arbitrage Scanner', icon: Zap },
    ],
  },
  {
    label: 'Trading',
    items: [
      { id: 'trade', label: 'Trade Execution', icon: Target },
      { id: 'paper', label: 'Paper Trading (P2)', icon: PieChart },
      { id: 'positions', label: 'Open Positions', icon: ShieldCheck },
      { id: 'orders', label: 'Order Ledger', icon: BarChart3 },
      { id: 'history', label: 'Trade History', icon: History },
    ],
  },
  {
    label: 'AI & Models',
    items: [
      { id: 'forecast', label: 'AI Forecast Bands', icon: BrainCircuit },
      { id: 'regime', label: 'Market Regime Timeline', icon: Activity },
      { id: 'models', label: 'ONNX Neural Model', icon: Cpu },
      { id: 'learning', label: 'Online Learning', icon: TrendingUp },
    ],
  },
  {
    label: 'Analytics & Risk',
    items: [
      { id: 'performance', label: 'Performance Analytics', icon: BarChart3 },
      { id: 'risk', label: 'Risk Console & VaR', icon: ShieldAlert },
      { id: 'backtest', label: 'Walk-Forward Backtest', icon: History },
    ],
  },
  {
    label: 'System & Config',
    items: [
      { id: 'monitoring', label: 'System Health', icon: Activity },
      { id: 'api', label: 'API Configuration', icon: Settings },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

interface HeaderProps {
  onMenu: () => void;
  onCmd: () => void;
  onNotif: () => void;
  connectionState: string;
  forecast: any;
  symbolName: string;
  theme: string;
  setTheme: (t: any) => void;
  collapsed: boolean;
  setCollapsed: (b: boolean) => void;
  symbols: any[];
  selectedId: string;
  setSelected: (s: string) => void;
  currentPrice?: number;
  priceChange?: number;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onMenu,
  onCmd,
  onNotif,
  connectionState,
  forecast,
  symbolName,
  theme,
  setTheme,
  collapsed,
  setCollapsed,
  symbols,
  selectedId,
  setSelected,
  currentPrice = 2481.42,
  priceChange = 3.42,
  onRefresh,
  isLoading
}) => {
  const selectedSymbol = symbols.find((s) => s.id === selectedId) || symbols[0];

  return (
    <header className="sticky top-0 z-30 border-b bg-[#080B12]/95 backdrop-blur-xl border-white/[0.07]">
      {/* DESKTOP & TABLET HEADER BAR */}
      <div className="hidden sm:flex h-[56px] items-center justify-between gap-3 px-3 lg:px-6">
        {/* Left: Menu toggle + Logo & Live Indicator */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Open navigation"
            onClick={onMenu}
            className="lg:hidden p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-lg">
            <ZapIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight leading-none text-white">
              Intelligence Trader
            </div>
            <div className="text-[10px] tracking-[0.16em] font-bold text-[#8B5CF6] uppercase">
              IME • AI Terminal
            </div>
          </div>
          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
          </span>
        </div>

        {/* Center: Command Palette & Instrument Selector */}
        <div className="flex-1 flex justify-center px-4 max-w-xl">
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl bg-[#101620] border border-white/[0.07]">
              <Search className="w-4 h-4 text-[#64748B]" />
              <input
                aria-label="Search"
                placeholder="Search symbols, indicators, trades…"
                className="flex-1 bg-transparent outline-none text-xs placeholder:text-[#64748B] text-white"
                onFocus={onCmd}
              />
              <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-bold text-[#64748B] border border-white/10 rounded-lg px-1.5 py-0.5">
                <Command className="w-3 h-3" />K
              </span>
            </div>

            <select
              aria-label="Instrument selector"
              value={selectedId}
              onChange={(e) => setSelected(e.target.value)}
              className="h-9 rounded-xl bg-[#101620] border border-white/[0.07] px-3 text-xs font-bold text-slate-200 min-h-[36px] font-vazir"
            >
              {symbols.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Status, Theme, Notifications & Profile */}
        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono mr-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                connectionState === 'CONNECTED'
                  ? 'bg-emerald-500 animate-pulse'
                  : connectionState === 'RECONNECTING'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500'
              )}
            />
            <span className="text-[#94A3B8]">{connectionState}</span>
            <span className="text-white/20">•</span>
            <span className="text-violet-300">AI {forecast ? 'ACTIVE' : 'IDLE'}</span>
          </div>

          <button
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center text-slate-300 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            aria-label="Notifications"
            onClick={onNotif}
            className="relative p-2 rounded-xl bg-white/[0.06] border border-white/10 min-h-[44px] min-w-[44px] grid place-items-center text-slate-300 hover:text-white"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-black rounded-full grid place-items-center">
              3
            </span>
          </button>

          <div
            aria-label="User profile"
            className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 grid place-items-center text-xs font-black text-white"
          >
            AT
          </div>

          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:grid place-items-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* COMPACT MOBILE HEADER (STRICTLY SATISFYING REQUIREMENT #6) */}
      {/* 
        Structure:
        ┌──────────────────────────────┐
        │ ☰  Intelligence Trader  ●LIVE│
        ├──────────────────────────────┤
        │ XAU/IME          ▼           │
        ├──────────────────────────────┤
        │ $2,481.42       +3.42%       │
        └──────────────────────────────┘
      */}
      <div className="sm:hidden flex flex-col divide-y divide-white/[0.06] px-3 py-1 bg-[#080B12]">
        {/* Row 1: ☰ Intelligence Trader ●LIVE */}
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2">
            <button
              aria-label="Open navigation"
              onClick={onMenu}
              className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 touch-target grid place-items-center"
            >
              <Menu className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-violet-600 grid place-items-center">
                <ZapIcon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-black tracking-tight text-white">
                Intelligence Trader
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
          </span>
        </div>

        {/* Row 2: Symbol Selector Dropdown */}
        <div className="py-1">
          <select
            aria-label="Select market asset"
            value={selectedId}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full bg-[#101620] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-black text-white font-vazir outline-none min-h-[36px]"
          >
            {symbols.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Current Price + Change */}
        <div className="flex items-center justify-between py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black mono text-white">
              {currentPrice >= 1000 ? currentPrice.toLocaleString() : currentPrice.toFixed(2)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black mono",
                priceChange >= 0
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              )}
            >
              {priceChange >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 rounded-lg bg-white/[0.04] border border-white/10 text-[#94A3B8]"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              </button>
            )}
            <span className="text-[10px] mono text-[#64748B]">
              AI: {forecast ? forecast.action : 'HOLD'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export const Sidebar: React.FC<{
  activeTab: string;
  setActiveTab: (s: string) => void;
  collapsed: boolean;
  metrics: any;
}> = ({ activeTab, setActiveTab, collapsed, metrics }) => (
  <aside
    className={cn(
      "hidden lg:flex flex-col border-r bg-[#05070B] border-white/[0.07] sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto transition-all duration-300 z-20",
      collapsed ? "w-[72px]" : "w-[280px]"
    )}
  >
    <nav aria-label="Primary" className="p-3 space-y-4">
      {NAV.map((g) => (
        <div key={g.label}>
          {!collapsed && (
            <div className="px-2 mb-1.5 text-[9px] tracking-[0.16em] font-black text-[#64748B] uppercase">
              {g.label}
            </div>
          )}
          <div className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = activeTab === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => setActiveTab(it.id)}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? it.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs transition border min-h-[38px]",
                    active
                      ? "bg-violet-600/20 border-violet-500/30 text-white font-black"
                      : "border-transparent text-[#94A3B8] hover:bg-white/[0.04] hover:text-white font-medium"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", active ? "text-violet-400" : "text-[#64748B]")} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>

    {/* Bottom Health Monitor */}
    <div className="mt-auto p-3 border-t border-white/[0.06]">
      <div
        className={cn(
          "rounded-2xl p-2.5 border",
          metrics.status === 'OPERATIONAL'
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-amber-500/10 border-amber-500/20'
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              metrics.status === 'OPERATIONAL' ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          <span className="text-[10px] font-black tracking-widest text-white">
            {metrics.status?.replace('_', ' ') || 'SYSTEM OK'}
          </span>
        </div>
        {!collapsed && (
          <div className="text-[9px] text-[#64748B] mt-1 mono">
            Latency {metrics.latency}ms • Uptime {metrics.uptime}
          </div>
        )}
      </div>
    </div>
  </aside>
);

export const MobileDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (s: string) => void;
}> = ({ open, onClose, activeTab, setActiveTab }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 w-[300px] bg-[#0B0F17] border-r border-white/10 overflow-y-auto p-5 space-y-6 shadow-2xl safe-pb"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="font-black text-sm text-white">Intelligence Trader</div>
          <button
            aria-label="Close navigation"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 min-h-[44px] min-w-[44px] grid place-items-center"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {NAV.map((g) => (
          <div key={g.label} className="space-y-1.5">
            <div className="text-[9px] tracking-widest font-black text-[#64748B] uppercase">
              {g.label}
            </div>
            <div className="space-y-1">
              {g.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setActiveTab(it.id);
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold min-h-[44px]",
                    activeTab === it.id ? "bg-violet-600 text-white" : "text-[#94A3B8] hover:text-white"
                  )}
                >
                  <it.icon className="w-4 h-4" />
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const BottomNav: React.FC<{
  activeTab: string;
  setActiveTab: (s: string) => void;
}> = ({ activeTab, setActiveTab }) => (
  <nav
    aria-label="Mobile Navigation"
    className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-white/10 bg-[#0B0F17]/95 backdrop-blur-xl px-2 py-1.5"
    style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
  >
    {[
      { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
      { id: 'overview', icon: Globe, label: 'Markets' },
      { id: 'trade', icon: Target, label: 'Trade' },
      { id: 'positions', icon: ShieldCheck, label: 'Portfolio' },
      { id: 'settings', icon: Settings, label: 'More' },
    ].map((it) => {
      const active =
        activeTab === it.id ||
        (it.id === 'more' && ['api', 'settings', 'monitoring'].includes(activeTab)) ||
        (it.id === 'positions' && ['positions', 'orders', 'history'].includes(activeTab));
      return (
        <button
          key={it.id}
          onClick={() => setActiveTab(it.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl min-h-[44px] min-w-[44px] transition-all",
            active ? "text-violet-400 font-black scale-105" : "text-[#64748B]"
          )}
        >
          <it.icon className="w-5 h-5" />
          <span className="text-[9px] font-bold tracking-tight">{it.label}</span>
        </button>
      );
    })}
  </nav>
);

export const StatusBar: React.FC<{
  symbolId: string;
  connectionState: string;
  apiConnected: boolean;
}> = ({ symbolId, connectionState, apiConnected }) => (
  <div className="hidden lg:flex h-6 items-center gap-4 px-4 border-t border-white/[0.06] bg-[#080B12] text-[11px] font-mono text-[#64748B]">
    <span>IME • {symbolId}</span>
    <span className="w-1 h-1 rounded-full bg-white/20" />
    <span className={cn(connectionState === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400')}>
      WS {connectionState}
    </span>
    <span className="w-1 h-1 rounded-full bg-white/20" />
    <span>API {apiConnected ? 'ONLINE' : 'OFFLINE'}</span>
    <span className="ml-auto">© Intelligence Trader • IME AI Terminal v2.5</span>
  </div>
);
