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
  TrendingDown,
  Radio,
  Terminal
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ExpertForecast, SymbolInfo, SystemMetrics } from '../../types';
import { Badge } from '../common/ui';

export type NavGroup = {
  label: string;
  items: { id: string; label: string; icon: LucideIcon }[];
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
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  forecast: ExpertForecast | null;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  collapsed: boolean;
  setCollapsed: (b: boolean) => void;
  symbols: SymbolInfo[];
  selectedId: string;
  setSelected: (s: string) => void;
  currentPrice?: number;
  priceChange?: number;
  quote?: { price: number; change: number; asOf: number } | null;
  feedMode: 'api' | 'twin';
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onMenu,
  onCmd,
  onNotif,
  connectionState,
  forecast,
  theme,
  setTheme,
  collapsed,
  setCollapsed,
  symbols,
  selectedId,
  setSelected,
  currentPrice = 0,
  priceChange = 0,
  quote = null,
  feedMode,
  onRefresh,
  isLoading
}) => {
  const selectedInstrument = symbols.find(symbol => symbol.id === selectedId);
  const isTwinFeed = feedMode === 'twin';
  const quotePrice = quote?.price ?? 0;
  const quoteLabel = quote && Number.isFinite(quotePrice)
    ? quotePrice >= 1000
      ? quotePrice.toLocaleString()
      : quotePrice.toFixed(2)
    : '—';
  const quoteAsOf = quote
    ? new Date(quote.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const quoteChange = quote?.change ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b bg-[#060E20]/95 backdrop-blur-xl border-white/[0.08]">
      {/* 1. TOP MARKET QUOTE STRIP */}
      <div className="hidden sm:flex h-6 bg-[#0B1326] border-b border-white/[0.06] overflow-hidden items-center text-[10px] font-mono select-none">
        <div className={cn(
          "flex items-center gap-1.5 px-3 bg-[#131B2E] font-bold shrink-0 z-10 border-r border-white/[0.08] h-full",
          isTwinFeed ? "text-[#F59E0B]" : "text-[#00F0FF]"
        )}>
          <Radio className={cn('w-3 h-3', isTwinFeed ? 'text-[#F59E0B]' : 'text-[#00F0FF] animate-pulse')} />
          <span>{isTwinFeed ? 'IME SIMULATION TAPE' : 'IME LIVE TAPE'}</span>
        </div>

        <div className="flex items-center gap-3 px-4 whitespace-nowrap overflow-hidden">
          <span className="text-[#849495] font-bold">{selectedInstrument?.name ?? selectedId}</span>
          <span className="text-white font-bold">{quoteLabel}</span>
          <span className={quoteChange >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>
            {quoteChange >= 0 ? '+' : ''}{quoteChange.toFixed(2)}%
          </span>
          <span className="text-white/20">•</span>
          <span className={cn(connectionState === 'CONNECTED' ? 'text-[#10B981]' : 'text-[#F59E0B]')}>
            WS {connectionState}
          </span>
          {quoteAsOf && <span className="text-[#849495]">as of {quoteAsOf}</span>}
          {!quote && <span className="text-[#849495]">{isLoading ? 'SYNCING…' : 'AWAITING QUOTE'}</span>}
        </div>
      </div>

      {/* 2. MAIN HEADER BAR */}
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
          <div className="w-9 h-9 rounded-2xl bg-[#00F0FF]/15 border border-[#00F0FF]/40 grid place-items-center shadow-[0_0_15px_rgba(0,240,255,0.3)]">
            <ZapIcon className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div>
            <div className="text-sm font-mono font-black tracking-tight leading-none text-white uppercase flex items-center gap-2">
              Intelligences Trader
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30">
                PRO
              </span>
            </div>
            <div className="text-[10px] tracking-[0.14em] font-mono font-bold text-[#849495] uppercase mt-0.5">
              HFT Terminal • Iran Commodity Exchange
            </div>
          </div>
        </div>

        {/* Center: Command Palette & Instrument Selector */}
        <div className="flex-1 flex justify-center px-4 max-w-xl">
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={onCmd}
              aria-label="Open command palette (Cmd+K)"
              className="flex-1 flex items-center justify-between h-10 px-3.5 rounded-xl bg-[#0B1326] border border-white/[0.1] hover:border-[#00F0FF]/40 transition-all text-xs text-[#849495] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#00F0FF]" />
                <span className="font-mono">Quick search symbols, orders, risk…</span>
              </div>
              <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#849495] border border-white/10 rounded-lg px-2 py-0.5 bg-[#060E20]">
                <Command className="w-3 h-3" />K
              </span>
            </button>

            <select
              aria-label="Instrument selector"
              value={selectedId}
              onChange={(e) => setSelected(e.target.value)}
              className="h-10 rounded-xl bg-[#0B1326] border border-white/[0.1] px-3.5 text-xs font-mono font-bold text-white focus:border-[#00F0FF] focus:outline-none min-h-[36px]"
            >
              {symbols.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Status, Theme, Notifications & Profile */}
        <div className="flex items-center gap-2.5">
          <div
            role="status"
            aria-label={`Connection status: ${connectionState}`}
            className="hidden xl:flex items-center gap-2 text-[11px] font-mono bg-[#0B1326] px-3 py-1.5 rounded-xl border border-white/[0.06]">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                connectionState === 'CONNECTED'
                  ? 'bg-[#10B981] animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : connectionState === 'RECONNECTING'
                  ? 'bg-[#F59E0B] animate-pulse'
                  : 'bg-[#EF4444]'
              )}
            />
            <span className="text-[#DAE2FD]">{connectionState}</span>
            <span className="text-white/20">•</span>
            <span className="text-[#00F0FF]">AI {forecast ? forecast.action : 'HOLD'}</span>
          </div>

          <button
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2.5 rounded-xl bg-[#0B1326] border border-white/[0.08] min-h-[40px] min-w-[40px] grid place-items-center text-[#849495] hover:text-white hover:border-white/20 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            aria-label="Notifications"
            onClick={onNotif}
            className="relative p-2.5 rounded-xl bg-[#0B1326] border border-white/[0.08] min-h-[40px] min-w-[40px] grid place-items-center text-[#849495] hover:text-white hover:border-white/20 transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00F0FF] text-[#060E20] text-[9px] font-mono font-black rounded-full grid place-items-center shadow-[0_0_8px_rgba(0,240,255,0.6)]">
              3
            </span>
          </button>

          <div
            aria-label="User profile"
            className="w-9 h-9 rounded-xl bg-[#131B2E] border border-white/[0.1] grid place-items-center text-xs font-mono font-black text-[#00F0FF]"
          >
            AT
          </div>

          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:grid place-items-center w-9 h-9 rounded-xl bg-[#0B1326] border border-white/[0.08] text-[#849495] hover:text-white transition-colors"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", collapsed && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* 3. COMPACT MOBILE HEADER (< 640px) */}
      <div className="sm:hidden flex flex-col divide-y divide-white/[0.06] px-3 py-1 bg-[#060E20]">
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2">
            <button
              aria-label="Open navigation"
              onClick={onMenu}
              className="p-2 rounded-xl bg-white/[0.06] border border-white/10 touch-target grid place-items-center"
            >
              <Menu className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#00F0FF]/20 border border-[#00F0FF]/40 grid place-items-center">
                <ZapIcon className="w-3 h-3 text-[#00F0FF]" />
              </div>
              <span className="text-xs font-mono font-bold tracking-tight text-white">
                Intelligences Trader
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              role="status"
              aria-label={`Connection status: ${connectionState}`}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-bold tracking-wider",
                connectionState === 'CONNECTED' ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]" : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]",
              )}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {connectionState === 'CONNECTED' ? 'STREAM' : 'OFFLINE'}
            </span>
            <button
              aria-label="Notifications"
              onClick={onNotif}
              className="relative p-2 rounded-xl bg-white/[0.06] border border-white/10 touch-target grid place-items-center"
            >
              <Bell className="w-4 h-4 text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00F0FF] text-[#060E20] text-[9px] font-mono font-black rounded-full grid place-items-center">
                3
              </span>
            </button>
          </div>
        </div>

        {/* Row 2: Symbol Selector Dropdown */}
        <div className="py-1">
          <select
            aria-label="Select market asset"
            value={selectedId}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full bg-[#0B1326] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none min-h-[38px]"
          >
            {symbols.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Current Price + Change */}
        <div className="flex items-center justify-between py-1.5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">
              {currentPrice >= 1000 ? currentPrice.toLocaleString() : currentPrice.toFixed(2)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
                priceChange >= 0
                  ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25"
                  : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/25"
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
                aria-label="Refresh market data"
                className="p-1 rounded-lg bg-white/[0.04] border border-white/10 text-[#849495] touch-target grid place-items-center"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              </button>
            )}
            <span className="text-[10px] text-[#00F0FF]">
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
  metrics: SystemMetrics;
}> = ({ activeTab, setActiveTab, collapsed, metrics }) => (
  <aside
    className={cn(
      "hidden lg:flex flex-col border-r bg-[#060E20] border-white/[0.08] sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto transition-all duration-300 z-20",
      collapsed ? "w-[72px]" : "w-[280px]"
    )}
  >
    <nav aria-label="Primary" className="p-3 space-y-4 font-mono">
      {NAV.map((g) => (
        <div key={g.label}>
          {!collapsed && (
            <div className="px-3 mb-2 text-[9px] tracking-wider font-bold text-[#849495] uppercase">
              {g.label}
            </div>
          )}
          <div className="space-y-1">
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
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all border min-h-[40px]",
                    active
                      ? "bg-[#00F0FF]/10 border-[#00F0FF]/30 text-[#00F0FF] font-bold shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                      : "border-transparent text-[#849495] hover:bg-white/[0.04] hover:text-white font-medium"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[#00F0FF]" : "text-[#849495]")} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,1)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>

    {/* Bottom Health Monitor */}
    <div className="mt-auto p-3 border-t border-white/[0.06] font-mono">
      <div
        className={cn(
          "rounded-2xl p-3 border",
          metrics.status === 'OPERATIONAL'
            ? 'bg-[#10B981]/5 border-[#10B981]/25'
            : 'bg-[#F59E0B]/10 border-[#F59E0B]/25'
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              metrics.status === 'OPERATIONAL' ? 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-[#F59E0B]'
            )}
          />
          <span className="text-[10px] font-bold tracking-wider text-white">
            {metrics.status?.replace('_', ' ') || 'SYSTEM OK'}
          </span>
        </div>
        {!collapsed && (
          <div className="text-[9px] text-[#849495] mt-1">
            Ping {metrics.latency}ms • Uptime {metrics.uptime}
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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Drawer"
        className="absolute inset-y-0 left-0 w-[300px] bg-[#060E20] border-r border-white/10 overflow-y-auto p-5 space-y-6 shadow-2xl font-mono"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="font-bold text-sm text-white flex items-center gap-2">
            <ZapIcon className="w-4 h-4 text-[#00F0FF]" />
            Intelligences Trader
          </div>
          <button
            aria-label="Close navigation drawer"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 min-h-[44px] min-w-[44px] grid place-items-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {NAV.map((g) => (
          <div key={g.label} className="space-y-1.5">
            <div className="text-[9px] tracking-wider font-bold text-[#849495] uppercase px-1">
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
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold min-h-[44px] transition-all",
                    activeTab === it.id
                      ? "bg-[#00F0FF]/15 border border-[#00F0FF]/30 text-[#00F0FF]"
                      : "text-[#849495] hover:text-white"
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
    aria-label="Mobile Navigation Bar"
    className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-white/10 bg-[#060E20]/95 backdrop-blur-xl px-2 py-1.5 font-mono"
    style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
  >
    {[
      { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
      { id: 'overview', icon: Globe, label: 'Markets' },
      { id: 'trade', icon: Target, label: 'Trade' },
      { id: 'positions', icon: ShieldCheck, label: 'Portfolio' },
      { id: 'settings', icon: Settings, label: 'Config' },
    ].map((it) => {
      const active =
        activeTab === it.id ||
        (it.id === 'settings' && ['api', 'settings', 'monitoring'].includes(activeTab)) ||
        (it.id === 'positions' && ['positions', 'orders', 'history'].includes(activeTab));
      return (
        <button
          key={it.id}
          onClick={() => setActiveTab(it.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl min-h-[44px] min-w-[44px] transition-all",
            active ? "text-[#00F0FF] font-black scale-105" : "text-[#849495]"
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
  <div className="hidden lg:flex h-6 items-center gap-4 px-4 border-t border-white/[0.06] bg-[#060E20] text-[11px] font-mono text-[#849495]">
    <span className="text-white">IME • {symbolId}</span>
    <span className="w-1 h-1 rounded-full bg-white/20" />
    <span className={cn(connectionState === 'CONNECTED' ? 'text-[#10B981]' : 'text-[#F59E0B]')}>
      WS {connectionState}
    </span>
    <span className="w-1 h-1 rounded-full bg-white/20" />
    <span>GATEWAY {apiConnected ? 'ONLINE' : 'OFFLINE'}</span>
    <span className="ml-auto text-[#849495]">© Intelligences Trader • Cybernetic Quant HFT v3.0</span>
  </div>
);

