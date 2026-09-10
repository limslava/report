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
 * Разбор одного дня. Реальная схема SimpleWozi (снята с боевого API 11.09.2026):
 * {
 *   date: '2026-09-08',
 *   received: { autocarrier: 2, container: 0, grid: 0, curtain_truck: 0, undefined: 0 },
 *   sent: {
 *     autocarrier: { total: 0, own: 0, hired: 0 },
 *     container: 0, grid: 0, curtain_truck: 0, undefined: 0
 *   }
 * }
 * КТК = контейнер + сетка (решение от 2026-09). «В ожидании» их API не отдаёт —
 * остаётся null (в сверке «—»). Вид «undefined» (без типа) не учитывается.
 */
export const mapDay = (item: Record<string, unknown>): MappedDay | null => {
  const rawDate = pick(item, 'date', 'day', 'statDate', 'stat_date');
  const statDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : null;
  if (!statDate || !/^\d{4}-\d{2}-\d{2}$/.test(statDate)) return null;

  const received = asRecord(pick(item, 'received'));
  const sent = asRecord(pick(item, 'sent'));

  // Значение вида: либо число, либо объект { total, own, hired }
  const kindTotal = (value: unknown): number | null => {
    if (typeof value === 'object' && value !== null) {
      return toInt(pick(asRecord(value), 'total'));
    }
    return toInt(value);
  };
  const sentAuto = pick(sent, 'autocarrier');
  const sentAutoRecord = asRecord(sentAuto);

  return {
    statDate,
    ktkReceived: sumNullable(kindTotal(received.container), kindTotal(received.grid)),
    ktkSent: sumNullable(kindTotal(sent.container), kindTotal(sent.grid)),
    ktkWaiting: null,
    autocarrierReceived: kindTotal(received.autocarrier),
    autocarrierSent: kindTotal(sentAuto),
    autocarrierSentOwn: toInt(pick(sentAutoRecord, 'own')),
    autocarrierSentHired: toInt(pick(sentAutoRecord, 'hired')),
    autocarrierWaiting: null,
    curtainReceived: kindTotal(received.curtain_truck),
    curtainSent: kindTotal(sent.curtain_truck),
    curtainWaiting: null,
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
