import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { PlanningDailyValue } from '../models/planning-daily-value.model';
import { PlanningMetric } from '../models/planning-metric.model';
import { PlanningMonthlyPlan } from '../models/planning-monthly-plan.model';
import { PlanningMonthlyPlanMetric } from '../models/planning-monthly-plan-metric.model';
import { PlanningSegment } from '../models/planning-segment.model';
import { PLANNING_FULL_ACCESS_ROLES } from '../constants/roles';
import {
  PlanningMetricAggregation,
  PlanningMetricValueType,
  PlanningPlanMetricCode,
  PlanningRole,
  PlanningSegmentCode,
  SEGMENT_MANAGER_ROLE,
} from '../models/planning.enums';

export interface BatchValueUpdate {
  date: string;
  metricCode: string;
  value: number | null;
}

export interface BatchUpsertPayload {
  segmentCode: PlanningSegmentCode;
  year: number;
  month: number;
  updates: BatchValueUpdate[];
}

const FULL_ACCESS_ROLES = new Set<string>(PLANNING_FULL_ACCESS_ROLES);

const LEGACY_SEGMENT_ROLE: Record<string, PlanningSegmentCode | null> = {
  container_vladivostok: PlanningSegmentCode.KTK_VVO,
  container_moscow: PlanningSegmentCode.KTK_MOW,
  autotruck: PlanningSegmentCode.AUTO,
  railway: PlanningSegmentCode.RAIL,
  additional: PlanningSegmentCode.EXTRA,
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function hasSegmentAccess(role: string, segmentCode: PlanningSegmentCode): boolean {
  if (FULL_ACCESS_ROLES.has(role)) {
    return true;
  }

  const legacySegment = LEGACY_SEGMENT_ROLE[role];
  if (legacySegment && legacySegment === segmentCode) {
    return true;
  }

  const managerRole = SEGMENT_MANAGER_ROLE[segmentCode];
  return role === managerRole;
}

export class PlanningV2Service {
  private readonly segmentRepo = AppDataSource.getRepository(PlanningSegment);
  private readonly metricRepo = AppDataSource.getRepository(PlanningMetric);
  private readonly valuesRepo = AppDataSource.getRepository(PlanningDailyValue);
  private readonly monthlyPlanRepo = AppDataSource.getRepository(PlanningMonthlyPlan);
  private readonly monthlyMetricRepo = AppDataSource.getRepository(PlanningMonthlyPlanMetric);

  async bootstrapCatalog(): Promise<void> {
    const segments: Array<{ code: PlanningSegmentCode; name: string }> = [
      { code: PlanningSegmentCode.KTK_VVO, name: 'Контейнерные перевозки - Владивосток' },
      { code: PlanningSegmentCode.KTK_MOW, name: 'Контейнерные перевозки - Москва' },
      { code: PlanningSegmentCode.AUTO, name: 'Отправка авто' },
      { code: PlanningSegmentCode.RAIL, name: 'ЖД' },
      { code: PlanningSegmentCode.EXTRA, name: 'Доп.услуги' },
      { code: PlanningSegmentCode.TO, name: 'ТО авто' },
    ];

    const metricsBySegment: Record<PlanningSegmentCode, Array<Omit<PlanningMetric, 'id' | 'segment' | 'values' | 'createdAt' | 'updatedAt'>>> = {
      [PlanningSegmentCode.KTK_VVO]: [
        this.metricSeed('ktk_vvo_plan_unload_load', 'Выгрузка/погрузка - план', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 5),
        this.metricSeed('ktk_vvo_plan_move', 'Перемещение - план', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 6),
        this.metricSeed('ktk_vvo_plan_total_per_day', 'Итого в день - план', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'KTK_PLAN_TOTAL_PER_DAY', 7),
        this.metricSeed('ktk_vvo_fact_unload_load', 'Выгрузка/погрузка (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
        this.metricSeed('ktk_vvo_fact_move', 'Перемещение (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 20),
        this.metricSeed('ktk_vvo_fact_total_per_day', 'Итого в день (Факт)', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'KTK_TOTAL_PER_DAY', 30),
        this.metricSeed('ktk_vvo_fact_trucks_on_line', 'ТС на линии (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.AVG, null, 40),
        this.metricSeed('ktk_vvo_manual_gross', 'Вал. Общий (₽)', true, PlanningMetricValueType.CURRENCY, PlanningMetricAggregation.SUM, null, 50),
      ],
      [PlanningSegmentCode.KTK_MOW]: [
        this.metricSeed('ktk_mow_plan_unload_load', 'Выгрузка/погрузка - план', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 5),
        this.metricSeed('ktk_mow_plan_move', 'Перемещение - план', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 6),
        this.metricSeed('ktk_mow_plan_total_per_day', 'Итого в день - план', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'KTK_PLAN_TOTAL_PER_DAY', 7),
        this.metricSeed('ktk_mow_fact_unload_load', 'Выгрузка/погрузка (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
        this.metricSeed('ktk_mow_fact_move', 'Перемещение (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 20),
        this.metricSeed('ktk_mow_fact_total_per_day', 'Итого в день (Факт)', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'KTK_TOTAL_PER_DAY', 30),
        this.metricSeed('ktk_mow_fact_trucks_on_line', 'ТС на линии (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.AVG, null, 40),
        this.metricSeed('ktk_mow_manual_gross', 'Вал. Общий (₽)', true, PlanningMetricValueType.CURRENCY, PlanningMetricAggregation.SUM, null, 50),
      ],
      [PlanningSegmentCode.AUTO]: [
        this.metricSeed('auto_truck_received', 'Автовоз - Принято', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
        this.metricSeed('auto_truck_sent', 'Автовоз - Отправлено', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 20),
        this.metricSeed('auto_truck_waiting', 'Автовоз - В ожидании', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_WAITING_TRUCK', 30),
        this.metricSeed('auto_ktk_received', 'КТК - Принято', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 40),
        this.metricSeed('auto_ktk_sent', 'КТК - Отправлено', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 50),
        this.metricSeed('auto_ktk_waiting', 'Авто в ктк - В ожидании', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_WAITING_KTK', 60),
        this.metricSeed('auto_curtain_received', 'Штора - Принято', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 70),
        this.metricSeed('auto_curtain_sent', 'Штора - Отправлено', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 80),
        this.metricSeed('auto_curtain_waiting', 'Штора - В ожидании', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_WAITING_CURTAIN', 90),
        this.metricSeed('auto_total_received', 'Итого - Принято', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_TOTAL_RECEIVED', 100),
        this.metricSeed('auto_total_sent', 'Итого - Отправлено', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_TOTAL_SENT', 110),
        this.metricSeed('auto_total_waiting', 'Итого - В ожидании', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'AUTO_TOTAL_WAITING', 120),
        this.metricSeed('auto_manual_debt_overload', 'Задолженность перегруз (₽)', true, PlanningMetricValueType.CURRENCY, PlanningMetricAggregation.LAST, null, 200),
        this.metricSeed('auto_manual_debt_cashback', 'Задолженность кэшбек (₽)', true, PlanningMetricValueType.CURRENCY, PlanningMetricAggregation.LAST, null, 210),
      ],
      [PlanningSegmentCode.RAIL]: [
        this.metricSeed('rail_from_vvo_20', 'Из Владивостока - 20', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
        this.metricSeed('rail_from_vvo_40', 'Из Владивостока - 40', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 20),
        this.metricSeed('rail_from_vvo_total', 'Из Владивостока - Итого', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'RAIL_FROM_VVO_TOTAL', 30),
        this.metricSeed('rail_to_vvo_20', 'Во Владивосток - 20', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 40),
        this.metricSeed('rail_to_vvo_40', 'Во Владивосток - 40', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 50),
        this.metricSeed('rail_to_vvo_total', 'Во Владивосток - Итого', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'RAIL_TO_VVO_TOTAL', 60),
        this.metricSeed('rail_total', 'ЖД - Итого', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'RAIL_TOTAL', 70),
      ],
      [PlanningSegmentCode.EXTRA]: [
        this.metricSeed('extra_groupage', 'Сборный груз', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
        this.metricSeed('extra_curtains', 'Шторы (тенты)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 20),
        this.metricSeed('extra_forwarding', 'Экспедирование', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 30),
        this.metricSeed('extra_repack', 'Перетарки/доукрепление', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 40),
        this.metricSeed('extra_total', 'Итог', false, PlanningMetricValueType.INT, PlanningMetricAggregation.FORMULA, 'EXTRA_TOTAL', 50),
      ],
      [PlanningSegmentCode.TO]: [
        this.metricSeed('to_count', 'ТО авто (Факт)', true, PlanningMetricValueType.INT, PlanningMetricAggregation.SUM, null, 10),
      ],
    };

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const defaultPlanBySegment: Record<PlanningSegmentCode, { params?: Record<string, unknown>; metrics: Array<{ code: PlanningPlanMetricCode; basePlan: number; carryPlan: number; carryMode: string }> }> = {
      [PlanningSegmentCode.KTK_VVO]: {
        metrics: [{ code: PlanningPlanMetricCode.KTK_PLAN_REQUESTS, basePlan: 850, carryPlan: 850, carryMode: 'NONE' }],
      },
      [PlanningSegmentCode.KTK_MOW]: {
        metrics: [{ code: PlanningPlanMetricCode.KTK_PLAN_REQUESTS, basePlan: 392, carryPlan: 392, carryMode: 'NONE' }],
      },
      [PlanningSegmentCode.AUTO]: {
        params: {
          waitingStart: { truck: 51, ktk: 11, curtain: 1 },
          waitingTotalStart: 63,
        },
        metrics: [
          { code: PlanningPlanMetricCode.AUTO_PLAN_TRUCK, basePlan: 258, carryPlan: 258, carryMode: 'NONE' },
          { code: PlanningPlanMetricCode.AUTO_PLAN_KTK, basePlan: 162, carryPlan: 162, carryMode: 'NONE' },
        ],
      },
      [PlanningSegmentCode.RAIL]: {
        metrics: [{ code: PlanningPlanMetricCode.RAIL_PLAN_KTK, basePlan: 91, carryPlan: 91, carryMode: 'NONE' }],
      },
      [PlanningSegmentCode.EXTRA]: {
        metrics: [],
      },
      [PlanningSegmentCode.TO]: {
        metrics: [{ code: PlanningPlanMetricCode.TO_PLAN, basePlan: 50, carryPlan: 50, carryMode: 'NONE' }],
      },
    };

    for (const segmentSeed of segments) {
      let segment = await this.segmentRepo.findOne({ where: { code: segmentSeed.code } });
      if (!segment) {
        segment = this.segmentRepo.create(segmentSeed);
      } else {
        segment.name = segmentSeed.name;
      }
      segment = await this.segmentRepo.save(segment);

      const metricSeeds = metricsBySegment[segment.code];
      for (const metricSeed of metricSeeds) {
        let metric = await this.metricRepo.findOne({
          where: { segmentId: segment.id, code: metricSeed.code },
        });

        if (!metric) {
          metric = this.metricRepo.create({ ...metricSeed, segmentId: segment.id });
        } else {
          metric.name = metricSeed.name;
          metric.isEditable = metricSeed.isEditable;
          metric.valueType = metricSeed.valueType;
          metric.aggregation = metricSeed.aggregation;
          metric.formula = metricSeed.formula;
          metric.orderIndex = metricSeed.orderIndex;
        }

        await this.metricRepo.save(metric);
      }

      let monthlyPlan = await this.monthlyPlanRepo.findOne({
        where: { segmentId: segment.id, year, month },
      });

      const planSeed = defaultPlanBySegment[segment.code];
      if (!monthlyPlan) {
        monthlyPlan = this.monthlyPlanRepo.create({
          segmentId: segment.id,
          year,
          month,
          params: planSeed.params ?? null,
        });
      } else if (planSeed.params) {
        monthlyPlan.params = planSeed.params;
      }

      monthlyPlan = await this.monthlyPlanRepo.save(monthlyPlan);

      for (const metricPlanSeed of planSeed.metrics) {
        let monthlyMetric = await this.monthlyMetricRepo.findOne({
          where: { planMonthlyId: monthlyPlan.id, code: metricPlanSeed.code },
        });

        if (!monthlyMetric) {
          monthlyMetric = this.monthlyMetricRepo.create({
            planMonthlyId: monthlyPlan.id,
            code: metricPlanSeed.code,
            basePlan: metricPlanSeed.basePlan,
            carryPlan: metricPlanSeed.carryPlan,
            carryMode: metricPlanSeed.carryMode,
            meta: null,
          });
        } else {
          monthlyMetric.basePlan = metricPlanSeed.basePlan;
          monthlyMetric.carryPlan = metricPlanSeed.carryPlan;
          monthlyMetric.carryMode = metricPlanSeed.carryMode;
        }

        await this.monthlyMetricRepo.save(monthlyMetric);
      }
    }
  }

  async getSegmentsForRole(role: string): Promise<PlanningSegment[]> {
    const allSegments = await this.segmentRepo.find({ order: { name: 'ASC' } });
    return allSegments.filter((segment) => hasSegmentAccess(role, segment.code));
  }

  async getSegmentByCode(segmentCode: PlanningSegmentCode): Promise<PlanningSegment | null> {
    return this.segmentRepo.findOne({ where: { code: segmentCode } });
  }

  async getMetricsBySegmentCode(segmentCode: PlanningSegmentCode): Promise<PlanningMetric[]> {
    const segment = await this.getSegmentByCode(segmentCode);
    if (!segment) {
      return [];
    }

    return this.metricRepo.find({
      where: { segmentId: segment.id },
      order: { orderIndex: 'ASC' },
    });
  }

  async getValuesByMonth(segmentCode: PlanningSegmentCode, year: number, month: number): Promise<Array<{ date: string; metricCode: string; value: number | null }>> {
    const segment = await this.getSegmentByCode(segmentCode);
    if (!segment) {
      return [];
    }

    const metrics = await this.metricRepo.find({ where: { segmentId: segment.id } });
    const metricMap = new Map(metrics.map((metric) => [metric.id, metric.code]));

    const fromDate = new Date(Date.UTC(year, month - 1, 1));
    const toDate = new Date(Date.UTC(year, month, 0));

    const rows = await this.valuesRepo
      .createQueryBuilder('value')
      .where('value.segment_id = :segmentId', { segmentId: segment.id })
      .andWhere('value.date BETWEEN :fromDate AND :toDate', {
        fromDate: toIsoDate(fromDate),
        toDate: toIsoDate(toDate),
      })
      .getMany();

    return rows.map((row) => ({
      date: toIsoDate(row.date),
      metricCode: metricMap.get(row.metricId) ?? '',
      value: row.value === null ? null : Number(row.value),
    })).filter((row) => row.metricCode !== '');
  }

  async batchUpsertValues(user: User, payload: BatchUpsertPayload): Promise<{ updated: number }> {
    const segment = await this.segmentRepo.findOne({ where: { code: payload.segmentCode } });
    if (!segment) {
      throw new Error('Segment not found');
    }

    if (!this.canEditSegment(user.role, payload.segmentCode)) {
      throw new Error('No permission to edit this segment');
    }

    const metrics = await this.metricRepo.find({ where: { segmentId: segment.id } });
    const metricByCode = new Map(metrics.map((metric) => [metric.code, metric]));

    const filteredUpdates = payload.updates.filter((update) => {
      const metric = metricByCode.get(update.metricCode);
      return Boolean(metric?.isEditable);
    });

    if (filteredUpdates.length === 0) {
      return { updated: 0 };
    }

    await AppDataSource.transaction(async (manager) => {
      for (const update of filteredUpdates) {
        const metric = metricByCode.get(update.metricCode);
        if (!metric) {
          continue;
        }

        const date = parseDate(update.date);
        if (date.getUTCFullYear() !== payload.year || date.getUTCMonth() + 1 !== payload.month) {
          throw new Error(`Date ${update.date} is outside requested period`);
        }

        if (update.value === null) {
          await manager.delete(PlanningDailyValue, {
            date,
            metricId: metric.id,
          });
          continue;
        }

        await manager.upsert(
          PlanningDailyValue,
          {
            date,
            segmentId: segment.id,
            metricId: metric.id,
            value: update.value.toFixed(2),
            updatedById: user.id,
          },
          ['date', 'metricId']
        );
      }
    });

    return { updated: filteredUpdates.length };
  }

  canViewSegment(role: string, segmentCode: PlanningSegmentCode): boolean {
    return hasSegmentAccess(role, segmentCode);
  }

  canEditSegment(role: string, segmentCode: PlanningSegmentCode): boolean {
    if (FULL_ACCESS_ROLES.has(role)) {
      return role === PlanningRole.ADMIN;
    }

    const legacySegment = LEGACY_SEGMENT_ROLE[role];
    if (legacySegment) {
      return legacySegment === segmentCode;
    }

    return role === SEGMENT_MANAGER_ROLE[segmentCode];
  }

  private metricSeed(
    code: string,
    name: string,
    isEditable: boolean,
    valueType: PlanningMetricValueType,
    aggregation: PlanningMetricAggregation,
    formula: string | null,
    orderIndex: number
  ): Omit<PlanningMetric, 'id' | 'segment' | 'values' | 'createdAt' | 'updatedAt'> {
    return {
      segmentId: '',
      code,
      name,
      isEditable,
      valueType,
      aggregation,
      formula,
      orderIndex,
    };
  }
}

export const planningV2Service = new PlanningV2Service();
