import { create } from 'zustand';
import { getNotesUnreadCount } from '../services/notes.api';
import { getPlansWebSocketUrl } from '../services/websocket-url';

type NotesUnreadState = {
  unreadCount: number;
  wsConnected: boolean;
  startedForUserId: string | null;
  start: (userId: string) => void;
  stop: () => void;
  refresh: () => Promise<void>;
  setCount: (count: number) => void;
};

let ws: WebSocket | null = null;
let pollTimer: number | null = null;
let reconnectTimer: number | null = null;
let connectTimer: number | null = null;
let visibilityHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;
let refreshWindowEventHandler: (() => void) | null = null;
let reconnectAttempts = 0;
let running = false;

const clearRuntime = () => {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connectTimer) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  if (visibilityHandler) {
    window.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler);
    focusHandler = null;
  }
  if (refreshWindowEventHandler) {
    window.removeEventListener('notes:unread-refresh', refreshWindowEventHandler);
    refreshWindowEventHandler = null;
  }
  reconnectAttempts = 0;
};

const useNotesUnreadStore = create<NotesUnreadState>((set, get) => {
  const refresh = async () => {
    if (!running) return;
    try {
      const response = await getNotesUnreadCount();
      const count = Number(response.data?.count ?? 0);
      set({ unreadCount: Number.isFinite(count) ? Math.max(0, count) : 0 });
    } catch {
      // keep previous value to avoid UI flicker
    }
  };

  const connectWs = () => {
    if (!running) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const wsUrl = getPlansWebSocketUrl();
    if (!wsUrl) return;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      ws = null;
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      set({ wsConnected: true });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data?.type === 'notes:unread-refresh') {
          void refresh();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      set({ wsConnected: false });
      ws = null;
      if (!running) return;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(() => {
        connectWs();
      }, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  const start = (userId: string) => {
    if (!userId) return;
    if (running && get().startedForUserId === userId) return;

    running = true;
    clearRuntime();
    set({ startedForUserId: userId, wsConnected: false });

    void refresh();
    pollTimer = window.setInterval(() => {
      void refresh();
    }, 60000);

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    focusHandler = () => {
      void refresh();
    };
    refreshWindowEventHandler = () => {
      void refresh();
    };

    window.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('focus', focusHandler);
    window.addEventListener('notes:unread-refresh', refreshWindowEventHandler);

    // Defer WS connect a tick so StrictMode mount->unmount cycle in dev
    // doesn't create a socket only to close it immediately.
    connectTimer = window.setTimeout(() => {
      connectTimer = null;
      connectWs();
    }, 0);
  };

  const stop = () => {
    running = false;
    clearRuntime();
    set({ unreadCount: 0, wsConnected: false, startedForUserId: null });
  };

  const setCount = (count: number) => {
    set({ unreadCount: Math.max(0, Math.floor(count)) });
  };

  return {
    unreadCount: 0,
    wsConnected: false,
    startedForUserId: null,
    start,
    stop,
    refresh,
    setCount,
  };
});

export default useNotesUnreadStore;
