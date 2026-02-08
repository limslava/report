import { PlanningV2ReportService } from './planning-v2-report.service';
import { PlanningMonthlyPlan } from '../models/planning-monthly-plan.model';
import { PlanningMonthlyPlanMetric } from '../models/planning-monthly-plan-metric.model';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';

function createValuesMap(seed: Record<string, Array<number | null>>): Map<string, Array<number | null>> {
  return new Map(Object.entries(seed));
}

function createMonthlyPlan(
  planMetrics: PlanningMonthlyPlanMetric[],
  params: Record<string, unknown> | null = null
): PlanningMonthlyPlan {
  return {
    id: 'plan-1',
    segmentId: 'segment-1',
    segment: undefined as never,
    year: 2026,
    month: 2,
    params,
    planMetrics,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

function createPlanMetric(code: PlanningPlanMetricCode, basePlan: number | null, carryPlan: number | null): PlanningMonthlyPlanMetric {
  return {
    id: `${code}-id`,
    planMonthlyId: 'plan-1',
    planMonthly: undefined as never,
    code,
    basePlan,
    carryPlan,
    carryMode: null,
    meta: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('PlanningV2ReportService formulas', () => {
  const service = new PlanningV2ReportService();

  it('calculates KTK plan/fact totals per day', () => {
    const valuesByMetric = createValuesMap({
      ktk_vvo_plan_unload_load: [2, 3, 4],
      ktk_vvo_plan_move: [1, 1, 2],
      ktk_vvo_plan_total_per_day: [null, null, null],
      ktk_vvo_fact_unload_load: [1, 2, 3],
      ktk_vvo_fact_move: [2, 2, 2],
      ktk_vvo_fact_total_per_day: [null, null, null],
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.KTK_VVO, valuesByMetric, 3, null);

    expect(valuesByMetric.get('ktk_vvo_plan_total_per_day')).toEqual([3, 4, 6]);
    expect(valuesByMetric.get('ktk_vvo_fact_total_per_day')).toEqual([3, 4, 5]);
  });

  it('calculates AUTO waiting with monthly start params', () => {
    const valuesByMetric = createValuesMap({
      auto_truck_received: [3, 0, 2],
      auto_truck_sent: [1, 2, 0],
      auto_truck_waiting: [null, null, null],
      auto_ktk_received: [2, 1, 1],
      auto_ktk_sent: [1, 0, 3],
      auto_ktk_waiting: [null, null, null],
      auto_curtain_received: [1, 0, 0],
      auto_curtain_sent: [0, 1, 0],
      auto_curtain_waiting: [null, null, null],
      auto_total_received: [null, null, null],
      auto_total_sent: [null, null, null],
      auto_total_waiting: [null, null, null],
    });

    const monthlyPlan = createMonthlyPlan([], {
      waitingStart: { truck: 10, ktk: 5, curtain: 1 },
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.AUTO, valuesByMetric, 3, monthlyPlan);

    expect(valuesByMetric.get('auto_truck_waiting')).toEqual([12, 10, 12]);
    expect(valuesByMetric.get('auto_ktk_waiting')).toEqual([6, 7, 5]);
    expect(valuesByMetric.get('auto_curtain_waiting')).toEqual([2, 1, 1]);
    expect(valuesByMetric.get('auto_total_received')).toEqual([6, 1, 3]);
    expect(valuesByMetric.get('auto_total_sent')).toEqual([2, 3, 3]);
    expect(valuesByMetric.get('auto_total_waiting')).toEqual([20, 18, 18]);
  });

  it('calculates AUTO waiting with null gaps', () => {
    const valuesByMetric = createValuesMap({
      auto_truck_received: [1, null, 2],
      auto_truck_sent: [null, 1, null],
      auto_truck_waiting: [null, null, null],
      auto_ktk_received: [0, 0, 0],
      auto_ktk_sent: [0, 0, 0],
      auto_ktk_waiting: [null, null, null],
      auto_curtain_received: [0, 0, 0],
      auto_curtain_sent: [0, 0, 0],
      auto_curtain_waiting: [null, null, null],
      auto_total_received: [null, null, null],
      auto_total_sent: [null, null, null],
      auto_total_waiting: [null, null, null],
    });

    const monthlyPlan = createMonthlyPlan([], {
      waitingStart: { truck: 5, ktk: 0, curtain: 0 },
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.AUTO, valuesByMetric, 3, monthlyPlan);

    expect(valuesByMetric.get('auto_truck_waiting')).toEqual([6, 5, 7]);
  });

  it('resolves AUTO waiting start from previous month values', async () => {
    const service = new PlanningV2ReportService() as any;

    const metrics = [
      { id: 'm1', code: 'auto_truck_received' },
      { id: 'm2', code: 'auto_truck_sent' },
      { id: 'm3', code: 'auto_ktk_received' },
      { id: 'm4', code: 'auto_ktk_sent' },
      { id: 'm5', code: 'auto_curtain_received' },
      { id: 'm6', code: 'auto_curtain_sent' },
    ];

    const rowsByRange: Record<string, any[]> = {
      '2025-12-01:2025-12-31': [],
      '2026-01-01:2026-01-31': [
        { metricId: 'm1', date: new Date('2026-01-01T00:00:00.000Z'), value: 5 },
        { metricId: 'm2', date: new Date('2026-01-01T00:00:00.000Z'), value: 1 },
        { metricId: 'm1', date: new Date('2026-01-02T00:00:00.000Z'), value: 0 },
        { metricId: 'm2', date: new Date('2026-01-02T00:00:00.000Z'), value: 1 },
        { metricId: 'm1', date: new Date('2026-01-03T00:00:00.000Z'), value: 2 },
        { metricId: 'm2', date: new Date('2026-01-03T00:00:00.000Z'), value: 0 },
        { metricId: 'm3', date: new Date('2026-01-01T00:00:00.000Z'), value: 1 },
        { metricId: 'm4', date: new Date('2026-01-02T00:00:00.000Z'), value: 2 },
        { metricId: 'm5', date: new Date('2026-01-03T00:00:00.000Z'), value: 1 },
      ],
    };

    service.valuesRepo = {
      createQueryBuilder: () => {
        let from = '';
        let to = '';
        const builder = {
          where: () => builder,
          andWhere: (_: string, params: { fromDate: string; toDate: string }) => {
            from = params.fromDate;
            to = params.toDate;
            return builder;
          },
          getMany: async () => rowsByRange[`${from}:${to}`] ?? [],
        };
        return builder;
      },
    };

    const waitingStart = await service.resolveAutoWaitingStart(
      'segment-1',
      metrics,
      2026,
      2
    );

    expect(waitingStart.truck).toBe(5);
    expect(waitingStart.ktk).toBe(-1);
    expect(waitingStart.curtain).toBe(1);
  });

  it('calculates KTK totals with nulls as zeros', () => {
    const valuesByMetric = createValuesMap({
      ktk_vvo_plan_unload_load: [1, null, 3],
      ktk_vvo_plan_move: [null, 2, null],
      ktk_vvo_plan_total_per_day: [null, null, null],
      ktk_vvo_fact_unload_load: [0, 2, null],
      ktk_vvo_fact_move: [1, null, 1],
      ktk_vvo_fact_total_per_day: [null, null, null],
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.KTK_VVO, valuesByMetric, 3, null);

    expect(valuesByMetric.get('ktk_vvo_plan_total_per_day')).toEqual([1, 2, 3]);
    expect(valuesByMetric.get('ktk_vvo_fact_total_per_day')).toEqual([1, 2, 1]);
  });

  it('calculates RAIL totals', () => {
    const valuesByMetric = createValuesMap({
      rail_from_vvo_20: [1, 2, 3],
      rail_from_vvo_40: [4, 5, 6],
      rail_from_vvo_total: [null, null, null],
      rail_to_vvo_20: [2, 0, 1],
      rail_to_vvo_40: [1, 3, 2],
      rail_to_vvo_total: [null, null, null],
      rail_total: [null, null, null],
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.RAIL, valuesByMetric, 3, null);

    expect(valuesByMetric.get('rail_from_vvo_total')).toEqual([5, 7, 9]);
    expect(valuesByMetric.get('rail_to_vvo_total')).toEqual([3, 3, 3]);
    expect(valuesByMetric.get('rail_total')).toEqual([8, 10, 12]);
  });

  it('calculates EXTRA total', () => {
    const valuesByMetric = createValuesMap({
      extra_groupage: [1, 2, 3],
      extra_curtains: [0, 1, 0],
      extra_forwarding: [2, 2, 2],
      extra_repack: [3, 0, 1],
      extra_total: [null, null, null],
    });

    (service as any).applyFormulaRows(PlanningSegmentCode.EXTRA, valuesByMetric, 3, null);

    expect(valuesByMetric.get('extra_total')).toEqual([6, 5, 6]);
  });
});

describe('PlanningV2ReportService dashboard', () => {
  const service = new PlanningV2ReportService();

  it('calculates KTK dashboard KPI from values and monthly plan', () => {
    const valuesByMetric = createValuesMap({
      ktk_vvo_fact_total_per_day: [10, 20, 30],
      ktk_vvo_manual_gross: [100, 200, 300],
      ktk_vvo_fact_trucks_on_line: [2, 4, 6],
    });

    const monthlyPlan = createMonthlyPlan([
      createPlanMetric(PlanningPlanMetricCode.KTK_PLAN_REQUESTS, 850, 280),
    ]);

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.KTK_VVO,
      valuesByMetric,
      monthlyPlan,
      resolvedPlanByCode: new Map(),
      daysInMonth: 28,
      completedDays: 3,
      asOfDate: '2026-02-04',
    });

    expect(dashboard.planMonth).toBe(280);
    expect(dashboard.planToDate).toBeCloseTo(30, 3);
    expect(dashboard.factToDate).toBe(60);
    expect(dashboard.monthFact).toBe(60);
    expect(dashboard.completionToDatePct).toBeCloseTo(200, 3);
    expect(dashboard.avgPerDay).toBe(15);
    expect(dashboard.grossTotal).toBe(300);
    expect(dashboard.grossAvgPerDay).toBe(75);
    expect(dashboard.trucksAvgOnLine).toBe(3);
  });

  it('calculates AUTO dashboard KPI with waiting and debts', () => {
    const valuesByMetric = createValuesMap({
      auto_truck_sent: [1, 2, 3],
      auto_curtain_sent: [0, 1, 0],
      auto_ktk_sent: [2, 2, 2],
      auto_total_waiting: [10, 9, 8],
      auto_truck_waiting: [4, 3, 2],
      auto_ktk_waiting: [5, 5, 5],
      auto_curtain_waiting: [1, 1, 1],
      auto_manual_debt_overload: [100, 110, 120],
      auto_manual_debt_cashback: [50, 55, 60],
    });

    const monthlyPlan = createMonthlyPlan([
      createPlanMetric(PlanningPlanMetricCode.AUTO_PLAN_TRUCK, 30, 30),
      createPlanMetric(PlanningPlanMetricCode.AUTO_PLAN_KTK, 20, 20),
    ]);

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.AUTO,
      valuesByMetric,
      monthlyPlan,
      resolvedPlanByCode: new Map(),
      daysInMonth: 30,
      completedDays: 2,
      asOfDate: '2026-02-03',
    });

    expect(dashboard.planMonth).toBe(50);
    expect(dashboard.factToDate).toBe(13);
    expect(dashboard.waitingTotal).toBe(8);
    expect(dashboard.debtOverload).toBe(120);
    expect(dashboard.debtCashback).toBe(60);
  });

  it('calculates KTK dashboard with zero completed days', () => {
    const valuesByMetric = createValuesMap({
      ktk_vvo_fact_total_per_day: [10, 0, 0],
    });

    const monthlyPlan = createMonthlyPlan([
      createPlanMetric(PlanningPlanMetricCode.KTK_PLAN_REQUESTS, 300, 300),
    ]);

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.KTK_VVO,
      valuesByMetric,
      monthlyPlan,
      resolvedPlanByCode: new Map(),
      daysInMonth: 30,
      completedDays: 0,
      asOfDate: '2026-02-01',
    });

    expect(dashboard.planToDate).toBe(0);
    expect(dashboard.factToDate).toBe(10);
  });

  it('calculates KTK dashboard with completedDays beyond month length', () => {
    const valuesByMetric = createValuesMap({
      ktk_vvo_fact_total_per_day: [10, 10, 10],
      ktk_vvo_manual_gross: [100, 100, 100],
      ktk_vvo_fact_trucks_on_line: [2, 2, 2],
    });

    const monthlyPlan = createMonthlyPlan([
      createPlanMetric(PlanningPlanMetricCode.KTK_PLAN_REQUESTS, 300, 300),
    ]);

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.KTK_VVO,
      valuesByMetric,
      monthlyPlan,
      resolvedPlanByCode: new Map(),
      daysInMonth: 3,
      completedDays: 10,
      asOfDate: '2026-02-03',
    });

    expect(dashboard.factToDate).toBe(30);
    expect(dashboard.planToDate).toBe(300);
  });

  it('calculates RAIL dashboard KPI', () => {
    const valuesByMetric = createValuesMap({
      rail_total: [1, 2, 3],
    });

    const monthlyPlan = createMonthlyPlan([
      createPlanMetric(PlanningPlanMetricCode.RAIL_PLAN_KTK, 90, 90),
    ]);

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.RAIL,
      valuesByMetric,
      monthlyPlan,
      resolvedPlanByCode: new Map(),
      daysInMonth: 28,
      completedDays: 3,
      asOfDate: '2026-02-04',
    });

    expect(dashboard.planMonth).toBe(90);
    expect(dashboard.planToDate).toBe(10);
    expect(dashboard.factToDate).toBe(6);
    expect(dashboard.monthFact).toBe(6);
  });

  it('calculates EXTRA dashboard KPI', () => {
    const valuesByMetric = createValuesMap({
      extra_total: [10, 20, 30],
      extra_groupage: [2, 3, 4],
      extra_curtains: [1, 1, 1],
      extra_forwarding: [2, 2, 2],
      extra_repack: [5, 14, 23],
    });

    const dashboard = (service as any).computeDashboard({
      segmentCode: PlanningSegmentCode.EXTRA,
      valuesByMetric,
      monthlyPlan: null,
      resolvedPlanByCode: new Map(),
      daysInMonth: 28,
      completedDays: 3,
      asOfDate: '2026-02-04',
    });

    expect(dashboard.factToDate).toBe(60);
    expect(dashboard.monthFact).toBe(60);
    expect(dashboard.groupage).toBe(9);
    expect(dashboard.curtains).toBe(3);
    expect(dashboard.forwarding).toBe(6);
    expect(dashboard.repack).toBe(42);
  });
});
