import React from 'react';
import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../common/ui';
import { generateDeterministicSparkline } from '../../utils/deterministic';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export interface MetricCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  delta?: { v: number; pos: boolean };
  accent?: string;
  loading?: boolean;
  tooltip?: string;
  onClick?: () => void;
  tone?: 'cyan' | 'emerald' | 'crimson' | 'amber' | 'purple';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  sub,
  icon: Icon,
  delta,
  accent,
  loading,
  tooltip,
  onClick,
  tone = 'cyan',
}) => {
  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 space-y-3.5 border border-white/[0.07]">
        <div className="flex justify-between items-center">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-5 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-[28px] w-full rounded-md" />
      </div>
    );
  }

  const toneGlows = {
    cyan: "group-hover:border-[#00F0FF]/40 group-hover:shadow-[0_0_20px_rgba(0,240,255,0.12)]",
    emerald: "group-hover:border-[#10B981]/40 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]",
    crimson: "group-hover:border-[#EF4444]/40 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.12)]",
    amber: "group-hover:border-[#F59E0B]/40 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.12)]",
    purple: "group-hover:border-[#8B5CF6]/40 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.12)]"
  };

  const toneIcons = {
    cyan: "text-[#00F0FF] bg-[#00F0FF]/10 border-[#00F0FF]/25",
    emerald: "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/25",
    crimson: "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/25",
    amber: "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/25",
    purple: "text-[#A78BFA] bg-[#8B5CF6]/10 border-[#8B5CF6]/25"
  };

  const sparklineData = generateDeterministicSparkline(title, 20);

  return (
    <div
      role="region"
      aria-label={`${title}: ${value}`}
      tabIndex={0}
      title={tooltip}
      onClick={onClick}
      className={cn(
        "group relative glass-card rounded-2xl p-5 flex flex-col justify-between gap-3.5 transition-all duration-300 border border-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#00F0FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060E20] focus-visible:outline-none",
        toneGlows[tone],
        onClick && "cursor-pointer active:scale-[0.99]"
      )}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono tracking-wider font-bold text-[#849495] uppercase">
          {title}
        </span>
        <div className={cn("p-1.5 rounded-lg border flex items-center justify-center transition-transform group-hover:scale-110", toneIcons[tone])}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </div>
      </div>

      {/* Main Value & Delta */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl sm:text-[26px] font-black tracking-tight font-mono text-white">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "text-xs font-mono font-bold inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border",
              delta.pos
                ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/25"
                : "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/25"
            )}
            aria-label={`Change: ${delta.pos ? '+' : ''}${delta.v.toFixed(1)} percent`}
          >
            {delta.pos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta.v > 0 ? '+' : ''}{delta.v.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Subtitle / Telemetry Details */}
      {sub && (
        <div className="text-[11px] text-[#94A3B8] font-sans flex items-center justify-between">
          <span>{sub}</span>
          {tooltip && <Info className="w-3 h-3 text-[#64748B] ml-1 opacity-60" />}
        </div>
      )}

      {/* Micro Sparkline Visualizer */}
      <div className="h-[24px] flex items-end gap-[3px] opacity-70 pt-1" aria-hidden="true">
        {sparklineData.map((h, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-[1px] transition-all duration-300 group-hover:opacity-100",
              delta?.pos ? "bg-[#10B981]/40 group-hover:bg-[#10B981]" : "bg-[#00F0FF]/30 group-hover:bg-[#00F0FF]"
            )}
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
};

