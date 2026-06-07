import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from 'recharts';
import { MarketCandle, ExpertForecast } from '../../types';
import { format } from 'date-fns';

interface WalkForwardChartProps {
  data: MarketCandle[];
  forecast: ExpertForecast | null;
}

const WalkForwardChart: React.FC<WalkForwardChartProps> = ({ data, forecast }) => {

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Simple Moving Average and StdDev Calculation for Bollinger Bands
    const period = 20;
    const stdDevMultiplier = 2;

    return data.map((candle, index, array) => {
        let sma = null;
        let upper = null;
        let lower = null;

        if (index >= period - 1) {
            const slice = array.slice(index - period + 1, index + 1);
            const sum = slice.reduce((acc, c) => acc + c.close, 0);
            sma = sum / period;

            const squaredDiffs = slice.map(c => Math.pow(c.close - sma!, 2));
            const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
            const stdDev = Math.sqrt(variance);

            upper = sma + (stdDev * stdDevMultiplier);
            lower = sma - (stdDev * stdDevMultiplier);
        }

        // Determine date format based on data range
        const isIntraday = array.length > 0 && (array[array.length-1].timestamp - array[0].timestamp) < 48 * 60 * 60 * 1000;
        const timeFormat = isIntraday ? 'HH:mm' : 'MMM dd';

        return {
            originalTimestamp: candle.timestamp,
            time: format(candle.timestamp, timeFormat),
            price: candle.close,
            high: candle.high,
            low: candle.low,
            sma,
            upper,
            lower
        };
    });
  }, [data]);

  return (
    <div className="h-[400px] w-full bg-slate-900/50 rounded-2xl p-4 border border-slate-800">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
             <linearGradient id="colorBands" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#64748b" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#64748b" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={60}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
            itemStyle={{ color: '#e2e8f0' }}
            labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
            formatter={(value: any) => [value ? value.toLocaleString() : '', '']}
          />
          <Legend />

          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            strokeWidth={2}
            name="Price"
          />

          <Line type="monotone" dataKey="upper" stroke="#64748b" strokeDasharray="3 3" dot={false} strokeWidth={1} name="Upper BB" />
          <Line type="monotone" dataKey="lower" stroke="#64748b" strokeDasharray="3 3" dot={false} strokeWidth={1} name="Lower BB" />

          {forecast && (
            <>
              <ReferenceLine y={forecast.targetPrice} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'right', value: 'Target', fill: '#10b981', fontSize: 10 }} />
              <ReferenceLine y={forecast.stopLoss} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'right', value: 'SL', fill: '#f43f5e', fontSize: 10 }} />
              <ReferenceLine y={forecast.entryPrice} stroke="#fbbf24" strokeDasharray="3 3" label={{ position: 'right', value: 'Entry', fill: '#fbbf24', fontSize: 10 }} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WalkForwardChart;
