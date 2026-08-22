import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MarketCandle, ExpertForecast, TimeFrame } from '../../types';
import {
  TrendingUp,
  TrendingDown,
  Maximize2,
  Minimize2,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Activity,
  ChevronDown,
  Sparkles,
  BarChart2,
  LineChart as LineChartIcon,
  X,
  Check
} from 'lucide-react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export type ChartType = 'candlestick' | 'ohlc' | 'line' | 'area';
export type PanelLayout = 'layout_a' | 'layout_b' | 'layout_c';

interface IndicatorConfig {
  sma20: boolean;
  sma50: boolean;
  ema9: boolean;
  ema21: boolean;
  vwap: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
  ichimoku: boolean;
  volume: boolean;
  aiForecast: boolean;
}

interface ProfessionalChartProps {
  data: MarketCandle[];
  forecast: ExpertForecast | null;
  symbolName?: string;
  timeframe?: TimeFrame;
  onTimeframeChange?: (tf: TimeFrame) => void;
  orderBookDepthData?: { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[] };
  className?: string;
}

export const ProfessionalChart: React.FC<ProfessionalChartProps> = ({
  data,
  forecast,
  symbolName = 'XAU/IME',
  timeframe = '1h',
  onTimeframeChange,
  orderBookDepthData,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Layout & display states
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [panelLayout, setPanelLayout] = useState<PanelLayout>('layout_a');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);

  // Indicators toggle state
  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma20: true,
    sma50: false,
    ema9: true,
    ema21: false,
    vwap: true,
    bollinger: true,
    rsi: true,
    macd: true,
    ichimoku: false,
    volume: true,
    aiForecast: true
  });

  // Responsive dimensions
  const [dimensions, setDimensions] = useState({ width: 800, height: 440 });

  // Pan & Zoom state (windowing)
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal (~40-60 candles), 2 = zoomed in, 0.5 = zoomed out
  const [panOffset, setPanOffset] = useState(0); // offset from the right
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Crosshair state
  const [crosshair, setCrosshair] = useState<{
    visible: boolean;
    x: number;
    y: number;
    candleIndex: number | null;
  }>({ visible: false, x: 0, y: 0, candleIndex: null });

  // Real-time price ticker animation state
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // Measure container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0) {
          // Dynamic height based on container & screen width
          const isMobile = width < 640;
          const isTablet = width >= 640 && width < 1024;
          const calculatedHeight = isFullscreen
            ? window.innerHeight - 80
            : isMobile
            ? Math.max(340, Math.min(480, window.innerHeight * 0.48))
            : isTablet
            ? 420
            : 480;
          setDimensions({ width, height: calculatedHeight });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // Handle Fullscreen change
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const el = containerRef.current;
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Detect real-time price changes & trigger 120-200ms animation
  const currentClose = data.length > 0 ? data[data.length - 1].close : null;
  useEffect(() => {
    if (currentClose !== null && lastPrice !== null) {
      if (currentClose > lastPrice) {
        setPriceFlash('up');
        const t = setTimeout(() => setPriceFlash(null), 180);
        return () => clearTimeout(t);
      } else if (currentClose < lastPrice) {
        setPriceFlash('down');
        const t = setTimeout(() => setPriceFlash(null), 180);
        return () => clearTimeout(t);
      }
    }
    if (currentClose !== null) {
      setLastPrice(currentClose);
    }
  }, [currentClose, lastPrice]);

  // Compute Technical Indicators across entire dataset
  const computedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const n = data.length;
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);
    const volumes = data.map((d) => d.volume);

    // 1. SMA 20 & SMA 50
    const sma20Arr: (number | null)[] = new Array(n).fill(null);
    const sma50Arr: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (i >= 19) {
        const sum = closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0);
        sma20Arr[i] = sum / 20;
      }
      if (i >= 49) {
        const sum = closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0);
        sma50Arr[i] = sum / 50;
      }
    }

    // 2. EMA 9 & EMA 21
    const ema9Arr: (number | null)[] = new Array(n).fill(null);
    const ema21Arr: (number | null)[] = new Array(n).fill(null);
    const k9 = 2 / (9 + 1);
    const k21 = 2 / (21 + 1);
    let prevEma9 = closes[0];
    let prevEma21 = closes[0];
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        ema9Arr[i] = closes[0];
        ema21Arr[i] = closes[0];
      } else {
        prevEma9 = closes[i] * k9 + prevEma9 * (1 - k9);
        prevEma21 = closes[i] * k21 + prevEma21 * (1 - k21);
        ema9Arr[i] = prevEma9;
        ema21Arr[i] = prevEma21;
      }
    }

    // 3. VWAP
    const vwapArr: (number | null)[] = new Array(n).fill(null);
    let cumVol = 0;
    let cumVolPrice = 0;
    for (let i = 0; i < n; i++) {
      const typical = (highs[i] + lows[i] + closes[i]) / 3;
      const v = volumes[i] || 1;
      cumVol += v;
      cumVolPrice += typical * v;
      vwapArr[i] = cumVolPrice / cumVol;
    }

    // 4. Bollinger Bands (20, 2)
    const bbUpper: (number | null)[] = new Array(n).fill(null);
    const bbLower: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (sma20Arr[i] !== null && i >= 19) {
        const mean = sma20Arr[i]!;
        const variance =
          closes.slice(i - 19, i + 1).reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / 20;
        const std = Math.sqrt(variance);
        bbUpper[i] = mean + 2 * std;
        bbLower[i] = mean - 2 * std;
      }
    }

    // 5. RSI 14
    const rsiArr: (number | null)[] = new Array(n).fill(null);
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      if (i <= 14) {
        avgGain += gain / 14;
        avgLoss += loss / 14;
        if (i === 14) {
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          rsiArr[i] = 100 - 100 / (1 + rs);
        }
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiArr[i] = 100 - 100 / (1 + rs);
      }
    }

    // 6. MACD (12, 26, 9)
    const macdLine: (number | null)[] = new Array(n).fill(null);
    const macdSignal: (number | null)[] = new Array(n).fill(null);
    const macdHist: (number | null)[] = new Array(n).fill(null);
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    const kSig = 2 / 10;
    let ema12 = closes[0];
    let ema26 = closes[0];
    let signalEma = 0;

    for (let i = 0; i < n; i++) {
      if (i > 0) {
        ema12 = closes[i] * k12 + ema12 * (1 - k12);
        ema26 = closes[i] * k26 + ema26 * (1 - k26);
      }
      if (i >= 25) {
        const val = ema12 - ema26;
        macdLine[i] = val;
        if (i === 25) {
          signalEma = val;
          macdSignal[i] = signalEma;
          macdHist[i] = val - signalEma;
        } else {
          signalEma = val * kSig + signalEma * (1 - kSig);
          macdSignal[i] = signalEma;
          macdHist[i] = val - signalEma;
        }
      }
    }

    // 7. Ichimoku Cloud (Tenkan 9, Kijun 26, Senkou A, Senkou B 52)
    const tenkanArr: (number | null)[] = new Array(n).fill(null);
    const kijunArr: (number | null)[] = new Array(n).fill(null);
    const senkouAArr: (number | null)[] = new Array(n).fill(null);
    const senkouBArr: (number | null)[] = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      if (i >= 8) {
        const h9 = Math.max(...highs.slice(i - 8, i + 1));
        const l9 = Math.min(...lows.slice(i - 8, i + 1));
        tenkanArr[i] = (h9 + l9) / 2;
      }
      if (i >= 25) {
        const h26 = Math.max(...highs.slice(i - 25, i + 1));
        const l26 = Math.min(...lows.slice(i - 25, i + 1));
        kijunArr[i] = (h26 + l26) / 2;
      }
      if (tenkanArr[i] !== null && kijunArr[i] !== null) {
        senkouAArr[i] = (tenkanArr[i]! + kijunArr[i]!) / 2;
      }
      if (i >= 51) {
        const h52 = Math.max(...highs.slice(i - 51, i + 1));
        const l52 = Math.min(...lows.slice(i - 51, i + 1));
        senkouBArr[i] = (h52 + l52) / 2;
      }
    }

    return data.map((c, i) => ({
      ...c,
      index: i,
      sma20: sma20Arr[i],
      sma50: sma50Arr[i],
      ema9: ema9Arr[i],
      ema21: ema21Arr[i],
      vwap: vwapArr[i],
      bbUpper: bbUpper[i],
      bbLower: bbLower[i],
      rsi: rsiArr[i],
      macdLine: macdLine[i],
      macdSignal: macdSignal[i],
      macdHist: macdHist[i],
      tenkan: tenkanArr[i],
      kijun: kijunArr[i],
      senkouA: senkouAArr[i],
      senkouB: senkouBArr[i]
    }));
  }, [data]);

  // Determine Visible Candle Range based on width, zoom, and pan offset
  const { visibleData, candleWidth, startIndex, endIndex } = useMemo(() => {
    if (computedData.length === 0) {
      return { visibleData: [], candleWidth: 8, startIndex: 0, endIndex: 0 };
    }

    const totalCandles = computedData.length;
    // Base number of visible candles depending on container width
    const baseCount = dimensions.width < 480 ? 30 : dimensions.width < 768 ? 45 : dimensions.width < 1440 ? 65 : 85;
    const targetCount = Math.max(15, Math.min(totalCandles, Math.round(baseCount / zoomLevel)));

    const maxOffset = Math.max(0, totalCandles - targetCount);
    const clampedOffset = Math.max(0, Math.min(maxOffset, panOffset));

    const end = totalCandles - clampedOffset;
    const start = Math.max(0, end - targetCount);

    const slice = computedData.slice(start, end);
    const cWidth = Math.max(3, (dimensions.width - 70) / slice.length);

    return {
      visibleData: slice,
      candleWidth: cWidth,
      startIndex: start,
      endIndex: end
    };
  }, [computedData, dimensions.width, zoomLevel, panOffset]);

  // Layout Subpanel Heights
  const panels = useMemo(() => {
    const isMobile = dimensions.width < 640;
    const totalH = dimensions.height;
    const padding = { top: 20, right: 64, bottom: 24, left: 10 };

    if (panelLayout === 'layout_a') {
      // Main Price (60%), Volume (18%), RSI (22%)
      const rsiActive = indicators.rsi;
      const volActive = indicators.volume;
      let mainH = totalH - padding.top - padding.bottom;
      let volH = 0;
      let rsiH = 0;

      if (rsiActive && volActive) {
        volH = Math.max(45, totalH * 0.16);
        rsiH = Math.max(55, totalH * 0.20);
        mainH = totalH - padding.top - padding.bottom - volH - rsiH - 20;
      } else if (rsiActive) {
        rsiH = Math.max(65, totalH * 0.25);
        mainH = totalH - padding.top - padding.bottom - rsiH - 10;
      } else if (volActive) {
        volH = Math.max(50, totalH * 0.20);
        mainH = totalH - padding.top - padding.bottom - volH - 10;
      }

      return {
        main: { y: padding.top, height: Math.max(160, mainH) },
        volume: volActive ? { y: padding.top + mainH + 10, height: volH } : null,
        sub: rsiActive ? { y: padding.top + mainH + (volActive ? volH + 20 : 10), height: rsiH, type: 'rsi' as const } : null,
        padding
      };
    } else if (panelLayout === 'layout_b') {
      // Main Price + Order Book Depth panel
      const depthH = Math.max(65, totalH * 0.26);
      const mainH = totalH - padding.top - padding.bottom - depthH - 10;
      return {
        main: { y: padding.top, height: Math.max(180, mainH) },
        volume: null,
        sub: { y: padding.top + mainH + 10, height: depthH, type: 'depth' as const },
        padding
      };
    } else {
      // Layout C: Main Price + Volume + AI Forecast / MACD
      const macdH = Math.max(65, totalH * 0.24);
      const volH = Math.max(45, totalH * 0.15);
      const mainH = totalH - padding.top - padding.bottom - macdH - volH - 20;
      return {
        main: { y: padding.top, height: Math.max(160, mainH) },
        volume: { y: padding.top + mainH + 10, height: volH },
        sub: { y: padding.top + mainH + volH + 20, height: macdH, type: 'macd' as const },
        padding
      };
    }
  }, [dimensions.height, dimensions.width, panelLayout, indicators.rsi, indicators.volume]);

  // Price Scale Calculation (Min / Max across visible candles + indicators + forecast levels)
  const priceScale = useMemo(() => {
    if (visibleData.length === 0) return { min: 0, max: 1, range: 1, getY: () => 0 };

    let min = Math.min(...visibleData.map((d) => d.low));
    let max = Math.max(...visibleData.map((d) => d.high));

    // Incorporate Bollinger Bands if enabled
    if (indicators.bollinger) {
      for (const d of visibleData) {
        if (d.bbUpper !== null && d.bbUpper > max) max = d.bbUpper;
        if (d.bbLower !== null && d.bbLower < min) min = d.bbLower;
      }
    }

    // Incorporate SMA / EMA if enabled
    if (indicators.sma20) {
      for (const d of visibleData) {
        if (d.sma20 !== null) {
          if (d.sma20 > max) max = d.sma20;
          if (d.sma20 < min) min = d.sma20;
        }
      }
    }

    // Incorporate AI Forecast price levels (Entry, Target, Stop Loss) if enabled
    if (indicators.aiForecast && forecast) {
      if (forecast.entryPrice > max) max = forecast.entryPrice;
      if (forecast.entryPrice < min) min = forecast.entryPrice;
      if (forecast.targetPrice > max) max = forecast.targetPrice;
      if (forecast.targetPrice < min) min = forecast.targetPrice;
      if (forecast.stopLoss > max) max = forecast.stopLoss;
      if (forecast.stopLoss < min) min = forecast.stopLoss;
    }

    // Add 4% padding top and bottom for visual breathing room
    const padding = (max - min) * 0.04 || 10;
    const finalMin = min - padding;
    const finalMax = max + padding;
    const range = finalMax - finalMin || 1;

    const mainY = panels.main.y;
    const mainH = panels.main.height;

    const getY = (price: number) => {
      return mainY + mainH - ((price - finalMin) / range) * mainH;
    };

    return { min: finalMin, max: finalMax, range, getY };
  }, [visibleData, indicators.bollinger, indicators.sma20, indicators.aiForecast, forecast, panels.main]);

  // Volume Scale Calculation
  const volumeScale = useMemo(() => {
    if (visibleData.length === 0 || !panels.volume) return { max: 1, getY: () => 0 };
    const maxVol = Math.max(...visibleData.map((d) => d.volume), 10);
    const volY = panels.volume.y;
    const volH = panels.volume.height;

    const getY = (vol: number) => {
      return volY + volH - (vol / maxVol) * volH;
    };

    return { max: maxVol, getY };
  }, [visibleData, panels.volume]);

  // RSI Scale Calculation
  const rsiScale = useMemo(() => {
    if (!panels.sub || panels.sub.type !== 'rsi') return { getY: () => 0 };
    const subY = panels.sub.y;
    const subH = panels.sub.height;
    const getY = (rsi: number) => {
      const clamped = Math.max(0, Math.min(100, rsi));
      return subY + subH - (clamped / 100) * subH;
    };
    return { getY };
  }, [panels.sub]);

  // MACD Scale Calculation
  const macdScale = useMemo(() => {
    if (!panels.sub || panels.sub.type !== 'macd' || visibleData.length === 0) {
      return { getY: () => 0, zeroY: 0 };
    }
    const subY = panels.sub.y;
    const subH = panels.sub.height;

    let min = 0;
    let max = 0;
    for (const d of visibleData) {
      if (d.macdLine !== null) {
        if (d.macdLine > max) max = d.macdLine;
        if (d.macdLine < min) min = d.macdLine;
      }
      if (d.macdSignal !== null) {
        if (d.macdSignal > max) max = d.macdSignal;
        if (d.macdSignal < min) min = d.macdSignal;
      }
      if (d.macdHist !== null) {
        if (d.macdHist > max) max = d.macdHist;
        if (d.macdHist < min) min = d.macdHist;
      }
    }
    const pad = Math.max(Math.abs(max), Math.abs(min)) * 1.15 || 1;
    const range = pad * 2;
    const getY = (val: number) => {
      return subY + subH / 2 - (val / pad) * (subH / 2);
    };
    return { getY, zeroY: subY + subH / 2 };
  }, [panels.sub, visibleData]);

  // X Coordinate calculation for each candle index in visibleData
  const getX = useCallback(
    (indexInVisible: number) => {
      const leftPad = panels.padding.left;
      const slotWidth = (dimensions.width - panels.padding.left - panels.padding.right) / Math.max(1, visibleData.length);
      return leftPad + (indexInVisible + 0.5) * slotWidth;
    },
    [dimensions.width, panels.padding.left, panels.padding.right, visibleData.length]
  );

  // Mouse & Touch Drag Interaction (Pan & Crosshair)
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffset(panOffset);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const candleSlot = (dimensions.width - panels.padding.left - panels.padding.right) / Math.max(1, visibleData.length);
      const candleDelta = Math.round(deltaX / Math.max(4, candleSlot));
      setPanOffset(Math.max(0, dragStartOffset + candleDelta));
    }

    // Find nearest candle for crosshair
    const leftPad = panels.padding.left;
    const slotWidth = (dimensions.width - panels.padding.left - panels.padding.right) / Math.max(1, visibleData.length);
    const relativeX = x - leftPad;
    const indexInVisible = Math.max(0, Math.min(visibleData.length - 1, Math.floor(relativeX / slotWidth)));

    setCrosshair({
      visible: true,
      x: Math.max(leftPad, Math.min(dimensions.width - panels.padding.right, x)),
      y: Math.max(panels.padding.top, Math.min(dimensions.height - panels.padding.bottom, y)),
      candleIndex: indexInVisible
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handlePointerLeave = () => {
    setIsDragging(false);
    setCrosshair((prev) => ({ ...prev, visible: false }));
  };

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((z) => Math.min(3.5, z * 1.25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.4, z / 1.25));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  // Crosshair Active Candle Data
  const hoveredCandle = crosshair.candleIndex !== null && visibleData[crosshair.candleIndex] ? visibleData[crosshair.candleIndex] : visibleData[visibleData.length - 1];

  // AI Forecast Projection Geometry
  const aiProjectionPath = useMemo(() => {
    if (!forecast || !indicators.aiForecast || visibleData.length === 0) return null;

    const lastIdx = visibleData.length - 1;
    const lastX = getX(lastIdx);
    const lastY = priceScale.getY(visibleData[lastIdx].close);

    // Project 6 forecast step intervals into future space
    const stepX = (dimensions.width - panels.padding.left - panels.padding.right) / visibleData.length;
    const targetY = priceScale.getY(forecast.targetPrice);
    const stopY = priceScale.getY(forecast.stopLoss);
    const entryY = priceScale.getY(forecast.entryPrice);

    const futureX1 = lastX + stepX * 2;
    const futureX2 = lastX + stepX * 4;
    const futureXEnd = Math.min(dimensions.width - panels.padding.right, lastX + stepX * 7);

    // Shaded Confidence Boundary (Upper and Lower confidence bands)
    const upperY = forecast.action === 'BUY' ? targetY : entryY + (entryY - stopY) * 0.4;
    const lowerY = forecast.action === 'BUY' ? stopY : targetY;

    // Confidence area polygon path
    const confPolygon = `M ${lastX},${lastY} L ${futureXEnd},${priceScale.getY(forecast.action === 'BUY' ? forecast.targetPrice * 1.015 : forecast.entryPrice * 1.01)} L ${futureXEnd},${priceScale.getY(forecast.action === 'BUY' ? forecast.stopLoss * 0.985 : forecast.targetPrice * 0.985)} Z`;

    // Center trajectory curve
    const centerPath = `M ${lastX},${lastY} Q ${futureX1},${forecast.action === 'BUY' ? (lastY + targetY) / 2 : (lastY + targetY) / 2} ${futureXEnd},${targetY}`;

    return {
      lastX,
      lastY,
      futureXEnd,
      targetY,
      stopY,
      entryY,
      confPolygon,
      centerPath,
      upperY,
      lowerY
    };
  }, [forecast, indicators.aiForecast, visibleData, getX, priceScale, dimensions.width, panels.padding]);

  // Formatter utilities
  const formatPrice = (val: number) => {
    return val >= 1000 ? val.toLocaleString(undefined, { maximumFractionDigits: 0 }) : val.toFixed(2);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col w-full rounded-2xl bg-[#080C14] border border-white/[0.08] shadow-2xl overflow-hidden transition-all select-none',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen bg-[#05070B]' : '',
        className
      )}
    >
      {/* 1. PROFESSIONAL CHART TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 border-b border-white/[0.07] bg-[#0B0F19] text-xs">
        {/* Left: Timeframe selectors & Chart Type */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
          {/* Timeframe buttons */}
          <div className="flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08]">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as (TimeFrame | '5m' | '4h')[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange?.(tf === '5m' ? '15m' : tf === '4h' ? '1d' : (tf as TimeFrame))}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all touch-target',
                  timeframe === tf || (tf === '1h' && timeframe === '1h')
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.06]'
                )}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          {/* Chart Type Dropdown/Buttons */}
          <div className="flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08]">
            <button
              title="Candlestick"
              onClick={() => setChartType('candlestick')}
              className={cn(
                'px-2 py-1 rounded-lg text-xs font-bold transition-all min-h-[32px] min-w-[32px] grid place-items-center',
                chartType === 'candlestick' ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white'
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              title="OHLC Bars"
              onClick={() => setChartType('ohlc')}
              className={cn(
                'px-2 py-1 rounded-lg text-xs font-bold transition-all min-h-[32px] min-w-[32px] grid place-items-center',
                chartType === 'ohlc' ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white'
              )}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              title="Area Line"
              onClick={() => setChartType('area')}
              className={cn(
                'px-2 py-1 rounded-lg text-xs font-bold transition-all min-h-[32px] min-w-[32px] grid place-items-center',
                chartType === 'area' ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white'
              )}
            >
              <LineChartIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center: Live Price Indicator with Arrow & Subtle Animation */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="font-black text-xs font-vazir text-slate-300">{symbolName}</span>
          {currentClose !== null && (
            <span
              className={cn(
                'mono text-xs font-black px-1.5 py-0.5 rounded transition-all duration-180',
                priceFlash === 'up' ? 'animate-price-up text-emerald-400 bg-emerald-500/20' : '',
                priceFlash === 'down' ? 'animate-price-down text-red-400 bg-red-500/20' : 'text-white'
              )}
            >
              {formatPrice(currentClose)}
            </span>
          )}
          {priceFlash === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400 animate-bounce" />}
          {priceFlash === 'down' && <TrendingDown className="w-3 h-3 text-red-400 animate-bounce" />}
        </div>

        {/* Right: Indicators, Layout, Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-1.5">
          {/* Indicators Button */}
          <button
            onClick={() => setShowIndicatorsModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-blue-300 font-bold text-xs min-h-[36px]"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Indicators</span>
          </button>

          {/* Panel Layout Switcher */}
          <div className="hidden md:flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08]">
            <button
              title="Layout A: Price + Volume + RSI"
              onClick={() => setPanelLayout('layout_a')}
              className={cn('px-2 py-1 rounded-lg text-[11px] font-black', panelLayout === 'layout_a' ? 'bg-blue-600 text-white' : 'text-[#94A3B8]')}
            >
              A
            </button>
            <button
              title="Layout B: Price + Order Book Depth"
              onClick={() => setPanelLayout('layout_b')}
              className={cn('px-2 py-1 rounded-lg text-[11px] font-black', panelLayout === 'layout_b' ? 'bg-blue-600 text-white' : 'text-[#94A3B8]')}
            >
              B
            </button>
            <button
              title="Layout C: Price + AI Forecast + MACD"
              onClick={() => setPanelLayout('layout_c')}
              className={cn('px-2 py-1 rounded-lg text-[11px] font-black', panelLayout === 'layout_c' ? 'bg-blue-600 text-white' : 'text-[#94A3B8]')}
            >
              C
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.04] p-0.5 border border-white/[0.08]">
            <button
              title="Zoom In"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/[0.06] min-h-[32px] min-w-[32px] grid place-items-center"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              title="Zoom Out"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/[0.06] min-h-[32px] min-w-[32px] grid place-items-center"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {(zoomLevel !== 1 || panOffset !== 0) && (
              <button
                title="Reset View"
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg text-blue-400 hover:bg-white/[0.06] min-h-[32px] min-w-[32px] grid place-items-center"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-[#94A3B8] hover:text-white min-h-[36px] min-w-[36px] grid place-items-center"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. FINANCIAL CROSSHAIR DATA HUD (TOP BAR OVERLAY) */}
      {hoveredCandle && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-[#080C14]/90 border-b border-white/[0.04] text-[11px] mono text-[#94A3B8] z-20">
          <span className="text-white font-bold">{formatDate(hoveredCandle.timestamp)}</span>
          <span>
            O: <strong className="text-white">{formatPrice(hoveredCandle.open)}</strong>
          </span>
          <span>
            H: <strong className="text-emerald-400">{formatPrice(hoveredCandle.high)}</strong>
          </span>
          <span>
            L: <strong className="text-red-400">{formatPrice(hoveredCandle.low)}</strong>
          </span>
          <span>
            C: <strong className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-red-400'}>{formatPrice(hoveredCandle.close)}</strong>
          </span>
          <span>
            Vol: <strong className="text-sky-300">{(hoveredCandle.volume || 0).toLocaleString()}</strong>
          </span>

          {indicators.sma20 && hoveredCandle.sma20 && (
            <span className="text-amber-300">SMA20: {formatPrice(hoveredCandle.sma20)}</span>
          )}
          {indicators.rsi && hoveredCandle.rsi !== null && (
            <span className="text-blue-300">RSI: {hoveredCandle.rsi.toFixed(1)}</span>
          )}

          {forecast && indicators.aiForecast && (
            <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300">
              <Sparkles className="w-3 h-3 text-blue-400" />
              AI Conf: {(forecast.confidence * 100).toFixed(0)}% • {forecast.action}
            </span>
          )}
        </div>
      )}

      {/* 3. MAIN SVG FINANCIAL CHART CANVAS */}
      <div className="relative flex-1 w-full min-h-[320px] chart-touch-area bg-[#05070B] overflow-hidden cursor-crosshair">
        <svg
          ref={svgRef}
          width="100%"
          height={dimensions.height}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            {/* Price Area Gradient */}
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
              <stop offset="90%" stopColor="#3B82F6" stopOpacity="0.0" />
            </linearGradient>

            {/* AI Confidence Cone Gradient */}
            <linearGradient id="aiConfidenceGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
            </linearGradient>

            {/* Volume Up Gradient */}
            <linearGradient id="volUpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#22C55E" stopOpacity="0.2" />
            </linearGradient>

            {/* Volume Down Gradient */}
            <linearGradient id="volDownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines (Main Price Panel) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = panels.main.y + panels.main.height * pct;
            const price = priceScale.max - (priceScale.range * pct);
            return (
              <g key={pct}>
                <line
                  x1={panels.padding.left}
                  y1={y}
                  x2={dimensions.width - panels.padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={dimensions.width - panels.padding.right + 6}
                  y={y + 3}
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="start"
                >
                  {formatPrice(price)}
                </text>
              </g>
            );
          })}

          {/* Time axis vertical grid lines & labels */}
          {visibleData.map((d, i) => {
            const step = Math.max(1, Math.floor(visibleData.length / (dimensions.width < 600 ? 4 : 8)));
            if (i % step !== 0) return null;
            const x = getX(i);
            return (
              <g key={d.timestamp}>
                <line
                  x1={x}
                  y1={panels.main.y}
                  x2={x}
                  y2={dimensions.height - panels.padding.bottom}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={dimensions.height - 8}
                  fill="#64748B"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                >
                  {formatTime(d.timestamp)}
                </text>
              </g>
            );
          })}

          {/* Ichimoku Cloud (if enabled) */}
          {indicators.ichimoku && (
            <path
              d={visibleData
                .map((d, i) => {
                  if (d.senkouA === null || d.senkouB === null) return '';
                  const x = getX(i);
                  const yA = priceScale.getY(d.senkouA);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${yA}`;
                })
                .filter(Boolean)
                .join(' ')}
              stroke="#06B6D4"
              strokeWidth="1"
              fill="none"
              opacity="0.6"
            />
          )}

          {/* Bollinger Bands Shaded Corridor (if enabled) */}
          {indicators.bollinger && (
            <>
              <path
                d={
                  visibleData
                    .map((d, i) => {
                      if (d.bbUpper === null) return '';
                      const x = getX(i);
                      const y = priceScale.getY(d.bbUpper);
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .filter(Boolean)
                    .join(' ') +
                  ' ' +
                  visibleData
                    .slice()
                    .reverse()
                    .map((d, i) => {
                      if (d.bbLower === null) return '';
                      const origIdx = visibleData.length - 1 - i;
                      const x = getX(origIdx);
                      const y = priceScale.getY(d.bbLower);
                      return `L ${x} ${y}`;
                    })
                    .filter(Boolean)
                    .join(' ') +
                  ' Z'
                }
                fill="rgba(148, 163, 184, 0.05)"
                stroke="none"
              />
              <path
                d={visibleData
                  .map((d, i) => {
                    if (d.bbUpper === null) return '';
                    return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.bbUpper)}`;
                  })
                  .filter(Boolean)
                  .join(' ')}
                stroke="#64748B"
                strokeDasharray="2 2"
                strokeWidth="1"
                fill="none"
                opacity="0.5"
              />
              <path
                d={visibleData
                  .map((d, i) => {
                    if (d.bbLower === null) return '';
                    return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.bbLower)}`;
                  })
                  .filter(Boolean)
                  .join(' ')}
                stroke="#64748B"
                strokeDasharray="2 2"
                strokeWidth="1"
                fill="none"
                opacity="0.5"
              />
            </>
          )}

          {/* SMA 20 Line (if enabled) */}
          {indicators.sma20 && (
            <path
              d={visibleData
                .map((d, i) => {
                  if (d.sma20 === null) return '';
                  return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.sma20)}`;
                })
                .filter(Boolean)
                .join(' ')}
              stroke="#F59E0B"
              strokeWidth="1.5"
              fill="none"
            />
          )}

          {/* SMA 50 Line (if enabled) */}
          {indicators.sma50 && (
            <path
              d={visibleData
                .map((d, i) => {
                  if (d.sma50 === null) return '';
                  return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.sma50)}`;
                })
                .filter(Boolean)
                .join(' ')}
              stroke="#3B82F6"
              strokeWidth="1.5"
              fill="none"
            />
          )}

          {/* EMA 9 Line (if enabled) */}
          {indicators.ema9 && (
            <path
              d={visibleData
                .map((d, i) => {
                  if (d.ema9 === null) return '';
                  return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.ema9)}`;
                })
                .filter(Boolean)
                .join(' ')}
              stroke="#A855F7"
              strokeWidth="1.5"
              fill="none"
            />
          )}

          {/* VWAP Line (if enabled) */}
          {indicators.vwap && (
            <path
              d={visibleData
                .map((d, i) => {
                  if (d.vwap === null) return '';
                  return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.vwap)}`;
                })
                .filter(Boolean)
                .join(' ')}
              stroke="#EC4899"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              fill="none"
            />
          )}

          {/* AI FORECAST VISUALIZATION (Shaded Confidence Area & Projected Trajectory) */}
          {aiProjectionPath && indicators.aiForecast && forecast && (
            <g className="ai-forecast-layer">
              {/* Confidence Band Polygon */}
              <path d={aiProjectionPath.confPolygon} fill="url(#aiConfidenceGrad)" />

              {/* Upper Confidence Limit */}
              <line
                x1={aiProjectionPath.lastX}
                y1={aiProjectionPath.lastY}
                x2={aiProjectionPath.futureXEnd}
                y2={priceScale.getY(forecast.action === 'BUY' ? forecast.targetPrice * 1.015 : forecast.entryPrice * 1.01)}
                stroke="#3B82F6"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />

              {/* Lower Confidence Limit */}
              <line
                x1={aiProjectionPath.lastX}
                y1={aiProjectionPath.lastY}
                x2={aiProjectionPath.futureXEnd}
                y2={priceScale.getY(forecast.action === 'BUY' ? forecast.stopLoss * 0.985 : forecast.targetPrice * 0.985)}
                stroke="#3B82F6"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />

              {/* Center Projection Curve */}
              <path
                d={aiProjectionPath.centerPath}
                fill="none"
                stroke="#93C5FD"
                strokeWidth="2.5"
                strokeDasharray="5 3"
              />

              {/* Target Price Line */}
              <line
                x1={panels.padding.left}
                y1={aiProjectionPath.targetY}
                x2={dimensions.width - panels.padding.right}
                y2={aiProjectionPath.targetY}
                stroke="#10B981"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <rect
                x={dimensions.width - panels.padding.right + 4}
                y={aiProjectionPath.targetY - 8}
                width={52}
                height={16}
                rx={4}
                fill="#064E3B"
                stroke="#10B981"
                strokeWidth="1"
              />
              <text
                x={dimensions.width - panels.padding.right + 30}
                y={aiProjectionPath.targetY + 4}
                fill="#34D399"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                TP {formatPrice(forecast.targetPrice)}
              </text>

              {/* Entry Price Line */}
              <line
                x1={panels.padding.left}
                y1={aiProjectionPath.entryY}
                x2={dimensions.width - panels.padding.right}
                y2={aiProjectionPath.entryY}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <rect
                x={dimensions.width - panels.padding.right + 4}
                y={aiProjectionPath.entryY - 8}
                width={52}
                height={16}
                rx={4}
                fill="#78350F"
                stroke="#F59E0B"
                strokeWidth="1"
              />
              <text
                x={dimensions.width - panels.padding.right + 30}
                y={aiProjectionPath.entryY + 4}
                fill="#FBBF24"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                ENTRY
              </text>

              {/* Stop Loss Line */}
              <line
                x1={panels.padding.left}
                y1={aiProjectionPath.stopY}
                x2={dimensions.width - panels.padding.right}
                y2={aiProjectionPath.stopY}
                stroke="#EF4444"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <rect
                x={dimensions.width - panels.padding.right + 4}
                y={aiProjectionPath.stopY - 8}
                width={52}
                height={16}
                rx={4}
                fill="#7F1D1D"
                stroke="#EF4444"
                strokeWidth="1"
              />
              <text
                x={dimensions.width - panels.padding.right + 30}
                y={aiProjectionPath.stopY + 4}
                fill="#F87171"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                SL {formatPrice(forecast.stopLoss)}
              </text>
            </g>
          )}

          {/* CANDLESTICKS / OHLC / AREA / LINE RENDERING */}
          {chartType === 'area' && (
            <g>
              <path
                d={
                  visibleData
                    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.close)}`)
                    .join(' ') +
                  ` L ${getX(visibleData.length - 1)} ${panels.main.y + panels.main.height} L ${getX(0)} ${panels.main.y + panels.main.height} Z`
                }
                fill="url(#chartAreaGrad)"
              />
              <path
                d={visibleData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.close)}`).join(' ')}
                stroke="#3B82F6"
                strokeWidth="2"
                fill="none"
              />
            </g>
          )}

          {chartType === 'line' && (
            <path
              d={visibleData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${priceScale.getY(d.close)}`).join(' ')}
              stroke="#3B82F6"
              strokeWidth="2"
              fill="none"
            />
          )}

          {chartType === 'ohlc' &&
            visibleData.map((d, i) => {
              const x = getX(i);
              const isUp = d.close >= d.open;
              const color = isUp ? '#22C55E' : '#EF4444';
              const yHigh = priceScale.getY(d.high);
              const yLow = priceScale.getY(d.low);
              const yOpen = priceScale.getY(d.open);
              const yClose = priceScale.getY(d.close);
              const tickW = Math.max(2, candleWidth * 0.4);

              return (
                <g key={d.timestamp}>
                  {/* Stem High-Low */}
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.5" />
                  {/* Left tick: Open */}
                  <line x1={x - tickW} y1={yOpen} x2={x} y2={yOpen} stroke={color} strokeWidth="1.5" />
                  {/* Right tick: Close */}
                  <line x1={x} y1={yClose} x2={x + tickW} y2={yClose} stroke={color} strokeWidth="1.5" />
                </g>
              );
            })}

          {chartType === 'candlestick' &&
            visibleData.map((d, i) => {
              const x = getX(i);
              const isUp = d.close >= d.open;
              const color = isUp ? '#22C55E' : '#EF4444';
              const yHigh = priceScale.getY(d.high);
              const yLow = priceScale.getY(d.low);
              const yOpen = priceScale.getY(d.open);
              const yClose = priceScale.getY(d.close);

              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
              const bodyWidth = Math.max(2, candleWidth * 0.75);

              return (
                <g key={d.timestamp} className="candle-group">
                  {/* Candle Wick (High-Low) */}
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.2" opacity="0.9" />
                  {/* Candle Body */}
                  <rect
                    x={x - bodyWidth / 2}
                    y={bodyTop}
                    width={bodyWidth}
                    height={bodyHeight}
                    fill={color}
                    stroke={color}
                    strokeWidth="0.5"
                    rx="1"
                  />
                </g>
              );
            })}

          {/* SUBPANEL: VOLUME (if active) */}
          {panels.volume && (
            <g className="volume-panel">
              <line
                x1={panels.padding.left}
                y1={panels.volume.y}
                x2={dimensions.width - panels.padding.right}
                y2={panels.volume.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text
                x={panels.padding.left + 4}
                y={panels.volume.y + 12}
                fill="#64748B"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                VOLUME ({volumeScale.max.toLocaleString()})
              </text>

              {visibleData.map((d, i) => {
                const x = getX(i);
                const isUp = d.close >= d.open;
                const y = volumeScale.getY(d.volume || 0);
                const h = Math.max(1, panels.volume!.y + panels.volume!.height - y);
                const w = Math.max(2, candleWidth * 0.65);

                return (
                  <rect
                    key={d.timestamp}
                    x={x - w / 2}
                    y={y}
                    width={w}
                    height={h}
                    fill={isUp ? 'url(#volUpGrad)' : 'url(#volDownGrad)'}
                    rx="1"
                  />
                );
              })}
            </g>
          )}

          {/* SUBPANEL: RSI (Layout A) */}
          {panels.sub && panels.sub.type === 'rsi' && (
            <g className="rsi-panel">
              <line
                x1={panels.padding.left}
                y1={panels.sub.y}
                x2={dimensions.width - panels.padding.right}
                y2={panels.sub.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text
                x={panels.padding.left + 4}
                y={panels.sub.y + 12}
                fill="#93C5FD"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                RSI (14)
              </text>

              {/* 70 Overbought line */}
              <line
                x1={panels.padding.left}
                y1={rsiScale.getY(70)}
                x2={dimensions.width - panels.padding.right}
                y2={rsiScale.getY(70)}
                stroke="rgba(239, 68, 68, 0.4)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={dimensions.width - panels.padding.right + 6}
                y={rsiScale.getY(70) + 3}
                fill="#EF4444"
                fontSize="8"
                fontFamily="JetBrains Mono"
              >
                70
              </text>

              {/* 30 Oversold line */}
              <line
                x1={panels.padding.left}
                y1={rsiScale.getY(30)}
                x2={dimensions.width - panels.padding.right}
                y2={rsiScale.getY(30)}
                stroke="rgba(34, 197, 94, 0.4)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={dimensions.width - panels.padding.right + 6}
                y={rsiScale.getY(30) + 3}
                fill="#22C55E"
                fontSize="8"
                fontFamily="JetBrains Mono"
              >
                30
              </text>

              {/* RSI Curve */}
              <path
                d={visibleData
                  .map((d, i) => {
                    if (d.rsi === null) return '';
                    return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${rsiScale.getY(d.rsi)}`;
                  })
                  .filter(Boolean)
                  .join(' ')}
                stroke="#93C5FD"
                strokeWidth="1.5"
                fill="none"
              />
            </g>
          )}

          {/* SUBPANEL: MACD (Layout C) */}
          {panels.sub && panels.sub.type === 'macd' && (
            <g className="macd-panel">
              <line
                x1={panels.padding.left}
                y1={panels.sub.y}
                x2={dimensions.width - panels.padding.right}
                y2={panels.sub.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text
                x={panels.padding.left + 4}
                y={panels.sub.y + 12}
                fill="#38BDF8"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                MACD (12, 26, 9)
              </text>

              {/* Zero line */}
              <line
                x1={panels.padding.left}
                y1={macdScale.zeroY}
                x2={dimensions.width - panels.padding.right}
                y2={macdScale.zeroY}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="1"
              />

              {/* Histogram bars */}
              {visibleData.map((d, i) => {
                if (d.macdHist === null) return null;
                const x = getX(i);
                const isPos = d.macdHist >= 0;
                const yTop = isPos ? macdScale.getY(d.macdHist) : macdScale.zeroY;
                const h = Math.max(1, Math.abs(macdScale.getY(d.macdHist) - macdScale.zeroY));
                const w = Math.max(2, candleWidth * 0.5);
                return (
                  <rect
                    key={d.timestamp}
                    x={x - w / 2}
                    y={yTop}
                    width={w}
                    height={h}
                    fill={isPos ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'}
                    rx="1"
                  />
                );
              })}

              {/* MACD Line */}
              <path
                d={visibleData
                  .map((d, i) => {
                    if (d.macdLine === null) return '';
                    return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${macdScale.getY(d.macdLine)}`;
                  })
                  .filter(Boolean)
                  .join(' ')}
                stroke="#38BDF8"
                strokeWidth="1.5"
                fill="none"
              />

              {/* Signal Line */}
              <path
                d={visibleData
                  .map((d, i) => {
                    if (d.macdSignal === null) return '';
                    return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${macdScale.getY(d.macdSignal)}`;
                  })
                  .filter(Boolean)
                  .join(' ')}
                stroke="#F43F5E"
                strokeWidth="1.2"
                strokeDasharray="2 2"
                fill="none"
              />
            </g>
          )}

          {/* SUBPANEL: ORDER BOOK DEPTH LIQUIDITY (Layout B) */}
          {panels.sub && panels.sub.type === 'depth' && orderBookDepthData && (
            <g className="depth-panel">
              <line
                x1={panels.padding.left}
                y1={panels.sub.y}
                x2={dimensions.width - panels.padding.right}
                y2={panels.sub.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text
                x={panels.padding.left + 4}
                y={panels.sub.y + 12}
                fill="#10B981"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                ORDER BOOK DEPTH
              </text>
              {/* Bids green area */}
              <path
                d={`M ${panels.padding.left} ${panels.sub.y + panels.sub.height} L ${dimensions.width * 0.48} ${panels.sub.y + 15} L ${dimensions.width * 0.48} ${panels.sub.y + panels.sub.height} Z`}
                fill="rgba(34, 197, 94, 0.15)"
                stroke="#22C55E"
                strokeWidth="1.5"
              />
              {/* Asks red area */}
              <path
                d={`M ${dimensions.width * 0.52} ${panels.sub.y + 15} L ${dimensions.width - panels.padding.right} ${panels.sub.y + panels.sub.height} L ${dimensions.width * 0.52} ${panels.sub.y + panels.sub.height} Z`}
                fill="rgba(239, 68, 68, 0.15)"
                stroke="#EF4444"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* 4. FINANCIAL CROSSHAIR LINES & FLOATING AXIS LABELS */}
          {crosshair.visible && (
            <g className="crosshair-layer pointer-events-none">
              {/* Vertical Crosshair Line */}
              <line
                x1={crosshair.x}
                y1={panels.main.y}
                x2={crosshair.x}
                y2={dimensions.height - panels.padding.bottom}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.8"
              />

              {/* Horizontal Crosshair Line */}
              <line
                x1={panels.padding.left}
                y1={crosshair.y}
                x2={dimensions.width - panels.padding.right}
                y2={crosshair.y}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.8"
              />

              {/* Crosshair Price Box on Y-Axis */}
              {crosshair.y <= panels.main.y + panels.main.height && (
                <g>
                  <rect
                    x={dimensions.width - panels.padding.right + 2}
                    y={crosshair.y - 9}
                    width={58}
                    height={18}
                    rx={4}
                    fill="#1E1B4B"
                    stroke="#3B82F6"
                    strokeWidth="1"
                  />
                  <text
                    x={dimensions.width - panels.padding.right + 31}
                    y={crosshair.y + 4}
                    fill="#FFFFFF"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatPrice(
                      priceScale.max -
                        ((crosshair.y - panels.main.y) / panels.main.height) * priceScale.range
                    )}
                  </text>
                </g>
              )}

              {/* Crosshair Time Box on X-Axis */}
              {hoveredCandle && (
                <g>
                  <rect
                    x={crosshair.x - 36}
                    y={dimensions.height - 18}
                    width={72}
                    height={16}
                    rx={4}
                    fill="#1E1B4B"
                    stroke="#3B82F6"
                    strokeWidth="1"
                  />
                  <text
                    x={crosshair.x}
                    y={dimensions.height - 6}
                    fill="#FFFFFF"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatTime(hoveredCandle.timestamp)}
                  </text>
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* 5. INDICATORS CONFIGURATION MODAL / BOTTOM SHEET */}
      {showIndicatorsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0B0F19] border border-white/10 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">Technical Indicators</h3>
              </div>
              <button
                onClick={() => setShowIndicatorsModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-[#64748B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'aiForecast', label: 'AI Forecast Bands', desc: 'Predictive corridor & TP/SL' },
                { key: 'sma20', label: 'SMA 20', desc: 'Fast trend line' },
                { key: 'sma50', label: 'SMA 50', desc: 'Slow trend line' },
                { key: 'ema9', label: 'EMA 9', desc: 'Short momentum' },
                { key: 'vwap', label: 'VWAP', desc: 'Volume weighted' },
                { key: 'bollinger', label: 'Bollinger Bands', desc: 'StdDev 20, 2' },
                { key: 'rsi', label: 'RSI (14)', desc: 'Oscillator panel' },
                { key: 'macd', label: 'MACD (12,26,9)', desc: 'Histogram & signals' },
                { key: 'ichimoku', label: 'Ichimoku Cloud', desc: 'Trend equilibrium' },
                { key: 'volume', label: 'Volume Subpanel', desc: 'Color coded bars' },
              ].map((item) => {
                const active = indicators[item.key as keyof IndicatorConfig];
                return (
                  <button
                    key={item.key}
                    onClick={() =>
                      setIndicators((prev) => ({
                        ...prev,
                        [item.key]: !prev[item.key as keyof IndicatorConfig],
                      }))
                    }
                    className={cn(
                      'flex items-start justify-between p-3 rounded-xl border text-left transition-all min-h-[56px]',
                      active
                        ? 'bg-blue-600/15 border-blue-500/30 text-white'
                        : 'bg-white/[0.02] border-white/5 text-[#94A3B8] hover:bg-white/5'
                    )}
                  >
                    <div>
                      <div className="font-bold text-xs">{item.label}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{item.desc}</div>
                    </div>
                    {active && <Check className="w-4 h-4 text-blue-400 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowIndicatorsModal(false)}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition-all"
              >
                Apply Indicators
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalChart;
