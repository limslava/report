import { AppDataSource } from '../config/data-source';
import { UchetTsDailyStat } from '../models/uchet-ts-daily-stat.model';
import { logger } from '../utils/logger';

/**
 * Интеграция с программой учёта ТС (SimpleWozi).
 *
 * Их API: GET {UCHET_TS_API_URL}?from=YYYY-MM-DD&to=YYYY-MM-DD
 * с заголовком X-Api-Key: {UCHET_TS_API_KEY}. Диапазон максимум 90 дней,
 * часовой пояс Asia/Vladivostok, рекомендованный опрос раз в 30–60 минут.
 *
 * Ответ складывается в буферную таблицу uchet_ts_daily_stats (по строке на
 * день). Сырые данные дня сохраняются в raw_payload — если их схема
 * отличается от ожидаемой, разбор подгоняется по этим сырым данным.
 */

export const isUchetTsConfigured = (): boolean =>
  Boolean(process.env.UCHET_TS_API_URL && process.env.UCHET_TS_API_KEY);

export const getUchetTsSyncIntervalMinutes = (): number => {
  const parsed = Number(process.env.UCHET_TS_SYNC_INTERVAL_MINUTES || '60');
  return Number.isFinite(parsed) && parsed >= 5 ? parsed : 60;
};

const toInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const sumNullable = (...values: Array<number | null>): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
};

const pick = (source: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});

interface MappedDay {
  statDate: string;
  ktkReceived: number | null;
  ktkSent: number | null;
  ktkWaiting: number | null;
  autocarrierReceived: number | null;
  autocarrierSent: number | null;
  autocarrierSentOwn: number | null;
  autocarrierSentHired: number | null;
  autocarrierWaiting: number | null;
  curtainReceived: number | null;
  curtainSent: number | null;
  curtainWaiting: number | null;
  rawPayload: unknown;
}

/**
 * Терпимый разбор одного дня из их ответа. Поддерживает две вероятные формы:
 *  1) вложенные объекты по видам транспорта:
 *     { date, autocarrier: {received, sent, sentOwn...}, container: {...}, grid: {...}, curtainTruck: {...} }
 *  2) плоские ключи: { date, autocarrierReceived, containerSent, ... }
 * КТК = контейнер + сетка (решение от 2026-09). Всё нераспознанное остаётся null.
 */
const mapDay = (item: Record<string, unknown>): MappedDay | null => {
  const rawDate = pick(item, 'date', 'day', 'statDate', 'stat_date');
  const statDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : null;
  if (!statDate || !/^\d{4}-\d{2}-\d{2}$/.test(statDate)) return null;

  const auto = asRecord(pick(item, 'autocarrier', 'autoCarrier', 'auto_carrier', 'AUTOCARRIER'));
  const container = asRecord(pick(item, 'container', 'CONTAINER'));
  const grid = asRecord(pick(item, 'grid', 'GRID'));
  const curtain = asRecord(pick(item, 'curtainTruck', 'curtain_truck', 'curtain', 'CURTAIN_TRUCK'));

  const kindValue = (kind: Record<string, unknown>, flatPrefix: string, ...names: string[]): number | null => {
    for (const name of names) {
      const nested = toInt(pick(kind, name));
      if (nested !== null) return nested;
    }
    for (const name of names) {
      const flat = toInt(pick(item, `${flatPrefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`, `${flatPrefix}_${name}`));
      if (flat !== null) return flat;
    }
    return null;
  };

  return {
    statDate,
    ktkReceived: sumNullable(
      kindValue(container, 'container', 'received', 'accepted', 'in'),
      kindValue(grid, 'grid', 'received', 'accepted', 'in'),
    ),
    ktkSent: sumNullable(
      kindValue(container, 'container', 'sent', 'shipped', 'dispatched', 'out'),
      kindValue(grid, 'grid', 'sent', 'shipped', 'dispatched', 'out'),
    ),
    ktkWaiting: sumNullable(
      kindValue(container, 'container', 'waiting', 'onSite', 'remaining'),
      kindValue(grid, 'grid', 'waiting', 'onSite', 'remaining'),
    ),
    autocarrierReceived: kindValue(auto, 'autocarrier', 'received', 'accepted', 'in'),
    autocarrierSent: kindValue(auto, 'autocarrier', 'sent', 'shipped', 'dispatched', 'out'),
    autocarrierSentOwn: kindValue(auto, 'autocarrier', 'sentOwn', 'own', 'ownSent'),
    autocarrierSentHired: kindValue(auto, 'autocarrier', 'sentHired', 'hired', 'hiredSent'),
    autocarrierWaiting: kindValue(auto, 'autocarrier', 'waiting', 'onSite', 'remaining'),
    curtainReceived: kindValue(curtain, 'curtain', 'received', 'accepted', 'in'),
    curtainSent: kindValue(curtain, 'curtain', 'sent', 'shipped', 'dispatched', 'out'),
    curtainWaiting: kindValue(curtain, 'curtain', 'waiting', 'onSite', 'remaining'),
    rawPayload: item,
  };
};

const extractDays = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload.map(asRecord);
  const record = asRecord(payload);
  for (const key of ['days', 'data', 'items', 'results', 'report']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord);
  }
  return [];
};

export const fetchUchetTsRange = async (from: string, to: string): Promise<unknown> => {
  const baseUrl = process.env.UCHET_TS_API_URL!;
  const url = new URL(baseUrl);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const response = await fetch(url.toString(), {
    headers: { 'X-Api-Key': process.env.UCHET_TS_API_KEY! },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Учёт ТС ответил HTTP ${response.status}`);
  }
  return response.json();
};

export interface UchetTsImportResult {
  daysReceived: number;
  daysSaved: number;
}

export const importUchetTsRange = async (from: string, to: string): Promise<UchetTsImportResult> => {
  const payload = await fetchUchetTsRange(from, to);
  const items = extractDays(payload);
  const repository = AppDataSource.getRepository(UchetTsDailyStat);
  let saved = 0;
  for (const item of items) {
    const mapped = mapDay(item);
    if (!mapped) continue;
    const existing = await repository.findOne({ where: { statDate: mapped.statDate } });
    await repository.save(repository.create({
      ...(existing ? { id: existing.id } : {}),
      ...mapped,
      source: 'api',
    }));
    saved += 1;
  }
  logger.info(`Учёт ТС: импорт ${from}..${to} — получено дней: ${items.length}, сохранено: ${saved}`);
  return { daysReceived: items.length, daysSaved: saved };
};

/** Импорт «последних N дней» — задача планировщика. */
export const importUchetTsRecent = async (days = 14): Promise<UchetTsImportResult> => {
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Vladivostok' });
  const fromDate = new Date(today.getTime() - days * 24 * 3600 * 1000);
  return importUchetTsRange(fmt(fromDate), fmt(today));
};
