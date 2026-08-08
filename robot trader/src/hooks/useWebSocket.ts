import { useState, useEffect, useRef, useCallback } from 'react';
import { OrderBook as OrderBookType, OrderBookItem } from '../types';

const buildWebSocketUrl = (symbolId: string): string => {
  const configuredUrl = import.meta.env.VITE_WS_URL?.trim();
  const url = configuredUrl
    ? new URL(configuredUrl, window.location.href)
    : new URL('/ws', window.location.href);

  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  url.searchParams.set('symbol', symbolId);
  return url.toString();
};

const isLevel = (value: unknown): value is OrderBookItem => {
  if (!value || typeof value !== 'object') return false;
  const level = value as Partial<OrderBookItem>;
  return Number.isFinite(level.price) && Number.isFinite(level.quantity) && Number.isFinite(level.count);
};

/** Convert the wire representation into the richer shape consumed by the UI. */
export const normalizeOrderBook = (value: unknown): OrderBookType | null => {
  if (!value || typeof value !== 'object') return null;
  const payload = value as {
    bids?: unknown;
    asks?: unknown;
    timestamp?: unknown;
    isSpoofing?: unknown;
    isSpoofingDetected?: unknown;
  };

  if (!Array.isArray(payload.bids) || !Array.isArray(payload.asks)) return null;
  const bids = payload.bids.filter(isLevel);
  const asks = payload.asks.filter(isLevel);
  if (bids.length !== payload.bids.length || asks.length !== payload.asks.length) return null;

  const buyVolume = bids.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const sellVolume = asks.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const totalVolume = buyVolume + sellVolume;
  const buyRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;

  return {
    bids,
    asks,
    timestamp: Number.isFinite(payload.timestamp) ? Number(payload.timestamp) : Date.now(),
    isSpoofingDetected: Boolean(payload.isSpoofingDetected ?? payload.isSpoofing),
    pressure: totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0,
    queueDynamics: {
      buyVolume,
      sellVolume,
      totalVolume,
      buyRatio,
      isHerdingDetected: Math.abs(buyRatio - 0.5) >= 0.15,
      momentumMultiplier: buyRatio >= 0.65 ? 1.5 : buyRatio <= 0.35 ? 0.67 : 1,
    },
  };
};

export const useWebSocket = (
  symbolId: string,
  onOrderBook: (data: OrderBookType) => void,
  onPriceUpdate: (price: number) => void,
) => {
  const [connectionState, setConnectionState] = useState<'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const disposedRef = useRef(false);

  const connectWebSocket = useCallback(() => {
    if (disposedRef.current || wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    setConnectionState('RECONNECTING');
    const ws = new WebSocket(buildWebSocketUrl(symbolId));
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) {
        ws.close();
        return;
      }
      setConnectionState('CONNECTED');
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'ORDER_BOOK') {
          const orderBook = normalizeOrderBook(message.data);
          if (orderBook) onOrderBook(orderBook);
        } else if (
          (message.type === 'TRADE_TICK' || message.type === 'PRICE_CHANGE') &&
          Number.isFinite(message.data?.price)
        ) {
          onPriceUpdate(Number(message.data.price));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message', error);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnectionState('DISCONNECTED');
      if (disposedRef.current) return;

      const attempts = reconnectAttemptsRef.current++;
      const exponentialDelay = Math.min(1000 * 2 ** attempts, 30_000);
      // Deterministic jitter based on attempt count and symbol hash, no Math.random
      const attemptFactor = (attempts % 5) * 0.08; // 0,0.08,0.16,0.24,0.32
      const jitteredDelay = exponentialDelay * (0.8 + attemptFactor);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, jitteredDelay);
    };

    ws.onerror = () => ws.close();
  }, [symbolId, onOrderBook, onPriceUpdate]);

  useEffect(() => {
    disposedRef.current = false;
    connectWebSocket();
    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connectWebSocket]);

  return { connectionState };
};
