import React from 'react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from 'recharts';
import { MarketCandle, ExpertForecast } from '../../types';
import { format } from 'date-fns';

interface WalkForwardChartProps {
  data: MarketCandle[];
  forecast: ExpertForecast | null;
}

const WalkForwardChart: React.FC<WalkForwardChartProps> = ({ data, forecast }) => {
  const chartData = data.map(candle => ({
    time: format(candle.timestamp, 'MMM dd'),
    price: candle.close,
    high: candle.high,
    low: candle.low,
    upper: forecast?.indicators.bollinger.upper,
    lower: forecast?.indicators.bollinger.lower,
  }));

  return (
    <div className="h-[400px] w-full bg-slate-900/50 rounded-2xl p-4 border border-slate-800">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            strokeWidth={2}
          />
          {forecast && (
            <>
              <ReferenceLine y={forecast.targetPrice} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'right', value: 'Target', fill: '#10b981', fontSize: 10 }} />
              <ReferenceLine y={forecast.stopLoss} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'right', value: 'SL', fill: '#f43f5e', fontSize: 10 }} />
              <ReferenceLine y={forecast.entryPrice} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'right', value: 'Entry', fill: '#64748b', fontSize: 10 }} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WalkForwardChart;
