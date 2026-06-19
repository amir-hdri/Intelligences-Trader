import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  highlightColor?: 'blue-400' | 'emerald-400' | 'rose-400' | 'amber-500' | 'purple-500' | 'indigo-400';
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, trend, highlightColor = 'blue-400' }) => {
  const colorMap = {
    'blue-400': 'text-blue-400 bg-blue-400/10 border-blue-400/20 shadow-blue-400/10',
    'emerald-400': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 shadow-emerald-400/10',
    'rose-400': 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-rose-400/10',
    'amber-500': 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-amber-500/10',
    'purple-500': 'text-purple-500 bg-purple-500/10 border-purple-500/20 shadow-purple-500/10',
    'indigo-400': 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20 shadow-indigo-400/10',
  };

  const selectedColorClass = colorMap[highlightColor] || colorMap['blue-400'];

  return (
    <div className="glass-card p-5 rounded-2xl group relative overflow-hidden transition-all duration-300 hover:border-slate-700/50">
      <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      <div className="relative z-10 flex items-center justify-between mb-4">
        <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{title}</span>
        <div className={`p-2 rounded-xl border transition-all duration-500 group-hover:scale-110 ${selectedColorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="relative z-10 flex items-end justify-between">
        <h3 className="text-3xl font-black text-white tracking-tighter text-glow">{value}</h3>
        {trend && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border shadow-sm transition-all duration-500 ${trend.isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
