export enum PlanningSegmentCode {
  KTK_VVO = 'KTK_VVO',
  KTK_MOW = 'KTK_MOW',
  AUTO = 'AUTO',
  RAIL = 'RAIL',
  EXTRA = 'EXTRA',
  TO = 'TO',
}

export enum PlanningMetricValueType {
  INT = 'INT',
  DECIMAL = 'DECIMAL',
  CURRENCY = 'CURRENCY',
}

export enum PlanningMetricAggregation {
  SUM = 'SUM',
  AVG = 'AVG',
  LAST = 'LAST',
  FORMULA = 'FORMULA',
}

export enum PlanningPlanMetricCode {
  KTK_PLAN_REQUESTS = 'KTK_PLAN_REQUESTS',
  AUTO_PLAN_TRUCK = 'AUTO_PLAN_TRUCK',
  AUTO_PLAN_KTK = 'AUTO_PLAN_KTK',
  RAIL_PLAN_KTK = 'RAIL_PLAN_KTK',
  TO_PLAN = 'TO_PLAN',
  EXTRA_PLAN = 'EXTRA_PLAN',
}

export enum PlanningRole {
  ADMIN = 'admin',
  DIRECTOR = 'director',
  SALES = 'sales',
  MANAGER_KTK_VVO = 'manager_ktk_vvo',
  MANAGER_KTK_MOW = 'manager_ktk_mow',
  MANAGER_AUTO = 'manager_auto',
  MANAGER_RAIL = 'manager_rail',
  MANAGER_EXTRA = 'manager_extra',
  MANAGER_TO = 'manager_to',
}

export const SEGMENT_MANAGER_ROLE: Record<PlanningSegmentCode, PlanningRole> = {
  [PlanningSegmentCode.KTK_VVO]: PlanningRole.MANAGER_KTK_VVO,
  [PlanningSegmentCode.KTK_MOW]: PlanningRole.MANAGER_KTK_MOW,
  [PlanningSegmentCode.AUTO]: PlanningRole.MANAGER_AUTO,
  [PlanningSegmentCode.RAIL]: PlanningRole.MANAGER_RAIL,
  [PlanningSegmentCode.EXTRA]: PlanningRole.MANAGER_EXTRA,
  [PlanningSegmentCode.TO]: PlanningRole.MANAGER_TO,
};
