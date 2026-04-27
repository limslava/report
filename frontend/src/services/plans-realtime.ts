import { getPlansWebSocketUrl } from './websocket-url';

type PlansRealtimeListener = (payload: unknown) => void;

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const listeners = new Set<PlansRealtimeListener>();

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (listeners.size === 0) {
    return;
  }
  clearReconnectTimer();
  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    connect();
  }, delay);
}

function connect(): void {
  if (listeners.size === 0) {
    return;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = getPlansWebSocketUrl();
  if (!wsUrl) {
    scheduleReconnect();
    return;
  }

  try {
    ws = new WebSocket(wsUrl);
  } catch {
    ws = null;
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    clearReconnectTimer();
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data as string) as unknown;
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {
          // isolate listener failures from shared socket lifecycle
        }
      });
    } catch {
      // ignore malformed payloads
    }
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function subscribePlansRealtime(listener: PlansRealtimeListener): () => void {
  listeners.add(listener);
  connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) {
      return;
    }

    clearReconnectTimer();
    reconnectAttempts = 0;
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

