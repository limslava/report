import { AppDataSource } from '../config/data-source';
import { PlanningDailyValue } from '../models/planning-daily-value.model';
import { PlanningMetric } from '../models/planning-metric.model';
import { PlanningMetricAggregation, PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';
import { PlanningMonthlyPlan } from '../models/planning-monthly-plan.model';
import { PlanningMonthlyPlanMetric } from '../models/planning-monthly-plan-metric.model';
import { PlanningSegment } from '../models/planning-segment.model';

interface SegmentReportParams {
  segmentCode: PlanningSegmentCode;
  year: number;
  month: number;
  asOfDate?: string;
}

interface DashboardBase {
  asOfDate: string;
  daysInMonth: number;
  completedDays: number;
}

export interface PlanningGridRow {
  metricCode: string;
  name: string;
  isEditable: boolean;
  aggregation: PlanningMetricAggregation;
  dayValues: Array<number | null>;
  monthTotal: number;
}

export type SegmentDashboard = DashboardBase & Record<string, unknown>;
type SummaryRow = {
  segmentCode: PlanningSegmentCode;
  segmentName: string;
  planMonth: number;
  factToDate: number;
  monthFact: number;
  completionToDate: number;
  completionMonth: number;
  parentSegmentCode?: PlanningSegmentCode;
  detailCode?: string;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(value: number | null | undefined): number {
  return value ?? 0;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((acc, value) => acc + safeNumber(value), 0);
}

function sumUntil(values: Array<number | null>, dayCount: number): number {
  return values.slice(0, dayCount).reduce<number>((acc, value) => acc + safeNumber(value), 0);
}

function avgUntil(values: Array<number | null>, dayCount: number): number {
  if (dayCount <= 0) {
    return 0;
  }

  const total = sumUntil(values, dayCount);
  return total / dayCount;
}

function lastUntil(values: Array<number | null>, dayCount: number): number {
  for (let i = Math.min(dayCount - 1, values.length - 1); i >= 0; i -= 1) {
    if (values[i] !== null) {
      return values[i] as number;
    }
  }
  return 0;
}

function pct(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (part / total) * 100;
}

function isWaitingMetricCode(metricCode: string): boolean {
  return metricCode === 'auto_truck_waiting'
    || metricCode === 'auto_ktk_waiting'
    || metricCode === 'auto_curtain_waiting'
    || metricCode === 'auto_total_waiting';
}

function getPlanValue(planMetricMap: Map<PlanningPlanMetricCode, PlanningMonthlyPlanMetric>, code: PlanningPlanMetricCode): number {
  const planMetric = planMetricMap.get(code);
  if (!planMetric) {
    return 0;
  }

  if (planMetric.carryPlan !== null && planMetric.carryPlan !== undefined) {
    return planMetric.carryPlan;
  }

  return planMetric.basePlan ?? 0;
}

function topLevelSummaryName(segmentCode: PlanningSegmentCode, fallback: string): string {
  if (segmentCode === PlanningSegmentCode.KTK_VVO || segmentCode === PlanningSegmentCode.KTK_MOW) {
    return 'КТК';
  }
  if (segmentCode === PlanningSegmentCode.RAIL) {
    return 'ЖД';
  }
  if (segmentCode === PlanningSegmentCode.TO) {
    return 'ТО авто';
  }
  return fallback;
}

export class PlanningV2ReportService {
  private readonly segmentRepo = AppDataSource.getRepository(PlanningSegment);
  private readonly metricRepo = AppDataSource.getRepository(PlanningMetric);
  private readonly valuesRepo = AppDataSource.getRepository(PlanningDailyValue);
  private readonly monthlyPlanRepo = AppDataSource.getRepository(PlanningMonthlyPlan);

  async getSegmentReport(params: SegmentReportParams): Promise<{
    segment: { code: PlanningSegmentCode; name: string };
    year: number;
    month: number;
    asOfDate: string;
    daysInMonth: number;
    gridRows: PlanningGridRow[];
    dashboard: SegmentDashboard;
  }> {
    const segment = await this.segmentRepo.findOne({ where: { code: params.segmentCode } });
    if (!segment) {
      throw new Error('Segment not found');
    }

    const metrics = await this.metricRepo.find({
      where: { segmentId: segment.id },
      order: { orderIndex: 'ASC' },
    });

    const daysInMonth = getDaysInMonth(params.year, params.month);

    const monthStart = new Date(Date.UTC(params.year, params.month - 1, 1));
    const monthEnd = new Date(Date.UTC(params.year, params.month, 0));

    const rawAsOf = params.asOfDate ? parseIsoDate(params.asOfDate) : new Date();
    const asOfDate = new Date(Date.UTC(rawAsOf.getUTCFullYear(), rawAsOf.getUTCMonth(), rawAsOf.getUTCDate()));

    const effectiveAsOf = new Date(
      Math.min(Math.max(asOfDate.getTime(), monthStart.getTime()), monthEnd.getTime())
    );

    const completedDays = clamp(effectiveAsOf.getUTCDate() - 1, 0, daysInMonth);

    const dailyRows = await this.valuesRepo
      .createQueryBuilder('value')
      .where('value.segment_id = :segmentId', { segmentId: segment.id })
      .andWhere('value.date BETWEEN :fromDate AND :toDate', {
        fromDate: toIsoDate(monthStart),
        toDate: toIsoDate(monthEnd),
      })
      .getMany();

    const valuesByMetric = new Map<string, Array<number | null>>();
    for (const metric of metrics) {
      valuesByMetric.set(metric.code, Array.from({ length: daysInMonth }, () => null));
    }

    const metricById = new Map(metrics.map((metric) => [metric.id, metric]));

    for (const row of dailyRows) {
      const metric = metricById.get(row.metricId);
      if (!metric) {
        continue;
      }
      const rowDate = row.date instanceof Date ? row.date : new Date(String(row.date));
      const day = rowDate.getUTCDate();
      const metricValues = valuesByMetric.get(metric.code);
      if (!metricValues || day < 1 || day > daysInMonth) {
        continue;
      }

      metricValues[day - 1] = row.value === null ? null : Number(row.value);
    }

    const monthlyPlan = await this.monthlyPlanRepo.findOne({
      where: {
        segmentId: segment.id,
        year: params.year,
        month: params.month,
      },
      relations: ['planMetrics'],
    });

    const autoWaitingStart = segment.code === PlanningSegmentCode.AUTO
      ? await this.resolveAutoWaitingStart(segment.id, metrics, params.year, params.month)
      : undefined;

    this.applyFormulaRows(segment.code, valuesByMetric, daysInMonth, monthlyPlan, autoWaitingStart);

    const gridRows: PlanningGridRow[] = metrics.map((metric) => {
      const dayValues = valuesByMetric.get(metric.code) ?? [];

      const monthTotal = (() => {
        if (metric.aggregation === PlanningMetricAggregation.LAST || isWaitingMetricCode(metric.code)) {
          return lastUntil(dayValues, dayValues.length);
        }
        return sum(dayValues);
      })();

      return {
        metricCode: metric.code,
        name: metric.name,
        isEditable: metric.isEditable,
        aggregation: metric.aggregation,
        dayValues,
        monthTotal,
      };
    });

    const dashboard = this.computeDashboard({
      segmentCode: segment.code,
      valuesByMetric,
      monthlyPlan,
      daysInMonth,
      completedDays,
      asOfDate: toIsoDate(effectiveAsOf),
    });

    return {
      segment: { code: segment.code, name: segment.name },
      year: params.year,
      month: params.month,
      asOfDate: toIsoDate(effectiveAsOf),
      daysInMonth,
      gridRows,
      dashboard,
    };
  }


  async getSummaryReport(year: number, month: number, asOfDate?: string, detailed: boolean = false): Promise<SummaryRow[]> {
    const segments = await this.segmentRepo.find({ order: { name: 'ASC' } });
    const items: SummaryRow[] = [];

    for (const segment of segments) {
      const report = await this.getSegmentReport({
        segmentCode: segment.code,
        year,
        month,
        asOfDate,
      });

      const planMonth = Number(report.dashboard.planMonth ?? 0);
      const factToDate = Number(report.dashboard.factToDate ?? 0);
      const monthFact = Number(report.dashboard.monthFact ?? 0);

      const shouldAddTopLevel =
        !detailed ||
        (segment.code !== PlanningSegmentCode.AUTO &&
          segment.code !== PlanningSegmentCode.EXTRA &&
          segment.code !== PlanningSegmentCode.RAIL);

      if (shouldAddTopLevel) {
        items.push({
          segmentCode: segment.code,
          segmentName: topLevelSummaryName(segment.code, segment.name),
          planMonth,
          factToDate,
          monthFact,
          completionToDate: pct(factToDate, Number(report.dashboard.planToDate ?? 0)),
          completionMonth: pct(monthFact, planMonth),
        });
      }

      if (!detailed) {
        continue;
      }

      if (segment.code === PlanningSegmentCode.AUTO) {
        const truck = report.dashboard.truck as Record<string, unknown> | undefined;
        const ktk = report.dashboard.ktk as Record<string, unknown> | undefined;
        const truckSent = report.gridRows.find((row) => row.metricCode === 'auto_truck_sent');
        const ktkSent = report.gridRows.find((row) => row.metricCode === 'auto_ktk_sent');
        const curtainSent = report.gridRows.find((row) => row.metricCode === 'auto_curtain_sent');
        const curtainMonthFact = curtainSent?.monthTotal ?? 0;

        items.push({
          segmentCode: segment.code,
          segmentName: 'Автовозы / Шторы',
          parentSegmentCode: segment.code,
          detailCode: 'AUTO_TRUCK_CURTAIN',
          planMonth: Number(truck?.planMonth ?? 0),
          factToDate: Number(truck?.factToDate ?? 0),
          monthFact: (truckSent?.monthTotal ?? 0) + curtainMonthFact,
          completionToDate: Number(truck?.completionToDatePct ?? 0),
          completionMonth: Number(truck?.completionMonthPct ?? 0),
        });
        items.push({
          segmentCode: segment.code,
          segmentName: 'Авто в ктк',
          parentSegmentCode: segment.code,
          detailCode: 'AUTO_KTK',
          planMonth: Number(ktk?.planMonth ?? 0),
          factToDate: Number(ktk?.factToDate ?? 0),
          monthFact: ktkSent?.monthTotal ?? 0,
          completionToDate: Number(ktk?.completionToDatePct ?? 0),
          completionMonth: Number(ktk?.completionMonthPct ?? 0),
        });
      }

      if (segment.code === PlanningSegmentCode.EXTRA) {
        const detailMetrics = [
          { code: 'extra_groupage', name: 'Доп.услуги • Сборный груз', detailCode: 'EXTRA_GROUPAGE' },
          { code: 'extra_curtains', name: 'Доп.услуги • Шторы (тенты)', detailCode: 'EXTRA_CURTAINS' },
          { code: 'extra_forwarding', name: 'Доп.услуги • Экспедирование', detailCode: 'EXTRA_FORWARDING' },
          { code: 'extra_repack', name: 'Доп.услуги • Перетарки/доукрепление', detailCode: 'EXTRA_REPACK' },
        ];

        for (const metric of detailMetrics) {
          const row = report.gridRows.find((gridRow) => gridRow.metricCode === metric.code);
          items.push({
            segmentCode: segment.code,
            segmentName: metric.name.replace('Доп.услуги • ', '').replace('Перетарки/доукрепление', 'Перетарка/доукрепление'),
            parentSegmentCode: segment.code,
            detailCode: metric.detailCode,
            planMonth: 0,
            factToDate: report.daysInMonth > 0 ? sumUntil(row?.dayValues ?? [], report.dashboard.completedDays as number) : 0,
            monthFact: row?.monthTotal ?? 0,
            completionToDate: 0,
            completionMonth: 0,
          });
        }
      }

      if (segment.code === PlanningSegmentCode.RAIL) {
        items.push({
          segmentCode: segment.code,
          segmentName: 'Из/Во Владивосток',
          parentSegmentCode: segment.code,
          detailCode: 'RAIL_TOTAL_FLOW',
          planMonth: Number(report.dashboard.planMonth ?? 0),
          factToDate: Number(report.dashboard.factToDate ?? 0),
          monthFact: Number(report.dashboard.monthFact ?? 0),
          completionToDate: Number(report.dashboard.completionToDatePct ?? 0),
          completionMonth: Number(report.dashboard.completionMonthPct ?? 0),
        });
      }
    }

    return items;
  }

  private applyFormulaRows(
    segmentCode: PlanningSegmentCode,
    valuesByMetric: Map<string, Array<number | null>>,
    daysInMonth: number,
    monthlyPlan: PlanningMonthlyPlan | null,
    autoWaitingStart?: Record<string, number | undefined>
  ): void {
    if (segmentCode === PlanningSegmentCode.KTK_VVO) {
      this.fillDailySum(valuesByMetric, 'ktk_vvo_plan_total_per_day', ['ktk_vvo_plan_unload_load', 'ktk_vvo_plan_move'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'ktk_vvo_fact_total_per_day', ['ktk_vvo_fact_unload_load', 'ktk_vvo_fact_move'], daysInMonth);
      return;
    }

    if (segmentCode === PlanningSegmentCode.KTK_MOW) {
      this.fillDailySum(valuesByMetric, 'ktk_mow_plan_total_per_day', ['ktk_mow_plan_unload_load', 'ktk_mow_plan_move'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'ktk_mow_fact_total_per_day', ['ktk_mow_fact_unload_load', 'ktk_mow_fact_move'], daysInMonth);
      return;
    }

    if (segmentCode === PlanningSegmentCode.AUTO) {
      const waitingStart = autoWaitingStart ?? (monthlyPlan?.params?.waitingStart ?? {}) as Record<string, number | undefined>;
      this.fillAutoWaiting(valuesByMetric, daysInMonth, waitingStart);
      this.fillDailySum(valuesByMetric, 'auto_total_received', ['auto_truck_received', 'auto_ktk_received', 'auto_curtain_received'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'auto_total_sent', ['auto_truck_sent', 'auto_ktk_sent', 'auto_curtain_sent'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'auto_total_waiting', ['auto_truck_waiting', 'auto_ktk_waiting', 'auto_curtain_waiting'], daysInMonth);
      return;
    }

    if (segmentCode === PlanningSegmentCode.RAIL) {
      this.fillDailySum(valuesByMetric, 'rail_from_vvo_total', ['rail_from_vvo_20', 'rail_from_vvo_40'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'rail_to_vvo_total', ['rail_to_vvo_20', 'rail_to_vvo_40'], daysInMonth);
      this.fillDailySum(valuesByMetric, 'rail_total', ['rail_from_vvo_total', 'rail_to_vvo_total'], daysInMonth);
      return;
    }

    if (segmentCode === PlanningSegmentCode.EXTRA) {
      this.fillDailySum(valuesByMetric, 'extra_total', ['extra_groupage', 'extra_curtains', 'extra_forwarding', 'extra_repack'], daysInMonth);
    }
  }

  private async resolveAutoWaitingStart(
    segmentId: string,
    metrics: PlanningMetric[],
    year: number,
    month: number,
    depth = 0
  ): Promise<Record<string, number | undefined>> {
    if (depth > 36) {
      return { truck: 0, ktk: 0, curtain: 0 };
    }

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);
    const prevStartDate = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
    const prevEndDate = new Date(Date.UTC(prevYear, prevMonth - 1, prevDaysInMonth));

    const prevRows = await this.valuesRepo
      .createQueryBuilder('value')
      .where('value.segment_id = :segmentId', { segmentId })
      .andWhere('value.date BETWEEN :fromDate AND :toDate', {
        fromDate: toIsoDate(prevStartDate),
        toDate: toIsoDate(prevEndDate),
      })
      .getMany();

    if (prevRows.length === 0) {
      // Если предыдущий месяц пустой, берем остаток из более раннего месяца (без обнуления на границе года).
      return this.resolveAutoWaitingStart(segmentId, metrics, prevYear, prevMonth, depth + 1);
    }

    // Важное правило: старт текущего месяца = финальное ожидание прошлого месяца.
    // Не прибавляем "seed/start" повторно, чтобы не удваивать перенос.
    const prevStart = await this.resolveAutoWaitingStart(
      segmentId,
      metrics,
      prevYear,
      prevMonth,
      depth + 1
    );

    const metricById = new Map(metrics.map((metric) => [metric.id, metric.code]));
    const valuesByCode = new Map<string, Array<number | null>>();
    [
      'auto_truck_received',
      'auto_truck_sent',
      'auto_ktk_received',
      'auto_ktk_sent',
      'auto_curtain_received',
      'auto_curtain_sent',
    ].forEach((code) => valuesByCode.set(code, Array.from({ length: prevDaysInMonth }, () => null)));

    for (const row of prevRows) {
      const code = metricById.get(row.metricId);
      if (!code || !valuesByCode.has(code)) {
        continue;
      }
      const rowDate = row.date instanceof Date ? row.date : new Date(String(row.date));
      const day = rowDate.getUTCDate();
      if (day < 1 || day > prevDaysInMonth) {
        continue;
      }
      valuesByCode.get(code)![day - 1] = row.value === null ? null : Number(row.value);
    }

    const calcWaitingEnd = (
      start: number | undefined,
      received: Array<number | null>,
      sent: Array<number | null>
    ): number => {
      let carry = safeNumber(start);
      for (let i = 0; i < prevDaysInMonth; i += 1) {
        carry = carry + safeNumber(received[i]) - safeNumber(sent[i]);
      }
      return carry;
    };

    return {
      truck: calcWaitingEnd(prevStart.truck, valuesByCode.get('auto_truck_received') ?? [], valuesByCode.get('auto_truck_sent') ?? []),
      ktk: calcWaitingEnd(prevStart.ktk, valuesByCode.get('auto_ktk_received') ?? [], valuesByCode.get('auto_ktk_sent') ?? []),
      curtain: calcWaitingEnd(prevStart.curtain, valuesByCode.get('auto_curtain_received') ?? [], valuesByCode.get('auto_curtain_sent') ?? []),
    };
  }

  private fillDailySum(
    valuesByMetric: Map<string, Array<number | null>>,
    targetMetric: string,
    sourceMetrics: string[],
    daysInMonth: number
  ): void {
    const target = valuesByMetric.get(targetMetric);
    if (!target) {
      return;
    }

    for (let day = 0; day < daysInMonth; day += 1) {
      let result = 0;
      for (const source of sourceMetrics) {
        const sourceValues = valuesByMetric.get(source);
        result += safeNumber(sourceValues?.[day]);
      }
      target[day] = result;
    }
  }

  private fillAutoWaiting(
    valuesByMetric: Map<string, Array<number | null>>,
    daysInMonth: number,
    waitingStart: Record<string, number | undefined>
  ): void {
    const configs = [
      {
        received: 'auto_truck_received',
        sent: 'auto_truck_sent',
        waiting: 'auto_truck_waiting',
        start: safeNumber(waitingStart.truck),
      },
      {
        received: 'auto_ktk_received',
        sent: 'auto_ktk_sent',
        waiting: 'auto_ktk_waiting',
        start: safeNumber(waitingStart.ktk),
      },
      {
        received: 'auto_curtain_received',
        sent: 'auto_curtain_sent',
        waiting: 'auto_curtain_waiting',
        start: safeNumber(waitingStart.curtain),
      },
    ];

    for (const cfg of configs) {
      const received = valuesByMetric.get(cfg.received) ?? Array.from({ length: daysInMonth }, () => 0);
      const sent = valuesByMetric.get(cfg.sent) ?? Array.from({ length: daysInMonth }, () => 0);
      const waiting = valuesByMetric.get(cfg.waiting);

      if (!waiting) {
        continue;
      }

      let carry = cfg.start;
      for (let day = 0; day < daysInMonth; day += 1) {
        carry = carry + safeNumber(received[day]) - safeNumber(sent[day]);
        waiting[day] = carry;
      }
    }
  }

  private computeDashboard(params: {
    segmentCode: PlanningSegmentCode;
    valuesByMetric: Map<string, Array<number | null>>;
    monthlyPlan: PlanningMonthlyPlan | null;
    daysInMonth: number;
    completedDays: number;
    asOfDate: string;
  }): SegmentDashboard {
    const { segmentCode, valuesByMetric, monthlyPlan, daysInMonth, completedDays, asOfDate } = params;
    const dataDays = Math.max(1, Math.min(daysInMonth, completedDays + 1));

    const planMetricMap = new Map<PlanningPlanMetricCode, PlanningMonthlyPlanMetric>();
    for (const metric of monthlyPlan?.planMetrics ?? []) {
      planMetricMap.set(metric.code, metric);
    }

    const base: DashboardBase = {
      asOfDate,
      daysInMonth,
      completedDays,
    };

    if (segmentCode === PlanningSegmentCode.KTK_VVO || segmentCode === PlanningSegmentCode.KTK_MOW) {
      const isVvo = segmentCode === PlanningSegmentCode.KTK_VVO;
      const prefix = isVvo ? 'ktk_vvo' : 'ktk_mow';
      const total = valuesByMetric.get(`${prefix}_fact_total_per_day`) ?? [];
      const gross = valuesByMetric.get(`${prefix}_manual_gross`) ?? [];
      const trucks = valuesByMetric.get(`${prefix}_fact_trucks_on_line`) ?? [];

      const planMonth = getPlanValue(planMetricMap, PlanningPlanMetricCode.KTK_PLAN_REQUESTS);
      const planToDate = daysInMonth > 0 ? (planMonth / daysInMonth) * completedDays : 0;
      const factToDate = sumUntil(total, dataDays);
      const monthFact = sum(total);
      const grossToDate = lastUntil(gross, dataDays);

      return {
        ...base,
        planMonth,
        planToDate,
        factToDate,
        monthFact,
        completionMonthPct: pct(monthFact, planMonth),
        completionToDatePct: pct(factToDate, planToDate),
        avgPerDay: dataDays > 0 ? factToDate / dataDays : 0,
        grossTotal: grossToDate,
        grossAvgPerDay: dataDays > 0 ? grossToDate / dataDays : 0,
        trucksAvgOnLine: avgUntil(trucks, dataDays),
      };
    }

    if (segmentCode === PlanningSegmentCode.AUTO) {
      const planTruckMonth = getPlanValue(planMetricMap, PlanningPlanMetricCode.AUTO_PLAN_TRUCK);
      const planKtkMonth = getPlanValue(planMetricMap, PlanningPlanMetricCode.AUTO_PLAN_KTK);

      const planTruckToDate = daysInMonth > 0 ? (planTruckMonth / daysInMonth) * completedDays : 0;
      const planKtkToDate = daysInMonth > 0 ? (planKtkMonth / daysInMonth) * completedDays : 0;

      const truckSent = valuesByMetric.get('auto_truck_sent') ?? [];
      const curtainSent = valuesByMetric.get('auto_curtain_sent') ?? [];
      const ktkSent = valuesByMetric.get('auto_ktk_sent') ?? [];

      // "Автовозы" в отчете = Автовоз + Штора
      const truckFactToDate = sumUntil(truckSent, dataDays) + sumUntil(curtainSent, dataDays);
      const ktkFactToDate = sumUntil(ktkSent, dataDays);

      const waitingTotal = lastUntil(valuesByMetric.get('auto_total_waiting') ?? [], dataDays);
      const waitingTruck = lastUntil(valuesByMetric.get('auto_truck_waiting') ?? [], dataDays);
      const waitingKtk = lastUntil(valuesByMetric.get('auto_ktk_waiting') ?? [], dataDays);
      const waitingCurtain = lastUntil(valuesByMetric.get('auto_curtain_waiting') ?? [], dataDays);

      const debtOverload = lastUntil(valuesByMetric.get('auto_manual_debt_overload') ?? [], dataDays);
      const debtCashback = lastUntil(valuesByMetric.get('auto_manual_debt_cashback') ?? [], dataDays);

      const factToDate = truckFactToDate + ktkFactToDate;
      const planMonth = planTruckMonth + planKtkMonth;
      const planToDate = planTruckToDate + planKtkToDate;
      const monthFact = sum(truckSent) + sum(curtainSent) + sum(ktkSent);

      return {
        ...base,
        planMonth,
        planToDate,
        factToDate,
        monthFact,
        completionMonthPct: pct(monthFact, planMonth),
        completionToDatePct: pct(factToDate, planToDate),
        avgPerDay: dataDays > 0 ? factToDate / dataDays : 0,
        truck: {
          planMonth: planTruckMonth,
          planToDate: planTruckToDate,
          factToDate: truckFactToDate,
          completionMonthPct: pct(sum(truckSent) + sum(curtainSent), planTruckMonth),
          completionToDatePct: pct(truckFactToDate, planTruckToDate),
          avgPerDay: dataDays > 0 ? truckFactToDate / dataDays : 0,
        },
        ktk: {
          planMonth: planKtkMonth,
          planToDate: planKtkToDate,
          factToDate: ktkFactToDate,
          completionMonthPct: pct(sum(ktkSent), planKtkMonth),
          completionToDatePct: pct(ktkFactToDate, planKtkToDate),
          avgPerDay: dataDays > 0 ? ktkFactToDate / dataDays : 0,
        },
        waitingTotal,
        waitingTruck,
        waitingKtk,
        waitingCurtain,
        debtOverload,
        debtCashback,
      };
    }

    if (segmentCode === PlanningSegmentCode.RAIL) {
      const planMonth = getPlanValue(planMetricMap, PlanningPlanMetricCode.RAIL_PLAN_KTK);
      const planToDate = daysInMonth > 0 ? (planMonth / daysInMonth) * completedDays : 0;
      const railTotal = valuesByMetric.get('rail_total') ?? [];
      const factToDate = sumUntil(railTotal, dataDays);
      const monthFact = sum(railTotal);

      return {
        ...base,
        planMonth,
        planToDate,
        factToDate,
        monthFact,
        completionMonthPct: pct(monthFact, planMonth),
        completionToDatePct: pct(factToDate, planToDate),
        avgPerDay: dataDays > 0 ? factToDate / dataDays : 0,
      };
    }

    if (segmentCode === PlanningSegmentCode.TO) {
      const planMonth = getPlanValue(planMetricMap, PlanningPlanMetricCode.TO_PLAN);
      const planToDate = daysInMonth > 0 ? (planMonth / daysInMonth) * completedDays : 0;
      const values = valuesByMetric.get('to_count') ?? [];
      const factToDate = sumUntil(values, dataDays);
      const monthFact = sum(values);

      return {
        ...base,
        planMonth,
        planToDate,
        factToDate,
        monthFact,
        completionMonthPct: pct(monthFact, planMonth),
        completionToDatePct: pct(factToDate, planToDate),
        avgPerDay: dataDays > 0 ? factToDate / dataDays : 0,
      };
    }

    if (segmentCode === PlanningSegmentCode.EXTRA) {
      const total = valuesByMetric.get('extra_total') ?? [];
      const factToDate = sumUntil(total, dataDays);
      const monthFact = sum(total);

      return {
        ...base,
        planMonth: 0,
        planToDate: 0,
        factToDate,
        monthFact,
        completionMonthPct: 0,
        completionToDatePct: 0,
        avgPerDay: dataDays > 0 ? factToDate / dataDays : 0,
        groupage: sumUntil(valuesByMetric.get('extra_groupage') ?? [], dataDays),
        curtains: sumUntil(valuesByMetric.get('extra_curtains') ?? [], dataDays),
        forwarding: sumUntil(valuesByMetric.get('extra_forwarding') ?? [], dataDays),
        repack: sumUntil(valuesByMetric.get('extra_repack') ?? [], dataDays),
      };
    }

    return {
      ...base,
      planMonth: 0,
      planToDate: 0,
      factToDate: 0,
      monthFact: 0,
      completionMonthPct: 0,
      completionToDatePct: 0,
      avgPerDay: 0,
    };
  }
}

export const planningV2ReportService = new PlanningV2ReportService();
