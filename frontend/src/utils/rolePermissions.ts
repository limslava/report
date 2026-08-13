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
    && role !== 'hr_recruiter'
    && role !== 'garage_head'
    && role !== 'garage_head_vvo'
    && role !== 'warehouse_manager_vvo'
    && role !== 'warehouse_manager'
    && role !== 'warehouse_keeper'
    && role !== 'counterparty_user'
    && role !== 'bdd_specialist_vvo'
    && role !== 'bdd_specialist_mow';
}

export function canViewPlans(role?: string | null): boolean {
  return Boolean(role)
    && role !== 'security'
    && role !== 'lawyer'
    && role !== 'chief_accountant'
    && role !== 'secretary'
    && role !== 'head_hr'
    && role !== 'hr_specialist'
    && role !== 'hr_recruiter'
    && role !== 'garage_head'
    && role !== 'garage_head_vvo'
    && role !== 'warehouse_manager_vvo'
    && role !== 'warehouse_manager'
    && role !== 'warehouse_keeper'
    && role !== 'counterparty_user'
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

export function canManageFuelNormsFrontend(role?: string | null): boolean {
  return role === 'admin'
    || role === 'bdd_specialist_vvo'
    || role === 'bdd_specialist_mow'
    || role === 'head_ktk_vvo'
    || role === 'head_ktk_mow';
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

export function canAccessCandidateChecks(role?: string | null): boolean {
  return role === 'admin' || role === 'security' || role === 'hr_recruiter';
}

export function canViewBPDashboard(role?: string | null): boolean {
  return role === 'admin'
    || role === 'security'
    || role === 'lawyer'
    || role === 'chief_accountant'
    || role === 'financer'
    || role === 'secretary'
    || role === 'hr_recruiter';
}

export function canShowBPDashboardMenu(role?: string | null): boolean {
  return canViewBPDashboard(role);
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

/**
 * Модуль подбора. Списки ролей должны совпадать с backend/src/constants/hh.ts —
 * клиентские предикаты только прячут UI, решение принимает сервер.
 *
 * `head_hr` и `hr_specialist` — это кадровая служба (графики работы, кадровое
 * администрирование), а не подбор. Доступа к кандидатам у них нет; заявку на
 * подбор `head_hr` подать может, как любой руководитель.
 */
const HR_RECRUITING_ROLES = new Set(['admin', 'hr_recruiter']);

const HR_REQUESTER_ROLES = new Set([
  'general_director',
  'director',
  'head_sales',
  'head_ktk_vvo',
  'head_ktk_mow',
  'head_hr',
  'garage_head',
  'garage_head_vvo',
  'warehouse_manager',
  'warehouse_manager_vvo',
  'security',
  'chief_accountant',
]);

/** Ведёт подбор: кандидаты, вакансии, воронка, интервью, импорт. */
export function canRunHrRecruiting(role?: string | null): boolean {
  return Boolean(role && HR_RECRUITING_ROLES.has(role));
}

/** Подаёт заявки на подбор и рассматривает присланных по ним кандидатов. */
export function canCreateHiringRequest(role?: string | null): boolean {
  return Boolean(role && HR_REQUESTER_ROLES.has(role));
}

/** Модуль доступен хоть в каком-то виде — для маршрутов и пункта меню. */
export function canAccessHrModule(role?: string | null): boolean {
  return canRunHrRecruiting(role) || canCreateHiringRequest(role);
}

export function canAccessHrCabinet(role?: string | null): boolean {
  return canRunHrRecruiting(role);
}

export function canManageHrVacancies(role?: string | null): boolean {
  return canRunHrRecruiting(role);
}

export function canViewHrCandidatePii(role?: string | null): boolean {
  return canRunHrRecruiting(role);
}

export function canOpenHrContacts(role?: string | null): boolean {
  return canRunHrRecruiting(role);
}

export function canViewHrReports(role?: string | null): boolean {
  return canRunHrRecruiting(role);
}

export function canManageHrIntegration(role?: string | null): boolean {
  return role === 'admin';
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
