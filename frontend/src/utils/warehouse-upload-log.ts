/**
 * Журнал загрузок фото склада ТС — для разбора проблем «в поле».
 *
 * Каждое значимое событие жизненного цикла фото (подготовка, старт, успех,
 * ретрай, зависание, ошибка) пишется в IndexedDB на устройстве кладовщика.
 * Кнопка «Скопировать отчёт» собирает последние события с контекстом
 * устройства в текст — кладовщик присылает его в чат, и проблему можно
 * разбирать без доступа к телефону. Приём подсмотрен в проекте учёта ТС,
 * где без такого журнала удалённая отладка загрузок была невозможна.
 */

const DB_NAME = 'report-warehouse-upload-log';
const DB_VERSION = 1;
const STORE_NAME = 'events';
const MAX_EVENTS = 600;
const REPORT_EVENTS = 250;

export interface UploadLogEvent {
  id?: number;
  ts: number;
  event: string;
  detail?: string;
}

const openLogDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
  };
});

let pruneCounter = 0;

/** Пишет событие; никогда не бросает — журнал не должен ломать загрузку. */
export const logUploadEvent = (event: string, detail?: unknown): void => {
  void (async () => {
    try {
      const db = await openLogDb();
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record: UploadLogEvent = {
          ts: Date.now(),
          event,
          detail: detail === undefined
            ? undefined
            : typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500),
        };
        store.add(record);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          resolve();
        };
      });
      pruneCounter += 1;
      if (pruneCounter >= 50) {
        pruneCounter = 0;
        await pruneUploadLog();
      }
    } catch {
      // журнал недоступен (приватный режим и т.п.) — молча пропускаем
    }
  })();
};

const listUploadLog = async (): Promise<UploadLogEvent[]> => {
  const db = await openLogDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as UploadLogEvent[]);
    transaction.oncomplete = () => db.close();
  });
};

const pruneUploadLog = async (): Promise<void> => {
  try {
    const events = await listUploadLog();
    if (events.length <= MAX_EVENTS) return;
    const excess = events
      .sort((a, b) => a.ts - b.ts)
      .slice(0, events.length - MAX_EVENTS);
    const db = await openLogDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      excess.forEach((event) => {
        if (event.id != null) store.delete(event.id);
      });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // не смогли почистить — не критично
  }
};

const formatTs = (ts: number): string => new Date(ts).toLocaleString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Текстовый отчёт: контекст устройства + последние события журнала. */
export const buildUploadReport = async (): Promise<string> => {
  const lines: string[] = [
    '=== Отчёт о загрузке фото (Report, склад ТС) ===',
    `Сформирован: ${formatTs(Date.now())}`,
    `Адрес: ${window.location.href}`,
    `Браузер: ${navigator.userAgent}`,
    `Сеть: ${navigator.onLine ? 'онлайн' : 'ОФЛАЙН'}`,
    '',
  ];
  try {
    const events = await listUploadLog();
    const recent = events.sort((a, b) => a.ts - b.ts).slice(-REPORT_EVENTS);
    if (recent.length === 0) {
      lines.push('Журнал пуст.');
    } else {
      recent.forEach((event) => {
        lines.push(`${formatTs(event.ts)}  ${event.event}${event.detail ? ` — ${event.detail}` : ''}`);
      });
    }
  } catch (error) {
    lines.push(`Журнал недоступен: ${error instanceof Error ? error.message : String(error)}`);
  }
  return lines.join('\n');
};

/** Копирует отчёт в буфер; возвращает текст (для fallback-показа). */
export const copyUploadReport = async (): Promise<string> => {
  const report = await buildUploadReport();
  try {
    await navigator.clipboard.writeText(report);
  } catch {
    // clipboard недоступен (не-HTTPS или старый браузер) — вызывающий покажет текст
  }
  return report;
};
