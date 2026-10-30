import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketCandle, TimeFrame } from '../../types';
import { apiJson } from '../../services/apiFetch';
import { Play, RotateCw, CheckCircle, XCircle, ShieldCheck, Database, Sliders, Hash, Cpu, Sparkles, Activity } from 'lucide-react';
import { Badge } from '../common/ui';

type ScenarioType = 'HISTORICAL' | 'VOLATILITY' | 'TREND' | 'GAP' | 'LIQUIDITY_STRESS';
type StrategyType = 'RULE' | 'ML';

interface BacktestMetrics {
  sharpeRatio: number | null;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number | null;
  totalTrades: number;
  totalPnl: number;
  totalReturnPct: number;
  finalEquity: number;
  totalFees: number;
  totalSlippage: number;
  reasons: Record<string, string>;
}

interface BacktestResult {
  resultHash: string;
  configHash: string;
  provenance: {
    datasetSnapshotId: string;
    datasetHash: string;
    source: string;
    synthetic: boolean;
  };
  scenario: { type: ScenarioType; scenarioHash: string; synthetic: boolean };
  metrics: BacktestMetrics;
  equityCurve: Array<{ timestamp: number; equity: number; drawdown: number }>;
  fills: unknown[];
  orders: unknown[];
  quality: { eventsRead: number; skipped: number; gaps: number; warnings: string[] };
  attribution: { regimes: Record<string, { periods: number; cumulativeReturn: number }> };
}

interface CompletedRun {
  id: string;
  status: string;
  result: BacktestResult;
}

interface Props {
  symbolId: string;
  timeframe: TimeFrame;
  candles: MarketCandle[];
  sourceIsSynthetic?: boolean;
  accessToken?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const metricText = (value: number | null, digits = 2) => value == null ? '—' : value.toFixed(digits);

export const BacktestingDashboard: React.FC<Props> = ({ symbolId, timeframe, candles, sourceIsSynthetic = false, accessToken = '' }) => {
  const [scenario, setScenario] = useState<ScenarioType>('HISTORICAL');
  const [strategyType, setStrategyType] = useState<StrategyType>('RULE');
  const [fastPeriod, setFastPeriod] = useState(5);
  const [slowPeriod, setSlowPeriod] = useState(20);
  const [positionSize, setPositionSize] = useState(1);
  const [initialCash, setInitialCash] = useState(1_000_000);
  const [commissionBps, setCommissionBps] = useState(4);
  const [slippageBps, setSlippageBps] = useState(5);
  const [scenarioMagnitude, setScenarioMagnitude] = useState(2);
  const [modelVersion, setModelVersion] = useState('1.0.0');
  const [modelReady, setModelReady] = useState(false);
  const [run, setRun] = useState<CompletedRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiJson<{ modelReady: boolean; modelVersion?: string; version?: string }>('/api/status', accessToken)
      .then(data => {
        if (!active) return;
        setModelReady(Boolean(data.modelReady));
        if (data.modelVersion || data.version) setModelVersion(data.modelVersion || data.version || 'unknown');
      })
      .catch(() => {
        if (active) setModelReady(false);
      });
    return () => { active = false; };
  }, [accessToken]);

  const validCandles = useMemo(() => candles.filter(candle =>
    Number.isFinite(candle.timestamp)
    && Number.isFinite(candle.open)
    && Number.isFinite(candle.high)
    && Number.isFinite(candle.low)
    && Number.isFinite(candle.close)
    && Number.isFinite(candle.volume)
    && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0
    && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.close)
    && candle.low <= Math.min(candle.open, candle.close)
  ).sort((a, b) => a.timestamp - b.timestamp), [candles]);

  const runBacktest = async () => {
    if (validCandles.length < Math.max(30, slowPeriod + 2)) {
      setError(`At least ${Math.max(30, slowPeriod + 2)} valid candles are required.`);
      return;
    }
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      const datasetFingerprint = await sha256(JSON.stringify({ symbolId, timeframe, sourceIsSynthetic, candles: validCandles }));
      const datasetId = `ui-${symbolId.replace(/[^A-Za-z0-9._-]/g, '-')}-${timeframe}-${datasetFingerprint.slice(0, 20)}`;
      await apiJson<ApiEnvelope<unknown>>('/api/backtests/datasets', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          id: datasetId,
          instrumentId: symbolId,
          timeframe,
          source: sourceIsSynthetic ? 'PHASE1_DIGITAL_TWIN_SNAPSHOT' : 'PHASE1_MARKET_SNAPSHOT',
          synthetic: sourceIsSynthetic,
          candles: validCandles,
          metadata: { registeredBy: 'BACKTEST_UI' },
        }),
      });

      const positiveMagnitude = Math.max(0.01, Math.abs(scenarioMagnitude));
      const scenarioParameters: Record<string, number> = scenario === 'VOLATILITY'
        ? { multiplier: positiveMagnitude }
        : scenario === 'TREND'
          ? { driftBpsPerBar: scenarioMagnitude }
          : scenario === 'GAP'
            ? { gapPct: scenarioMagnitude / 100, eventIndex: Math.floor(validCandles.length / 2) }
            : scenario === 'LIQUIDITY_STRESS'
              ? { volumeMultiplier: Math.max(0.01, 1 / positiveMagnitude), spreadMultiplier: positiveMagnitude }
              : {};

      const payload = await apiJson<ApiEnvelope<CompletedRun>>('/api/backtests?wait=true&timeoutMs=60000', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          schemaVersion: '1.0',
          datasetSnapshotId: datasetId,
          instruments: [symbolId],
          timeframe,
          startAt: validCandles[0].timestamp,
          endAt: validCandles[validCandles.length - 1].timestamp,
          initialCash,
          baseCurrency: 'IRR',
          strategy: strategyType === 'ML'
            ? {
                type: 'ML', name: 'ONNX_TCN', version: '1.0.0', modelVersion,
                parameters: { positionSize, confidenceThreshold: 0.6, flatOnHold: false },
              }
            : {
                type: 'RULE', name: 'SMA_CROSS', version: '1.0.0',
                parameters: { fastPeriod, slowPeriod, positionSize, stopLossPct: 0.03, takeProfitPct: 0.06 },
              },
          execution: {
            fillModel: 'BAR', latencyMs: 0, commissionBps,
            slippageModel: 'FIXED_BPS', slippageBps, participationRate: 0.1,
            intrabarPolicy: 'WORST_CASE',
          },
          risk: {
            maxPositionNotional: initialCash * 0.25,
            maxLeverage: 1,
            maxDrawdownPct: 0.2,
            liquidateOnBreach: true,
          },
          scenario: { type: scenario, parameters: scenarioParameters, seed: 'ui-backtest-v1' },
          metrics: {
            periodsPerYear: timeframe === '1d' ? 252 : timeframe === '1h' ? 1638 : timeframe === '15m' ? 6552 : 98_280,
            riskFreeRateAnnual: 0,
          },
          qualityPolicy: 'FAIL',
          endOfRunPositionPolicy: 'LIQUIDATE',
        }),
      }, 65_000);
      if (payload.data?.status !== 'COMPLETED') {
        throw new Error(payload.error || `Backtest ended with ${payload.data?.status || 'an error'}`);
      }
      setRun(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  const chartData = run?.result.equityCurve.map(point => ({
    time: new Date(point.timestamp).toLocaleDateString(),
    equity: point.equity,
    drawdown: point.drawdown * 100,
  })) || [];
  const metrics = run?.result.metrics;

  return (
    <div
      aria-label="Walk-Forward Backtesting Laboratory"
      className="space-y-6 animate-in fade-in duration-300 font-mono"
    >
      <section className="glass-panel rounded-3xl p-6 lg:p-8 border border-white/[0.08] relative overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF] px-2 py-0.5 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25">
                Phase 3 • Point-in-time Engine
              </span>
              <Badge tone="cyan" dot>
                AUDITABLE SNAPSHOTS
              </Badge>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">
              Walk-Forward Backtesting & Scenario Lab
            </h1>
            <p className="max-w-3xl text-xs text-[#849495] font-sans leading-relaxed">
              Immutable dataset snapshots, next-bar fill simulation, friction costs, deterministic scenario injections, and verifiable result hashes.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#060E20] px-4 py-2.5 text-xs font-mono">
            <span className="text-[#849495]">Dataset: </span>
            <span className="font-bold text-white">{validCandles.length} {timeframe} bars</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 text-xs">
          <label className="text-[#849495] font-bold uppercase text-[10px]">Strategy
            <select value={strategyType} onChange={event => setStrategyType(event.target.value as StrategyType)} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none">
              <option value="RULE">SMA Cross (Rule-Based)</option>
              <option value="ML" disabled={!modelReady}>Pinned ONNX Model (TCN)</option>
            </select>
          </label>
          <label className="text-[#849495] font-bold uppercase text-[10px]">Scenario
            <select value={scenario} onChange={event => setScenario(event.target.value as ScenarioType)} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none">
              <option value="HISTORICAL">Historical Point-in-Time</option>
              <option value="VOLATILITY">Volatility Shock</option>
              <option value="TREND">Drift Trend Stress</option>
              <option value="GAP">Overnight Price Gap</option>
              <option value="LIQUIDITY_STRESS">Liquidity & Depth Stress</option>
            </select>
          </label>
          <label className="text-[#849495] font-bold uppercase text-[10px]">Initial Capital (IRR)
            <input type="number" min="1000" value={initialCash} onChange={event => setInitialCash(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
          </label>
          <label className="text-[#849495] font-bold uppercase text-[10px]">Position Size (Lots)
            <input type="number" min="0.0001" step="0.1" value={positionSize} onChange={event => setPositionSize(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
          </label>
          {strategyType === 'RULE' ? <>
            <label className="text-[#849495] font-bold uppercase text-[10px]">Fast SMA
              <input type="number" min="1" value={fastPeriod} onChange={event => setFastPeriod(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
            </label>
            <label className="text-[#849495] font-bold uppercase text-[10px]">Slow SMA
              <input type="number" min="2" value={slowPeriod} onChange={event => setSlowPeriod(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
            </label>
          </> : <label className="text-[#849495] font-bold uppercase text-[10px] sm:col-span-2">Pinned ML Checkpoint
            <input readOnly value={`${modelVersion}${modelReady ? '' : ' (not ready)'}`} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white" />
          </label>}
          <label className="text-[#849495] font-bold uppercase text-[10px]">Commission (bps)
            <input type="number" min="0" step="0.1" value={commissionBps} onChange={event => setCommissionBps(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
          </label>
          <label className="text-[#849495] font-bold uppercase text-[10px]">Slippage (bps)
            <input type="number" min="0" step="0.1" value={slippageBps} onChange={event => setSlippageBps(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
          </label>
          {scenario !== 'HISTORICAL' && <label className="text-[#849495] font-bold uppercase text-[10px]">Scenario Magnitude
            <input type="number" min={scenario === 'TREND' || scenario === 'GAP' ? -99 : 0.01} step="0.1" value={scenarioMagnitude} onChange={event => setScenarioMagnitude(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#060E20] p-3 text-white focus:border-[#00F0FF] focus:outline-none" />
          </label>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={() => void runBacktest()}
            disabled={loading || validCandles.length < 30 || fastPeriod >= slowPeriod}
            className="rounded-2xl bg-[#00F0FF] hover:bg-[#7DF4FF] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#060E20] shadow-[0_0_20px_rgba(0,240,255,0.25)] transition-all disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px] flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            <span>{loading ? 'Replaying Next-Bar Fills…' : 'Execute Deterministic Backtest'}</span>
          </button>
          <span className="text-[11px] text-[#849495] font-sans">
            Signals generated at bar close execute strictly on the next tick to prevent lookahead bias.
          </span>
        </div>
        {error && <div role="alert" className="mt-4 rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/15 p-3.5 text-xs text-[#FCA5A5]">{error}</div>}
      </section>

      {metrics && run && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Final Equity', metrics.finalEquity.toLocaleString()],
              ['Total Return', `${metrics.totalReturnPct.toFixed(2)}%`],
              ['Net PnL', metrics.totalPnl.toFixed(2)],
              ['Sharpe', metricText(metrics.sharpeRatio)],
              ['Max Drawdown', `${(metrics.maxDrawdown * 100).toFixed(2)}%`],
              ['Win Rate', `${(metrics.winRate * 100).toFixed(1)}%`],
              ['Profit Factor', metricText(metrics.profitFactor)],
              ['Closed Trades', String(metrics.totalTrades)],
            ].map(([label, value]) => (
              <div key={label} className="glass-card rounded-2xl p-4 border border-white/[0.08]">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#849495]">{label}</div>
                <div className="mt-1 break-all font-black text-base text-white">{value}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="glass-panel rounded-3xl p-6 lg:col-span-2 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">Equity & Capital Trajectory</h2>
                <span className="text-[10px] text-[#00F0FF]">Mark-to-Market Realized Curve</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#131B2E" />
                    <XAxis dataKey="time" stroke="#849495" fontSize={10} minTickGap={30} tickLine={false} />
                    <YAxis stroke="#849495" fontSize={10} domain={['auto', 'auto']} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#060E20', borderColor: '#00F0FF', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="equity" stroke="#00F0FF" dot={false} strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 text-xs border border-white/[0.08] space-y-4">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                <h2 className="font-bold uppercase tracking-wider text-white">Audit & Provenance Hash</h2>
              </div>
              <dl className="space-y-2.5 font-mono text-xs">
                <div><dt className="text-[#849495] text-[10px] uppercase">Execution Run ID</dt><dd className="break-all text-white font-bold">{run.id}</dd></div>
                <div><dt className="text-[#849495] text-[10px] uppercase">Cryptographic Result Hash</dt><dd className="break-all text-[#00F0FF]">{run.result.resultHash}</dd></div>
                <div><dt className="text-[#849495] text-[10px] uppercase">Dataset Snapshot Hash</dt><dd className="break-all text-white">{run.result.provenance.datasetHash}</dd></div>
                <div><dt className="text-[#849495] text-[10px] uppercase">Stress Scenario</dt><dd className="text-white font-bold">{run.result.scenario.type}</dd></div>
                <div><dt className="text-[#849495] text-[10px] uppercase">Data Health</dt><dd className="text-white">{run.result.quality.eventsRead} read • {run.result.quality.gaps} gaps</dd></div>
                <div><dt className="text-[#849495] text-[10px] uppercase">Friction Costs</dt><dd className="text-[#DAE2FD]">Fees {metrics.totalFees.toFixed(2)} • Slip {metrics.totalSlippage.toFixed(2)}</dd></div>
              </dl>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default BacktestingDashboard;

