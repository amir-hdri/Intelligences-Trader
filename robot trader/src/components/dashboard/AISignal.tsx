import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
const cn=(...c:(string|false|undefined)[])=>c.filter(Boolean).join(' ');
export const AISignal:React.FC<{forecast:any; compact?:boolean}> = ({forecast,compact})=>{
 if(!forecast) return <div className="glass-card rounded-2xl p-8 text-center text-sm text-[#64748B]" role="status">No AI signal — loading market analysis…</div>;
 const isBuy=forecast.action==='BUY', isSell=forecast.action==='SELL';
 const color=isBuy?'text-[#22C55E]':isSell?'text-[#EF4444]':'text-[#94A3B8]';
 const badge=isBuy?'BUY':isSell?'SELL':'HOLD';
 return <section aria-label="AI market signal" className="glass-card rounded-2xl p-5 space-y-4">
  <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.18em] font-black text-[#8B5CF6] uppercase">AI Market Signal</span><span className="text-[10px] font-mono text-[#64748B]">{new Date().toLocaleTimeString()}</span><span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300">EST. PROBABILITY</span></div>
  <div className={cn("text-3xl font-black tracking-tighter flex items-center gap-2",color)}>{badge} {isBuy?<TrendingUp className="w-6 h-6"/>:isSell?<TrendingDown className="w-6 h-6"/>:null} <span className="text-xs font-mono text-white/60 border border-white/10 rounded-full px-2 py-1">Model Confidence {(forecast.confidence*100).toFixed(1)}%</span></div>
  <div className="grid grid-cols-2 gap-3 text-xs">
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Confidence</div><div className="text-white font-black text-lg mono">{(forecast.confidence*100).toFixed(1)}%</div><div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden"><div className="h-full bg-[#8B5CF6] rounded-full transition-all" style={{width:`${forecast.confidence*100}%`}}/></div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Market Regime</div><div className="text-white font-bold text-xs mt-1">{forecast.regime.replace('_',' ')}</div><div className="text-[#64748B] text-[11px] mt-1">Exp. {(forecast.bubbleGap? (forecast.bubbleGap*100).toFixed(1):'—')}%</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Expected Return</div><div className="text-[#22C55E] font-black mono">+{(Math.abs(forecast.targetPrice-forecast.entryPrice)/forecast.entryPrice*100).toFixed(2)}%</div><div className="text-[10px] text-[#64748B]">AI forecast</div></div>
    <div className="elevated rounded-xl p-3"><div className="text-[#64748B] text-[10px] uppercase tracking-widest font-bold">Signal Strength</div><div className={cn("font-black",forecast.confidence>0.75?"text-[#22C55E]":forecast.confidence>0.55?"text-[#F59E0B]":"text-[#64748B]")}>{forecast.confidence>0.75?'HIGH':forecast.confidence>0.55?'MEDIUM':'LOW'}</div><div className="text-[10px] text-[#64748B]">Risk {forecast.confidence>0.8?'LOW':forecast.confidence>0.55?'MEDIUM':'HIGH'}</div></div>
  </div>
  {!compact&&<div className="text-[11px] leading-relaxed text-[#94A3B8] bg-[#0B0F17] rounded-xl p-3 border border-white/[0.06]">{forecast.reason}</div>}
  <div className="grid grid-cols-3 gap-2 text-[11px] mono">
    <div className="elevated rounded-xl p-2.5 text-center"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Entry</div><div className="font-bold text-white">{forecast.entryPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2.5 text-center"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Target</div><div className="font-bold text-[#22C55E]">{forecast.targetPrice.toLocaleString()}</div></div>
    <div className="elevated rounded-xl p-2.5 text-center"><div className="text-[#64748B] text-[9px] uppercase tracking-widest">Stop</div><div className="font-bold text-[#EF4444]">{forecast.stopLoss.toLocaleString()}</div></div>
  </div>
  <p className="text-[10px] text-[#64748B] leading-relaxed">AI recommendation ≠ execution. Model confidence is estimated probability. Review risk before trading.</p>
 </section>
};
