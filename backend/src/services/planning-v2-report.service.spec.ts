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
});
