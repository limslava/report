import { create } from 'zustand';
import { getContractDiscussionUnreadTotal } from '../services/api';

type ContractUnreadState = {
  unreadCount: number;
  startedForUserId: string | null;
  start: (userId: string) => void;
  stop: () => void;
  refresh: () => Promise<void>;
};

const POLL_INTERVAL_MS = 60_000;
const REFRESH_EVENT = 'contract-unread:refresh';

let pollTimer: number | null = null;
let focusHandler: (() => void) | null = null;
let refreshHandler: (() => void) | null = null;
let running = false;

const clearRuntime = () => {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler);
    focusHandler = null;
  }
  if (refreshHandler) {
    window.removeEventListener(REFRESH_EVENT, refreshHandler);
    refreshHandler = null;
  }
};

const useContractUnreadStore = create<ContractUnreadState>((set, get) => {
  const refresh = async () => {
    if (!running) return;
    try {
      const response = await getContractDiscussionUnreadTotal();
      if (!running) return;
      set({ unreadCount: Number(response.data?.total || 0) });
    } catch {
      // тихо игнорируем — счётчик обновится на следующем тике
    }
  };

  return {
    unreadCount: 0,
    startedForUserId: null,
    refresh,
    start: (userId: string) => {
      if (running && get().startedForUserId === userId) return;
      clearRuntime();
      running = true;
      set({ startedForUserId: userId, unreadCount: 0 });
      void refresh();
      pollTimer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
      focusHandler = () => { if (document.visibilityState === 'visible') void refresh(); };
      refreshHandler = () => { void refresh(); };
      window.addEventListener('focus', focusHandler);
      window.addEventListener(REFRESH_EVENT, refreshHandler);
    },
    stop: () => {
      running = false;
      clearRuntime();
      set({ startedForUserId: null, unreadCount: 0 });
    },
  };
});

export const requestContractUnreadRefresh = () => {
  window.dispatchEvent(new Event(REFRESH_EVENT));
};

export default useContractUnreadStore;
