import { useState, useEffect, useRef, useCallback } from 'react';
import { OrderBook as OrderBookType } from '../types';

export const useWebSocket = (symbolId: string, onOrderBook: (data: OrderBookType) => void, onPriceUpdate: (price: number) => void) => {
  const [connectionState, setConnectionState] = useState<'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('RECONNECTING');
    const ws = new WebSocket(`ws://localhost:3001/?symbol=${symbolId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('CONNECTED');
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ORDER_BOOK') {
          onOrderBook(message.data);
        } else if (message.type === 'TRADE_TICK') {
           onPriceUpdate(message.data.price);
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnectionState('DISCONNECTED');
      const attempts = reconnectAttemptsRef.current;
      const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 5000);
      reconnectAttemptsRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, backoffDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [symbolId, onOrderBook, onPriceUpdate]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  return { connectionState };
};
