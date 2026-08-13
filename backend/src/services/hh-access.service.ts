import { User } from '../models/user.model';
import { HH_CAPABILITY_ROLES, HH_MODULE_ROLES, HhCapability } from '../constants/hh';

/**
 * Единственная точка проверки прав модуля подбора. Списки ролей живут в
 * `constants/hh.ts`, здесь только логика.
 */
export function hasHhCapability(user: User | undefined, capability: HhCapability): boolean {
  if (!user) return false;
  return (HH_CAPABILITY_ROLES[capability] as readonly string[]).includes(user.role);
}

export function assertHhCapability(user: User | undefined, capability: HhCapability): void {
  if (hasHhCapability(user, capability)) return;
  const error: any = new Error('Недостаточно прав для этого действия в модуле подбора');
  error.statusCode = 403;
  throw error;
}

export const canAccessHrModuleBackend = (user?: User) =>
  Boolean(user && (HH_MODULE_ROLES as readonly string[]).includes(user.role));

export const canAccessHrCabinetBackend = (user?: User) => hasHhCapability(user, 'hr.recruiting');
export const canManageHrVacanciesBackend = (user?: User) => hasHhCapability(user, 'hr.vacancy.manage');
export const canManageHrIntegrationBackend = (user?: User) => hasHhCapability(user, 'hr.integration.manage');
export const canViewHrReportsBackend = (user?: User) => hasHhCapability(user, 'hr.reports.view');
export const canViewHrCandidatePiiBackend = (user?: User) => hasHhCapability(user, 'hr.pii.view');
export const canCreateHiringRequestBackend = (user?: User) => hasHhCapability(user, 'hr.request.create');
export const canReviewHiringRequestBackend = (user?: User) => hasHhCapability(user, 'hr.request.review');
