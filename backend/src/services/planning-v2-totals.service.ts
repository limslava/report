import { AppDataSource } from '../config/data-source';
import { PlanningMonthlyPlan } from '../models/planning-monthly-plan.model';
import { PlanningMonthlyPlanMetric } from '../models/planning-monthly-plan-metric.model';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';
import { PlanningSegment } from '../models/planning-segment.model';
import { planningV2ReportService } from './planning-v2-report.service';

interface TotalsConfig {
  segmentCode: PlanningSegmentCode;
  segmentName: string;
  planMetricCode: PlanningPlanMetricCode | null;
  planMetricName: string;
  factMetricCodes: string[];
  kind: 'PLAN_FLOW' | 'FACT_ONLY';
}

export interface YearTotalsMonthCell {
  month: number;
  basePlan: number;
  carryPlan: number;
  fact: number;
  completionPct: number;
}

export interface YearTotalsRow {
  rowId: string;
  segmentCode: PlanningSegmentCode;
  segmentName: string;
  planMetricCode: PlanningPlanMetricCode | null;
  planMetricName: string;
  kind: 'PLAN_FLOW' | 'FACT_ONLY';
  months: YearTotalsMonthCell[];
  yearlyBasePlan: number;
  yearlyCarryPlan: number;
  yearlyFact: number;
  yearlyCompletionPct: number;
}

const TOTALS_CONFIG: TotalsConfig[] = [
  {
    segmentCode: PlanningSegmentCode.KTK_VVO,
    segmentName: 'Контейнерные перевозки - Владивосток',
    planMetricCode: PlanningPlanMetricCode.KTK_PLAN_REQUESTS,
    planMetricName: 'План заявок (КТК ВВО)',
    factMetricCodes: ['ktk_vvo_fact_total_per_day'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.KTK_MOW,
    segmentName: 'Контейнерные перевозки - Москва',
    planMetricCode: PlanningPlanMetricCode.KTK_PLAN_REQUESTS,
    planMetricName: 'План заявок (КТК МСК)',
    factMetricCodes: ['ktk_mow_fact_total_per_day'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.AUTO,
    segmentName: 'Отправка авто',
    planMetricCode: PlanningPlanMetricCode.AUTO_PLAN_TRUCK,
    planMetricName: 'План месяц Автовозы (автовоз + шторы)',
    factMetricCodes: ['auto_truck_sent', 'auto_curtain_sent'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.AUTO,
    segmentName: 'Отправка авто',
    planMetricCode: PlanningPlanMetricCode.AUTO_PLAN_KTK,
    planMetricName: 'План месяц Авто КТК',
    factMetricCodes: ['auto_ktk_sent'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.RAIL,
    segmentName: 'ЖД',
    planMetricCode: PlanningPlanMetricCode.RAIL_PLAN_KTK,
    planMetricName: 'План месяц ЖД',
    factMetricCodes: ['rail_total'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.TO,
    segmentName: 'ТО авто',
    planMetricCode: PlanningPlanMetricCode.TO_PLAN,
    planMetricName: 'План месяц ТО авто',
    factMetricCodes: ['to_count'],
    kind: 'PLAN_FLOW',
  },
  {
    segmentCode: PlanningSegmentCode.EXTRA,
    segmentName: 'Доп.услуги',
    planMetricCode: null,
    planMetricName: 'Сборный груз',
    factMetricCodes: ['extra_groupage'],
    kind: 'FACT_ONLY',
  },
  {
    segmentCode: PlanningSegmentCode.EXTRA,
    segmentName: 'Доп.услуги',
    planMetricCode: null,
    planMetricName: 'Шторы (тенты)',
    factMetricCodes: ['extra_curtains'],
    kind: 'FACT_ONLY',
  },
  {
    segmentCode: PlanningSegmentCode.EXTRA,
    segmentName: 'Доп.услуги',
    planMetricCode: null,
    planMetricName: 'Экспедирование',
    factMetricCodes: ['extra_forwarding'],
    kind: 'FACT_ONLY',
  },
  {
    segmentCode: PlanningSegmentCode.EXTRA,
    segmentName: 'Доп.услуги',
    planMetricCode: null,
    planMetricName: 'Перетарки/доукрепление',
    factMetricCodes: ['extra_repack'],
    kind: 'FACT_ONLY',
  },
];

function pct(fact: number, plan: number): number {
  if (plan <= 0) {
    return 0;
  }
  return (fact / plan) * 100;
}

function safeNumber(value: number | null | undefined): number {
  return value ?? 0;
}

function buildClassicCarryPlans(basePlans: number[], facts: number[]): number[] {
  const carryPlans = Array.from({ length: 12 }, () => 0);
  let debt = 0;

  for (let idx = 0; idx < 12; idx += 1) {
    const base = safeNumber(basePlans[idx]);
    // Классический перенос:
    // план месяца = база месяца + накопленный долг по плану из прошлых месяцев.
    const carry = base + debt;
    carryPlans[idx] = carry;

    // Перевыполнение не создает "кредит", только гасит долг до нуля.
    const fact = safeNumber(facts[idx]);
    debt = Math.max(0, carry - fact);
  }

  return carryPlans;
}

export class PlanningV2TotalsService {
  private readonly segmentRepo = AppDataSource.getRepository(PlanningSegment);
  private readonly monthlyPlanRepo = AppDataSource.getRepository(PlanningMonthlyPlan);
  private readonly monthlyPlanMetricRepo = AppDataSource.getRepository(PlanningMonthlyPlanMetric);

  async getYearTotals(year: number): Promise<YearTotalsRow[]> {
    const rows: YearTotalsRow[] = [];

    for (const config of TOTALS_CONFIG) {
      const monthMetricMap = config.planMetricCode
        ? (await this.ensureYearPlanMetrics(year, config.segmentCode, config.planMetricCode)).monthMetricMap
        : new Map<number, PlanningMonthlyPlanMetric>();
      const segment = await this.segmentRepo.findOne({ where: { code: config.segmentCode } });
      if (!segment) {
        continue;
      }
      const facts = await this.getFactsForYear(config.segmentCode, config.factMetricCodes, year);

      const months: YearTotalsMonthCell[] = [];
      const basePlans = Array.from({ length: 12 }, (_, idx) => {
        const metric = monthMetricMap.get(idx + 1);
        return config.kind === 'PLAN_FLOW' ? safeNumber(metric?.basePlan) : 0;
      });
      const carryPlans = config.kind === 'PLAN_FLOW'
        ? buildClassicCarryPlans(basePlans, facts)
        : Array.from({ length: 12 }, () => 0);

      for (let month = 1; month <= 12; month += 1) {
        const basePlan = basePlans[month - 1];
        const fact = facts[month - 1];
        const carryPlan = carryPlans[month - 1];

        const completionPct = config.kind === 'PLAN_FLOW'
          ? pct(fact, month === 1 ? basePlan : carryPlan)
          : 0;

        months.push({
          month,
          basePlan,
          carryPlan,
          fact,
          completionPct,
        });

      }

      const yearlyBasePlan = months.reduce((acc, month) => acc + month.basePlan, 0);
      // В годовом итоге "План с переносом" показываем как сумму базовых планов.
      const yearlyCarryPlan = config.kind === 'PLAN_FLOW' ? yearlyBasePlan : 0;
      const yearlyFact = months.reduce((acc, month) => acc + month.fact, 0);

      rows.push({
        rowId: `${config.segmentCode}:${config.planMetricCode ?? config.factMetricCodes.join('+')}`,
        segmentCode: config.segmentCode,
        segmentName: config.segmentName,
        planMetricCode: config.planMetricCode,
        planMetricName: config.planMetricName,
        kind: config.kind,
        months,
        yearlyBasePlan,
        yearlyCarryPlan,
        yearlyFact,
        yearlyCompletionPct: config.kind === 'PLAN_FLOW' ? pct(yearlyFact, yearlyCarryPlan) : 0,
      });
    }

    return rows;
  }

  async updateBasePlan(input: {
    year: number;
    month: number;
    segmentCode: PlanningSegmentCode;
    planMetricCode: PlanningPlanMetricCode;
    basePlan: number;
  }): Promise<{ message: string }> {
    const { year, month, segmentCode, planMetricCode, basePlan } = input;

    const config = TOTALS_CONFIG.find(
      (item) => item.segmentCode === segmentCode && item.planMetricCode === planMetricCode
    );
    if (!config || config.kind !== 'PLAN_FLOW') {
      throw new Error('This metric does not support base plan editing');
    }

    await AppDataSource.transaction(async (manager) => {
      const segment = await manager.findOne(PlanningSegment, { where: { code: segmentCode } });
      if (!segment) {
        throw new Error('Segment not found');
      }

      let monthlyPlan = await manager.findOne(PlanningMonthlyPlan, {
        where: { segmentId: segment.id, year, month },
      });

      if (!monthlyPlan) {
        monthlyPlan = manager.create(PlanningMonthlyPlan, {
          segmentId: segment.id,
          year,
          month,
          params: null,
        });
        monthlyPlan = await manager.save(monthlyPlan);
      }

      let monthlyMetric = await manager.findOne(PlanningMonthlyPlanMetric, {
        where: { planMonthlyId: monthlyPlan.id, code: planMetricCode },
      });

      if (!monthlyMetric) {
        monthlyMetric = manager.create(PlanningMonthlyPlanMetric, {
          planMonthlyId: monthlyPlan.id,
          code: planMetricCode,
          basePlan,
          carryPlan: basePlan,
          carryMode: 'ROLL_OVER',
          meta: null,
        });
      } else {
        monthlyMetric.basePlan = basePlan;
      }

      await manager.save(monthlyMetric);
    });

    await this.recalculateCarryPlans(year, segmentCode, planMetricCode);

    return { message: 'Base plan updated' };
  }

  private async recalculateCarryPlans(year: number, segmentCode: PlanningSegmentCode, planMetricCode: PlanningPlanMetricCode): Promise<void> {
    const config = TOTALS_CONFIG.find(
      (item) => item.segmentCode === segmentCode && item.planMetricCode === planMetricCode
    );
    if (!config) {
      return;
    }

    const { monthMetricMap } = await this.ensureYearPlanMetrics(year, segmentCode, planMetricCode);
    const facts = await this.getFactsForYear(segmentCode, config.factMetricCodes, year);
    const basePlans = Array.from({ length: 12 }, (_, idx) => {
      const metric = monthMetricMap.get(idx + 1);
      return safeNumber(metric?.basePlan);
    });
    const carryPlans = buildClassicCarryPlans(basePlans, facts);

    for (let month = 1; month <= 12; month += 1) {
      const metric = monthMetricMap.get(month);
      if (!metric) {
        continue;
      }

      metric.carryPlan = carryPlans[month - 1];
      metric.carryMode = 'ROLL_OVER';
      await this.monthlyPlanMetricRepo.save(metric);

    }
  }

  private async ensureYearPlanMetrics(
    year: number,
    segmentCode: PlanningSegmentCode,
    planMetricCode: PlanningPlanMetricCode
  ): Promise<{ segment: PlanningSegment; monthMetricMap: Map<number, PlanningMonthlyPlanMetric> }> {
    const segment = await this.segmentRepo.findOne({ where: { code: segmentCode } });
    if (!segment) {
      throw new Error('Segment not found');
    }

    const monthMetricMap = new Map<number, PlanningMonthlyPlanMetric>();

    for (let month = 1; month <= 12; month += 1) {
      let monthlyPlan = await this.monthlyPlanRepo.findOne({
        where: { segmentId: segment.id, year, month },
      });

      if (!monthlyPlan) {
        monthlyPlan = this.monthlyPlanRepo.create({
          segmentId: segment.id,
          year,
          month,
          params: null,
        });
        monthlyPlan = await this.monthlyPlanRepo.save(monthlyPlan);
      }

      let monthlyMetric = await this.monthlyPlanMetricRepo.findOne({
        where: { planMonthlyId: monthlyPlan.id, code: planMetricCode },
      });

      if (!monthlyMetric) {
        monthlyMetric = this.monthlyPlanMetricRepo.create({
          planMonthlyId: monthlyPlan.id,
          code: planMetricCode,
          basePlan: 0,
          carryPlan: 0,
          carryMode: 'ROLL_OVER',
          meta: null,
        });
        monthlyMetric = await this.monthlyPlanMetricRepo.save(monthlyMetric);
      }

      monthMetricMap.set(month, monthlyMetric);
    }

    return { segment, monthMetricMap };
  }

  private async getFactsForYear(segmentCode: PlanningSegmentCode, factMetricCodes: string[], year: number): Promise<number[]> {
    const facts: number[] = [];

    for (let month = 1; month <= 12; month += 1) {
      const report = await planningV2ReportService.getSegmentReport({ segmentCode, year, month });
      const monthFact = factMetricCodes.reduce((acc, metricCode) => {
        const row = report.gridRows.find((item) => item.metricCode === metricCode);
        return acc + (row ? row.monthTotal : 0);
      }, 0);
      facts.push(monthFact);
    }

    return facts;
  }
}

export const planningV2TotalsService = new PlanningV2TotalsService();
