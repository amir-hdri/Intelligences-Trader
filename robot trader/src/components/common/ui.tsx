import React from 'react';
const cn=(...c:(string|false|undefined)[])=>c.filter(Boolean).join(' ');

export const Skeleton:React.FC<{className?:string}> = ({className}) => <div className={cn("rounded-xl shimmer bg-white/[0.06] animate-pulse",className)} style={{backgroundSize:'400% 100%'}} />;

export const Card:React.FC<React.PropsWithChildren<{className?:string; elevated?:boolean}>> = ({children,className,elevated}) => <div className={cn(elevated?"elevated":"glass-card","rounded-2xl",className)}>{children}</div>;

type BadgeTone = 'violet'|'emerald'|'red'|'amber'|'slate';
export const Badge:React.FC<{tone?:BadgeTone; children:React.ReactNode}> = ({tone='slate',children}) => {
  const map:Record<BadgeTone,string>={violet:"bg-blue-500/10 text-blue-300 border-blue-500/20",emerald:"bg-emerald-500/10 text-emerald-400 border-emerald-500/20",red:"bg-red-500/10 text-red-400 border-red-500/20",amber:"bg-amber-500/10 text-amber-300 border-amber-500/20",slate:"bg-white/5 text-[#94A3B8] border-white/10"};
  return <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-[11px] font-black tracking-wider border uppercase",map[tone])}>{children}</span>
};
export const Button:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'ghost'|'danger'}> = ({variant='ghost',className,...p})=>{
  const v=variant==='primary'?"bg-blue-600 hover:bg-blue-500 text-white border-blue-500":variant==='danger'?"bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20":"bg-white/[0.06] hover:bg-white/10 border-white/10 text-white";
  return <button {...p} className={cn("inline-flex min-h-[44px] items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition disabled:opacity-40",v,className)} />
};
export const StatusDot:React.FC<{state:'ok'|'warn'|'bad'|'live'}> = ({state})=>{
  const c=state==='ok'?"bg-emerald-500":state==='warn'?"bg-amber-500":state==='bad'?"bg-red-500":"bg-emerald-500 animate-pulse";
  return <span className={cn("w-2 h-2 rounded-full inline-block",c)} />
};
export const Gauge:React.FC<{value:number; label:string}> = ({value,label})=>{
  const pct=Math.max(0,Math.min(100,value));
  return <div className="space-y-2"><div className="flex justify-between text-[11px] tracking-wider font-black uppercase text-[#64748B]"><span>{label}</span><span className="text-white mono">{pct.toFixed(1)}%</span></div><div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{width:`${pct}%`}}/></div></div>
};
export const Empty:React.FC<{title:string; desc:string; action?:React.ReactNode}> = ({title,desc,action})=> <div className="text-center py-12 px-6"><div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 border border-white/10 grid place-items-center mb-3">◌</div><div className="text-sm font-black tracking-tight">{title}</div><div className="text-xs text-[#64748B] mt-1 max-w-[32ch] mx-auto">{desc}</div>{action&&<div className="mt-4">{action}</div>}</div>;
type AlertTone = 'amber'|'red'|'violet';
export const Alert:React.FC<{tone?:AlertTone; children:React.ReactNode}> = ({tone='amber',children})=>{
  const m:Record<AlertTone,string>={amber:"bg-amber-500/10 border-amber-500/20 text-amber-300",red:"bg-red-500/10 border-red-500/20 text-red-300",violet:"bg-blue-500/10 border-blue-500/20 text-blue-300"};
  return <div className={cn("rounded-xl border p-3 text-xs flex gap-2",m[tone])}>{children}</div>
};
