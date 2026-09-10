import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { UchetTsDailyStat } from '../models/uchet-ts-daily-stat.model';
import { PlanningSegmentCode } from '../models/planning.enums';
import { planningV2ReportService } from '../services/planning-v2-report.service';
import {
  getUchetTsSyncIntervalMinutes,
  importUchetTsRecent,
  isUchetTsConfigured,
} from '../services/uchet-ts.service';

/** Метрики сегмента АВТО, которые сверяем с учётом ТС. */
export const UCHET_TS_COMPARED_METRICS = [
  'auto_ktk_received',
  'auto_ktk_sent',
  'auto_ktk_waiting',
  'auto_truck_received',
  'auto_truck_sent',
  'auto_truck_sent_own',
  'auto_truck_sent_hired',
  'auto_truck_waiting',
  'auto_curtain_received',
  'auto_curtain_sent',
  'auto_curtain_waiting',
] as const;

type ComparedMetric = (typeof UCHET_TS_COMPARED_METRICS)[number];

const STAT_FIELD_BY_METRIC: Record<ComparedMetric, keyof UchetTsDailyStat> = {
  auto_ktk_received: 'ktkReceived',
  auto_ktk_sent: 'ktkSent',
  auto_ktk_waiting: 'ktkWaiting',
  auto_truck_received: 'autocarrierReceived',
  auto_truck_sent: 'autocarrierSent',
  auto_truck_sent_own: 'autocarrierSentOwn',
  auto_truck_sent_hired: 'autocarrierSentHired',
  auto_truck_waiting: 'autocarrierWaiting',
  auto_curtain_received: 'curtainReceived',
  auto_curtain_sent: 'curtainSent',
  auto_curtain_waiting: 'curtainWaiting',
};

const monthRange = (year: number, month: number) => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { daysInMonth, from: iso(1), to: iso(daysInMonth), iso };
};

export const getUchetTsComparison = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const { daysInMonth, from, to, iso } = monthRange(year, month);

    const report = await planningV2ReportService.getSegmentReport({
      segmentCode: PlanningSegmentCode.AUTO,
      year,
      month,
      asOfDate: to,
    });
    const manualByMetric = new Map<string, Array<number | null>>();
    for (const row of report.gridRows) {
      if ((UCHET_TS_COMPARED_METRICS as readonly string[]).includes(row.metricCode)) {
        manualByMetric.set(row.metricCode, row.dayValues);
      }
    }

    const stats = await AppDataSource.getRepository(UchetTsDailyStat)
      .createQueryBuilder('stat')
      .where('stat.statDate BETWEEN :from AND :to', { from, to })
      .getMany();
    const statsByDate = new Map(stats.map((stat) => [String(stat.statDate).slice(0, 10), stat]));

    const days = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = iso(day);
      const stat = statsByDate.get(date);
      const manual: Record<string, number | null> = {};
      const uchet: Record<string, number | null> = {};
      for (const code of UCHET_TS_COMPARED_METRICS) {
        manual[code] = manualByMetric.get(code)?.[day - 1] ?? null;
        const value = stat ? stat[STAT_FIELD_BY_METRIC[code]] : null;
        uchet[code] = typeof value === 'number' ? value : null;
      }
      days.push({ date, manual, uchet, hasUchetData: Boolean(stat), uchetSource: stat?.source ?? null });
    }

    res.json({
      year,
      month,
      metrics: UCHET_TS_COMPARED_METRICS,
      days,
      configured: isUchetTsConfigured(),
      syncIntervalMinutes: getUchetTsSyncIntervalMinutes(),
    });
  } catch (error) {
    next(error);
  }
};

export const runUchetTsImport = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isUchetTsConfigured()) {
      res.status(409).json({
        message: 'Интеграция не настроена: задайте UCHET_TS_API_URL и UCHET_TS_API_KEY в окружении бэкенда.',
      });
      return;
    }
    const result = await importUchetTsRecent(30);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Тестовые данные для демонстрации сверки (пока настоящий API не подключён):
 * копирует ручные значения месяца и подмешивает расхождения в ~20% дней.
 */
export const seedUchetTsMock = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const year = Number(req.body.year);
    const month = Number(req.body.month);
    const { daysInMonth, iso, to } = monthRange(year, month);

    const report = await planningV2ReportService.getSegmentReport({
      segmentCode: PlanningSegmentCode.AUTO,
      year,
      month,
      asOfDate: to,
    });
    const manualByMetric = new Map<string, Array<number | null>>();
    for (const row of report.gridRows) {
      if ((UCHET_TS_COMPARED_METRICS as readonly string[]).includes(row.metricCode)) {
        manualByMetric.set(row.metricCode, row.dayValues);
      }
    }

    const repository = AppDataSource.getRepository(UchetTsDailyStat);
    let saved = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = iso(day);
      const valueFor = (code: ComparedMetric): number | null => {
        const manual = manualByMetric.get(code)?.[day - 1];
        if (manual === null || manual === undefined) return null;
        if (Math.random() < 0.2) {
          const delta = Math.random() < 0.5 ? -1 : 1;
          return Math.max(0, Math.round(manual) + delta * (1 + Math.floor(Math.random() * 2)));
        }
        return Math.round(manual);
      };
      const existing = await repository.findOne({ where: { statDate: date } });
      await repository.save(repository.create({
        ...(existing ? { id: existing.id } : {}),
        statDate: date,
        ktkReceived: valueFor('auto_ktk_received'),
        ktkSent: valueFor('auto_ktk_sent'),
        ktkWaiting: valueFor('auto_ktk_waiting'),
        autocarrierReceived: valueFor('auto_truck_received'),
        autocarrierSent: valueFor('auto_truck_sent'),
        autocarrierSentOwn: valueFor('auto_truck_sent_own'),
        autocarrierSentHired: valueFor('auto_truck_sent_hired'),
        autocarrierWaiting: valueFor('auto_truck_waiting'),
        curtainReceived: valueFor('auto_curtain_received'),
        curtainSent: valueFor('auto_curtain_sent'),
        curtainWaiting: valueFor('auto_curtain_waiting'),
        rawPayload: { mock: true },
        source: 'mock',
      }));
      saved += 1;
    }
    res.json({ daysSaved: saved });
  } catch (error) {
    next(error);
  }
};
