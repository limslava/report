import { PlanningSegment } from '../types/planning-v2.types';

const SUMMARY_ROLES = new Set(['admin', 'director']);

const SEGMENT_BY_ROLE: Record<string, PlanningSegment['code'] | null> = {
  manager_ktk_vvo: 'KTK_VVO',
  manager_ktk_mow: 'KTK_MOW',
  manager_auto: 'AUTO',
  manager_rail: 'RAIL',
  manager_extra: 'EXTRA',
  manager_to: 'TO',
  container_vladivostok: 'KTK_VVO',
  container_moscow: 'KTK_MOW',
  autotruck: 'AUTO',
  railway: 'RAIL',
  additional: 'EXTRA',
};

export function canViewSummary(role?: string | null): boolean {
  if (!role) {
    return false;
  }
  return SUMMARY_ROLES.has(role);
}

export function canAccessAdmin(role?: string | null): boolean {
  return role === 'admin';
}

export function canViewTotalsInPlans(role?: string | null): boolean {
  return Boolean(role);
}

export function canBootstrapPlanning(role?: string | null): boolean {
  return role === 'admin';
}

export function canEditSegment(role: string | undefined, segmentCode: PlanningSegment['code']): boolean {
  if (!role) {
    return false;
  }

  if (role === 'admin') {
    return true;
  }

  if (role === 'director' || role === 'sales' || role === 'manager_sales') {
    return false;
  }

  return SEGMENT_BY_ROLE[role] === segmentCode;
}
