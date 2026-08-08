import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketCandle, TimeFrame } from '../../types';

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
}

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const metricText = (value: number | null, digits = 2) => value == null ? 'N/A' : value.toFixed(digits);

export const BacktestingDashboard: React.FC<Props> = ({ symbolId, timeframe, candles, sourceIsSynthetic = false }) => {
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
    void fetch('/api/status')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Model status unavailable')))
      .then(data => {
        if (!active) return;
        setModelReady(Boolean(data.modelReady));
        if (data.modelVersion || data.version) setModelVersion(data.modelVersion || data.version);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

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
      const datasetResponse = await fetch('/api/backtests/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const datasetPayload = await datasetResponse.json();
      if (!datasetResponse.ok) throw new Error(datasetPayload.error || 'Dataset registration failed');

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

      const response = await fetch('/api/backtests?wait=true&timeoutMs=60000', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      });
      const payload = await response.json();
      if (!response.ok || payload.data?.status !== 'COMPLETED') {
        throw new Error(payload.data?.error?.message || payload.error || `Backtest ended with ${payload.data?.status || 'an error'}`);
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
    <div className="space-y-6">
      <section className="glass-panel rounded-3xl p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Phase 3 • Point-in-time replay</div>
            <h1 className="mt-1 text-xl font-black text-white">Backtesting Engine</h1>
            <p className="mt-1 max-w-3xl text-xs text-[#94A3B8]">
              Immutable dataset snapshots, next-bar execution, actual fill-based PnL, costs, risk limits, deterministic scenarios, and auditable result hashes.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <span className="text-[#64748B]">Available data </span>
            <span className="font-mono font-black text-white">{validCandles.length} {timeframe} bars</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="text-xs text-[#94A3B8]">Strategy
            <select value={strategyType} onChange={event => setStrategyType(event.target.value as StrategyType)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white">
              <option value="RULE">SMA Cross</option>
              <option value="ML" disabled={!modelReady}>Pinned ONNX Model</option>
            </select>
          </label>
          <label className="text-xs text-[#94A3B8]">Scenario
            <select value={scenario} onChange={event => setScenario(event.target.value as ScenarioType)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white">
              <option value="HISTORICAL">Historical</option>
              <option value="VOLATILITY">Volatility</option>
              <option value="TREND">Trend</option>
              <option value="GAP">Price Gap</option>
              <option value="LIQUIDITY_STRESS">Liquidity Stress</option>
            </select>
          </label>
          <label className="text-xs text-[#94A3B8]">Initial cash
            <input type="number" min="1000" value={initialCash} onChange={event => setInitialCash(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>
          <label className="text-xs text-[#94A3B8]">Position units
            <input type="number" min="0.0001" step="0.1" value={positionSize} onChange={event => setPositionSize(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>
          {strategyType === 'RULE' ? <>
            <label className="text-xs text-[#94A3B8]">Fast SMA
              <input type="number" min="1" value={fastPeriod} onChange={event => setFastPeriod(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
            </label>
            <label className="text-xs text-[#94A3B8]">Slow SMA
              <input type="number" min="2" value={slowPeriod} onChange={event => setSlowPeriod(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
            </label>
          </> : <label className="text-xs text-[#94A3B8] sm:col-span-2">Pinned model
            <input readOnly value={`${modelVersion}${modelReady ? '' : ' (not ready)'}`} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>}
          <label className="text-xs text-[#94A3B8]">Commission (bps)
            <input type="number" min="0" step="0.1" value={commissionBps} onChange={event => setCommissionBps(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>
          <label className="text-xs text-[#94A3B8]">Slippage (bps)
            <input type="number" min="0" step="0.1" value={slippageBps} onChange={event => setSlippageBps(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>
          {scenario !== 'HISTORICAL' && <label className="text-xs text-[#94A3B8]">Scenario magnitude
            <input type="number" min={scenario === 'TREND' || scenario === 'GAP' ? -99 : 0.01} step="0.1" value={scenarioMagnitude} onChange={event => setScenarioMagnitude(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0F17] p-2 text-white" />
          </label>}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={() => void runBacktest()} disabled={loading || validCandles.length < 30 || fastPeriod >= slowPeriod} className="rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? 'Validating & replaying…' : 'Run deterministic backtest'}
          </button>
          <span className="text-[10px] text-[#64748B]">Signals at close execute no earlier than the next bar.</span>
        </div>
        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>}
      </section>

      {metrics && run && <>
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
          ].map(([label, value]) => <div key={label} className="glass-card rounded-2xl p-4">
            <div className="text-[9px] font-black uppercase tracking-wider text-[#64748B]">{label}</div>
            <div className="mt-1 break-all font-mono text-lg font-black text-white">{value}</div>
          </div>)}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-3xl p-5 lg:col-span-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-white">Equity curve</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} minTickGap={30} />
                  <YAxis stroke="#64748B" fontSize={10} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0B0F17', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="equity" stroke="#22d3ee" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-panel rounded-3xl p-5 text-xs">
            <h2 className="font-black uppercase tracking-wider text-white">Audit & provenance</h2>
            <dl className="mt-4 space-y-3">
              <div><dt className="text-[#64748B]">Run ID</dt><dd className="break-all font-mono text-white">{run.id}</dd></div>
              <div><dt className="text-[#64748B]">Result hash</dt><dd className="break-all font-mono text-cyan-300">{run.result.resultHash}</dd></div>
              <div><dt className="text-[#64748B]">Dataset hash</dt><dd className="break-all font-mono text-white">{run.result.provenance.datasetHash}</dd></div>
              <div><dt className="text-[#64748B]">Scenario</dt><dd className="font-mono text-white">{run.result.scenario.type}</dd></div>
              <div><dt className="text-[#64748B]">Data quality</dt><dd className="font-mono text-white">{run.result.quality.eventsRead} read • {run.result.quality.gaps} gaps • {run.result.quality.skipped} skipped</dd></div>
              <div><dt className="text-[#64748B]">Execution costs</dt><dd className="font-mono text-white">Fees {metrics.totalFees.toFixed(2)} • Slippage {metrics.totalSlippage.toFixed(2)}</dd></div>
            </dl>
          </div>
        </section>
      </>}
    </div>
  );
};
