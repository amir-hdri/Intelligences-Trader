import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../common/ui';
import { generateDeterministicSparkline } from '../../utils/deterministic';
const cn=(...c:(string|false|undefined)[])=>c.filter(Boolean).join(' ');
export const MetricCard:React.FC<{title:string;value:string;sub?:string;icon:LucideIcon;delta?:{v:number;pos:boolean};accent?:string;loading?:boolean; tooltip?:string}> = ({title,value,sub,icon:Icon,delta,accent,loading,tooltip})=>{
 if(loading) return <div className="glass-card rounded-2xl p-4 space-y-3"><Skeleton className="h-3 w-24"/><Skeleton className="h-7 w-32"/><Skeleton className="h-[28px] w-full"/></div>
 return <div title={tooltip} tabIndex={0} className="glass-card rounded-2xl p-4 flex flex-col gap-3 hover:border-white/10 transition-colors focus-within:ring-2 focus-within:ring-violet-500/30">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.16em] font-bold text-[#64748B] uppercase">{title}</span><Icon className={cn("w-4 h-4",accent||"text-[#94A3B8]")} /></div>
  <div className="flex items-baseline gap-2"><span className="text-[22px] font-black tracking-tighter mono text-white">{value}</span>{delta&&<span className={cn("text-xs font-bold inline-flex items-center gap-1",delta.pos?"text-[#22C55E]":"text-[#EF4444]")} aria-label={delta.pos?"positive":"negative"}>{delta.pos?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}{delta.v>0?'+':''}{delta.v.toFixed(1)}%</span>}</div>
  {sub&&<div className="text-[11px] text-[#64748B]">{sub}</div>}
  <div className="h-[28px] flex items-end gap-[2px] opacity-60" aria-hidden>{generateDeterministicSparkline(title,18).map((h,i)=><div key={i} className="flex-1 rounded-sm bg-white/10" style={{height: h}} />)}</div>
 </div>
};
