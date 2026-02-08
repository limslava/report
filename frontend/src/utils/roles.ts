import { PlanningSegment } from '../types/planning-v2.types';

export const SUMMARY_ROLES = new Set(['admin', 'director', 'financer', 'manager_sales']);

export const SEGMENT_BY_ROLE: Record<string, PlanningSegment['code'] | null> = {
  manager_ktk_vvo: 'KTK_VVO',
  manager_ktk_mow: 'KTK_MOW',
  manager_auto: 'AUTO',
  manager_rail: 'RAIL',
  manager_extra: 'EXTRA',
  manager_to: 'TO',
};
