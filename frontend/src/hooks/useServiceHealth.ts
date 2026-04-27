import { useCallback, useEffect, useState } from 'react';

type HealthResult = {
  ok: boolean;
  message?: string;
  latencyMs?: number;
};

const DEFAULT_MESSAGE = 'Сервис временно недоступен. Повторите попытку позже.';

export function useServiceHealth(pollIntervalMs: number = 60000) {
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [statusText, setStatusText] = useState<string | null>(null);

  const applyUnavailable = useCallback((nextMessage?: string) => {
    if (nextMessage) {
      setMessage(nextMessage);
    }
    setIsUnavailable(true);
  }, []);

  const applyOk = useCallback(() => {
    setIsUnavailable(false);
  }, []);

  const checkNow = useCallback(async (): Promise<HealthResult> => {
    try {
      const startedAt = Date.now();
      const response = await fetch('/health/db', { cache: 'no-store' });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const nextMessage = data?.error || data?.message || DEFAULT_MESSAGE;
        applyUnavailable(nextMessage);
        setStatusText(`DOWN: ${nextMessage}`);
        return { ok: false, message: nextMessage, latencyMs };
      }

      applyOk();
      setStatusText(`OK: ${latencyMs}ms`);
      return { ok: true, latencyMs };
    } catch {
      applyUnavailable(DEFAULT_MESSAGE);
      setStatusText(`DOWN: ${DEFAULT_MESSAGE}`);
      return { ok: false, message: DEFAULT_MESSAGE };
    }
  }, [applyOk, applyUnavailable]);

  useEffect(() => {
    const handleUnavailable = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      applyUnavailable(detail?.message);
    };

    const handleOk = () => {
      applyOk();
    };

    window.addEventListener('app:service-unavailable', handleUnavailable as EventListener);
    window.addEventListener('app:service-ok', handleOk);
    return () => {
      window.removeEventListener('app:service-unavailable', handleUnavailable as EventListener);
      window.removeEventListener('app:service-ok', handleOk);
    };
  }, [applyOk, applyUnavailable]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(async () => {
        if (stopped) return;
        const hidden = document.visibilityState === 'hidden';
        if (!hidden) {
          await checkNow();
        }
        schedule(hidden ? Math.max(pollIntervalMs * 5, 300000) : pollIntervalMs);
      }, delayMs);
    };

    void checkNow();
    schedule(pollIntervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkNow();
        schedule(pollIntervalMs);
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopped = true;
      if (timer) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkNow, pollIntervalMs]);

  return {
    isUnavailable,
    message,
    statusText,
    checkNow,
    setIsUnavailable,
  };
}
