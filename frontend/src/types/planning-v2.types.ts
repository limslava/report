export interface PlanningSegment {
  code: 'KTK_VVO' | 'KTK_MOW' | 'AUTO' | 'RAIL' | 'EXTRA' | 'TO';
  name: string;
}

export interface PlanningGridRow {
  metricCode: string;
  name: string;
  isEditable: boolean;
  aggregation: 'SUM' | 'AVG' | 'LAST' | 'FORMULA';
  dayValues: Array<number | null>;
  monthTotal: number;
}

export interface PlanningSegmentReport {
  segment: PlanningSegment;
  year: number;
  month: number;
  asOfDate: string;
  daysInMonth: number;
  lastUpdatedAt?: string | null;
  gridRows: PlanningGridRow[];
  dashboard: Record<string, unknown>;
}

export interface PlanningSummaryItem {
  segmentCode: PlanningSegment['code'];
  segmentName: string;
  planMonth: number;
  planToDate: number;
  factToDate: number;
  monthFact: number;
  completionToDate: number;
  completionMonth: number;
  parentSegmentCode?: PlanningSegment['code'];
  detailCode?: string;
}

export interface PlanningYearTotalsMonthCell {
  month: number;
  basePlan: number;
  carryPlan: number;
  fact: number;
  completionPct: number;
}

export interface PlanningYearTotalsRow {
  rowId: string;
  segmentCode: PlanningSegment['code'];
  segmentName: string;
  planMetricCode: string | null;
  planMetricName: string;
  kind: 'PLAN_FLOW' | 'FACT_ONLY';
  months: PlanningYearTotalsMonthCell[];
  yearlyBasePlan: number;
  yearlyCarryPlan: number;
  yearlyFact: number;
  yearlyCompletionPct: number;
}
