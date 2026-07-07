import { PlanningSegment } from '../types/planning-v2.types';
import { SUMMARY_ROLES, SEGMENT_BY_ROLE } from './roles';

const CONTRACT_APPROVAL_ACCESS_ROLES = new Set([
  'admin',
  'general_director',
  'security',
  'lawyer',
  'chief_accountant',
  'financer',
  'secretary',
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
]);

export function canViewSummary(role?: string | null): boolean {
  if (!role) {
    return false;
  }
  return SUMMARY_ROLES.has(role);
}

export function canAccessAdmin(role?: string | null): boolean {
  return role === 'admin';
}

export function canAccessWarehouse(role?: string | null): boolean {
  return role === 'admin'
    || role === 'director'
    || role === 'general_director'
    || role === 'financer'
    || role === 'warehouse_manager'
    || role === 'warehouse_keeper'
    || role === 'counterparty_user';
}

export function canViewTotalsInPlans(role?: string | null): boolean {
  return Boolean(role)
    && role !== 'security'
    && role !== 'lawyer'
    && role !== 'chief_accountant'
    && role !== 'secretary'
    && role !== 'head_hr'
    && role !== 'hr_specialist'
    && role !== 'garage_head'
    && role !== 'garage_head_vvo'
    && role !== 'warehouse_manager_vvo'
    && role !== 'warehouse_manager'
    && role !== 'warehouse_keeper'
    && role !== 'counterparty_user';
}

export function canViewPlans(role?: string | null): boolean {
  return Boolean(role)
    && role !== 'security'
    && role !== 'lawyer'
    && role !== 'chief_accountant'
    && role !== 'secretary'
    && role !== 'head_hr'
    && role !== 'hr_specialist'
    && role !== 'garage_head'
    && role !== 'garage_head_vvo'
    && role !== 'warehouse_manager_vvo'
    && role !== 'warehouse_manager'
    && role !== 'warehouse_keeper'
    && role !== 'counterparty_user';
}

export function canEditTotalsPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'general_director';
}

export function canViewFinancialPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'general_director' || role === 'financer';
}

export function canViewCalendar(role?: string | null): boolean {
  return role === 'admin'
    || role === 'director'
    || role === 'general_director'
    || role === 'manager_auto';
}

export function canAccessContractApproval(role?: string | null): boolean {
  return Boolean(role && CONTRACT_APPROVAL_ACCESS_ROLES.has(role));
}

export function canViewBPDashboard(role?: string | null): boolean {
  return role === 'security' || role === 'lawyer' || role === 'chief_accountant' || role === 'financer' || role === 'secretary';
}

export function canShowBPDashboardMenu(role?: string | null): boolean {
  void role;
  return false;
}

export function canAccessBillOfLading(role?: string | null): boolean {
  return role === 'admin';
}

export function canAccessOperationsPreview(role?: string | null): boolean {
  return (
    role === 'admin' ||
    role === 'manager_ktk_vvo' ||
    role === 'head_ktk_vvo' ||
    role === 'manager_ktk_mow' ||
    role === 'head_ktk_mow' ||
    role === 'head_hr' ||
    role === 'hr_specialist' ||
    role === 'garage_head_vvo' ||
    role === 'garage_head' ||
    role === 'warehouse_manager_vvo' ||
    role === 'manager_to' ||
    role === 'security'
  );
}

export function canViewOperationsEfficiency(role?: string | null): boolean {
  return role === 'director' || role === 'general_director' || role === 'financer';
}

export function canViewTechDashboard(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'general_director' || role === 'financer' || role === 'head_sales';
}

export function canEditFinancialPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'general_director' || role === 'financer';
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

  if (role === 'director' || role === 'general_director' || role === 'manager_sales' || role === 'head_sales') {
    return false;
  }

  return SEGMENT_BY_ROLE[role] === segmentCode;
}
