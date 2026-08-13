import { create } from 'zustand';
import { getHhBadges } from '../services/hh.api';
import type { HhBadgesDto } from '../types/hh';

/**
 * Счётчики задач подбора для бейджей в левом меню.
 * Устроен как contract-unread-store: опрос раз в минуту + обновление
 * при возврате фокуса и по событию requestHhBadgesRefresh().
 */
type HhBadgesState = {
  badges: HhBadgesDto;
  startedForUserId: string | null;
  start: (userId: string) => void;
  stop: () => void;
  refresh: () => Promise<void>;
};

const EMPTY_BADGES: HhBadgesDto = {
  role: 'requester',
  newRequests: 0,
  pendingDecisions: 0,
  interviewsToday: 0,
  total: 0,
};

const POLL_INTERVAL_MS = 60_000;
const REFRESH_EVENT = 'hh-badges:refresh';

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

const useHhBadgesStore = create<HhBadgesState>((set, get) => {
  const refresh = async () => {
    if (!running) return;
    try {
      const response = await getHhBadges();
      if (!running) return;
      const data = response.data;
      set({
        badges: {
          role: data?.role === 'recruiter' ? 'recruiter' : 'requester',
          newRequests: Number(data?.newRequests || 0),
          pendingDecisions: Number(data?.pendingDecisions || 0),
          interviewsToday: Number(data?.interviewsToday || 0),
          total: Number(data?.total || 0),
        },
      });
    } catch {
      // тихо игнорируем — старый бэкенд без /hh/badges или сетевая ошибка
    }
  };

  return {
    badges: EMPTY_BADGES,
    startedForUserId: null,
    refresh,
    start: (userId: string) => {
      if (running && get().startedForUserId === userId) return;
      clearRuntime();
      running = true;
      set({ startedForUserId: userId, badges: EMPTY_BADGES });
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
      set({ startedForUserId: null, badges: EMPTY_BADGES });
    },
  };
});

/** Дёрнуть пересчёт бейджей после действия пользователя (решение по кандидату и т.п.). */
export const requestHhBadgesRefresh = () => {
  window.dispatchEvent(new Event(REFRESH_EVENT));
};

export default useHhBadgesStore;
