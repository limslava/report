import { PlanningV2TotalsService } from './planning-v2-totals.service';
import { PlanningMonthlyPlanMetric } from '../models/planning-monthly-plan-metric.model';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';

function createMonthlyMetric(month: number, basePlan: number): PlanningMonthlyPlanMetric {
  return {
    id: `metric-${month}`,
    planMonthlyId: `plan-${month}`,
    planMonthly: undefined as never,
    code: PlanningPlanMetricCode.KTK_PLAN_REQUESTS,
    basePlan,
    carryPlan: 0,
    carryMode: 'ROLL_OVER',
    meta: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('PlanningV2TotalsService', () => {
  it('builds year totals with classic carry from previous month base underperformance', async () => {
    const service = new PlanningV2TotalsService() as any;

    const monthMetricMap = new Map<number, PlanningMonthlyPlanMetric>();
    for (let month = 1; month <= 12; month += 1) {
      const basePlan = month <= 3 ? 100 : 0;
      monthMetricMap.set(month, createMonthlyMetric(month, basePlan));
    }

    service.ensureYearPlanMetrics = jest.fn().mockResolvedValue({ monthMetricMap });
    service.getFactsForYear = jest.fn().mockResolvedValue([80, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    service.segmentRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'segment-1', name: 'Контейнерные перевозки - Владивосток' }),
    };

    const rows = await service.getYearTotals(2026);
    const target = rows.find(
      (row: any) =>
        row.segmentCode === PlanningSegmentCode.KTK_VVO &&
        row.planMetricCode === PlanningPlanMetricCode.KTK_PLAN_REQUESTS
    );

    expect(target).toBeDefined();
    expect(target.months[0].carryPlan).toBe(100);
    expect(target.months[1].carryPlan).toBe(120);
    expect(target.months[2].carryPlan).toBe(100);
  });

  it('recalculates and persists classic carry plans', async () => {
    const service = new PlanningV2TotalsService() as any;

    const monthMetricMap = new Map<number, PlanningMonthlyPlanMetric>();
    for (let month = 1; month <= 12; month += 1) {
      const basePlan = month <= 3 ? 100 : 0;
      monthMetricMap.set(month, createMonthlyMetric(month, basePlan));
    }

    const saveMock = jest.fn().mockImplementation(async (metric: PlanningMonthlyPlanMetric) => metric);

    service.ensureYearPlanMetrics = jest.fn().mockResolvedValue({ monthMetricMap });
    service.getFactsForYear = jest.fn().mockResolvedValue([80, 150, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    service.monthlyPlanMetricRepo = { save: saveMock };

    await service.recalculateCarryPlans(
      2026,
      PlanningSegmentCode.KTK_VVO,
      PlanningPlanMetricCode.KTK_PLAN_REQUESTS
    );

    expect(monthMetricMap.get(1)?.carryPlan).toBe(100);
    expect(monthMetricMap.get(2)?.carryPlan).toBe(120);
    expect(monthMetricMap.get(3)?.carryPlan).toBe(100);
    expect(saveMock).toHaveBeenCalled();
  });
});
