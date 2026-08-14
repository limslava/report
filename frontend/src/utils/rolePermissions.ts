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
  return Boolean(role)
    && role !== 'head_hr'
    && role !== 'hr_specialist'
    && role !== 'garage_head'
    && role !== 'garage_head_vvo'
    && role !== 'warehouse_manager_vvo'
    && role !== 'bdd_specialist_vvo'
    && role !== 'bdd_specialist_mow';
}

export type FuelLocation = 'vvo' | 'mow';

export function fuelLocationsForRole(role?: string | null): FuelLocation[] {
  if (role === 'admin') return ['vvo', 'mow'];
  if (role === 'bdd_specialist_vvo' || role === 'head_ktk_vvo') return ['vvo'];
  if (role === 'bdd_specialist_mow' || role === 'head_ktk_mow') return ['mow'];
  return [];
}

export function canAccessFuel(role?: string | null): boolean {
  return fuelLocationsForRole(role).length > 0;
}

export function directoryLocationsForRole(role?: string | null): FuelLocation[] {
  if (role === 'admin' || role === 'head_hr' || role === 'hr_specialist') return ['vvo', 'mow'];
  if (role === 'head_ktk_vvo' || role === 'manager_ktk_vvo') return ['vvo'];
  if (role === 'head_ktk_mow' || role === 'manager_ktk_mow') return ['mow'];
  return [];
}

export function canAccessDirectories(role?: string | null): boolean {
  return directoryLocationsForRole(role).length > 0;
}

/** Ведение справочников: менеджеры КТК — только просмотр и копирование. */
export function canEditDirectoriesFrontend(role?: string | null): boolean {
  return role === 'admin'
    || role === 'head_hr'
    || role === 'hr_specialist'
    || role === 'head_ktk_vvo'
    || role === 'head_ktk_mow';
}

/** Удаление в справочниках: админ везде, руководитель КТК — свой регион. */
export function canDeleteDirectoryEntryFrontend(role?: string | null, location?: FuelLocation): boolean {
  if (role === 'admin') return true;
  if (role === 'head_ktk_vvo') return location === 'vvo';
  if (role === 'head_ktk_mow') return location === 'mow';
  return false;
}

export function canManageFuelNormsFrontend(role?: string | null): boolean {
  return role === 'admin'
    || role === 'bdd_specialist_vvo'
    || role === 'bdd_specialist_mow'
    || role === 'head_ktk_vvo'
    || role === 'head_ktk_mow';
}

export function canEditTotalsPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director';
}

export function canViewFinancialPlan(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'financer';
}

export function canViewCalendar(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'manager_auto';
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
  return role === 'director' || role === 'financer';
}

export function canViewTechDashboard(role?: string | null): boolean {
  return role === 'admin' || role === 'director' || role === 'financer' || role === 'head_sales';
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

  if (role === 'director' || role === 'manager_sales' || role === 'head_sales') {
    return false;
  }

  return SEGMENT_BY_ROLE[role] === segmentCode;
}
