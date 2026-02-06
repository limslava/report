import { PlanningSegment } from '../types/planning-v2.types';
import { SUMMARY_ROLES, SEGMENT_BY_ROLE } from './roles';

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

export function canViewFinancialPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'financer';
}

export function canEditFinancialPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'financer';
}

export function canManageFinancialVat(role?: string | null): boolean {
  return role === 'admin';
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
