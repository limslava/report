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
  factOwn: number;
  factHired: number;
  factCurtain: number;
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
  yearlyFactOwn: number;
  yearlyFactHired: number;
  yearlyFactCurtain: number;
  yearlyCompletionPct: number;
}

export interface TechMonthlyPoint {
  month: string;
  plan: number;
  carry_plan?: number;
  fact: number;
  pct: number;
}

export interface TechAprilSegment {
  name: string;
  plan: number;
  fact: number;
  pct: number;
}

export interface TechKpiPayload {
  vvo: {
    plan_month: number;
    fact_month: number;
    completion_month: number;
    gross: number;
    gross_avg: number;
    avg_ticket: number;
  };
  msk: {
    plan_month: number;
    fact_month: number;
    completion_month: number;
    gross: number;
    gross_avg: number;
    avg_ticket: number;
  };
  rail: {
    plan_month: number;
    fact_month: number;
    completion_month: number;
    waiting_total: number;
  };
  auto: {
    waiting_total: number;
    waiting_truck: number;
    waiting_ktk: number;
    waiting_curtain: number;
    debt_delta: number;
  };
  to: {
    plan_month: number;
    fact_month: number;
  };
  extra: {
    total: number;
    groupage: number;
    curtains: number;
    forwarding: number;
    repack: number;
  };
}

export interface PlanningTechDashboardResponse {
  source: string;
  reportDate: string;
  reportDateLabel: string;
  year: number;
  month: number;
  monthly: TechMonthlyPoint[];
  month_segments?: TechAprilSegment[];
  april_segments: TechAprilSegment[];
  kpi: TechKpiPayload;
  checks: Record<string, boolean>;
  computed: {
    total_plan: number;
    total_fact: number;
    total_pct: number;
    auto_pct: number;
    auto_ktk_pct: number;
  };
}
