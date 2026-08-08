import React from 'react';
import { MarketCandle, ExpertForecast, TimeFrame } from '../../types';
import { ProfessionalChart } from './ProfessionalChart';

export interface WalkForwardChartProps {
  data: MarketCandle[];
  forecast: ExpertForecast | null;
  symbolName?: string;
  timeframe?: TimeFrame;
  onTimeframeChange?: (tf: TimeFrame) => void;
  className?: string;
}

export const WalkForwardChart: React.FC<WalkForwardChartProps> = (props) => {
  return <ProfessionalChart {...props} />;
};

export default WalkForwardChart;
