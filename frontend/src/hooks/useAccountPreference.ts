import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Личная настройка интерфейса, привязанная к учётной записи (а не к браузеру):
 * столбцы, ширина, закрепление, фильтры, масштаб. Сразу берётся из копии в браузере
 * (без мигания), затем — с сервера. Если на сервере настройки ещё нет, а в браузере есть
 * (было до переноса) — она один раз отправляется на сервер.
 */

type Loaded = Record<string, unknown>;
const loadedByPrefix = new Map<string, Promise<Loaded>>();

const loadPrefix = (prefix: string): Promise<Loaded> => {
  let promise = loadedByPrefix.get(prefix);
  if (!promise) {
    promise = api
      .get<Loaded>('/ui-preferences', { params: { prefix } })
      .then((response) => response.data ?? {})
      .catch(() => {
        loadedByPrefix.delete(prefix);
        return {};
      });
    loadedByPrefix.set(prefix, promise);
  }
  return promise;
};

const readLocal = (key: string): { found: boolean; value: unknown } => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { found: false, value: undefined };
    try {
      return { found: true, value: JSON.parse(raw) };
    } catch {
      return { found: true, value: raw }; // старый формат: строка без JSON
    }
  } catch {
    return { found: false, value: undefined };
  }
};

const writeLocal = (key: string, value: unknown) => {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим — останется на сервере
  }
};

export function useAccountPreference<T>(
  /** ключ настройки на сервере, например 'dj-columns-v1' (пользователь — из токена) */
  key: string,
  userId: string | null | undefined,
  fallback: T,
  /** проверка/приведение значения (битые и старые значения превращаются в fallback) */
  normalize: (value: unknown) => T = (value) => (value === undefined ? fallback : (value as T)),
): [T, (next: T | ((prev: T) => T)) => void] {
  const localKey = `${key}:${userId ?? 'anonymous'}`;
  const [value, setValue] = useState<T>(() => {
    const local = readLocal(localKey);
    return local.found ? normalize(local.value) : fallback;
  });
  const valueRef = useRef(value);
  valueRef.current = value;
  const saveTimerRef = useRef<number | null>(null);
  const touchedRef = useRef(false);
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const prefix = key.split('-').slice(0, 1).join('-') + '-';
    void loadPrefix(prefix).then((loaded) => {
      if (cancelled || touchedRef.current) return;
      if (Object.prototype.hasOwnProperty.call(loaded, key)) {
        const next = normalizeRef.current(loaded[key]);
        writeLocal(localKey, next);
        setValue(next);
        return;
      }
      // на сервере ещё нет — переносим то, что было в этом браузере
      const local = readLocal(localKey);
      if (local.found) void api.put(`/ui-preferences/${encodeURIComponent(key)}`, { value: local.value }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [key, localKey, userId]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next;
    touchedRef.current = true;
    valueRef.current = resolved;
    setValue(resolved);
    writeLocal(localKey, resolved);
    loadedByPrefix.forEach((promise) => {
      void promise.then((loaded) => { loaded[key] = resolved; });
    });
    if (!userId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    // ширину тянут мышью — на сервер уходит последнее значение, а не каждый пиксель
    saveTimerRef.current = window.setTimeout(() => {
      void api.put(`/ui-preferences/${encodeURIComponent(key)}`, { value: resolved ?? null }).catch(() => undefined);
    }, 600);
  }, [key, localKey, userId]);

  return [value, update];
}
