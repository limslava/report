export const CONTRACT_APPROVAL_ROLE_LABELS = {
  initiator: 'Инициатор',
  security: 'Руководитель СБ',
  lawyer: 'Юрист',
  chief_accountant: 'Главный бухгалтер',
  financer: 'Финансовый директор',
  general_director: 'Генеральный директор',
  secretary: 'Офис-менеджер',
} as const;

export type ContractApprovalRoleCode = keyof typeof CONTRACT_APPROVAL_ROLE_LABELS;

export const CONTRACT_PARALLEL_APPROVAL_ROLES = ['lawyer', 'chief_accountant', 'financer'] as const;
export const CONTRACT_PRE_SECRETARY_APPROVAL_ROLES = ['security', ...CONTRACT_PARALLEL_APPROVAL_ROLES] as const;
export const CONTRACT_APPROVAL_WORK_ROLES = ['security', ...CONTRACT_PARALLEL_APPROVAL_ROLES, 'secretary'] as const;
/** Роли с доступом к модулю согласования: рабочие роли + зам главбуха (работает на шаге главбуха). */
export const CONTRACT_APPROVAL_ACCESS_ROLES = [...CONTRACT_APPROVAL_WORK_ROLES, 'deputy_chief_accountant'] as const;
export const CONTRACT_INITIATOR_ROLES = [
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'warehouse_manager_vvo',
] as const;
export const CONTRACT_APPROVAL_DASHBOARD_ROLES = new Set<string>(CONTRACT_APPROVAL_WORK_ROLES);

/**
 * Роль пользователя в терминах шага согласования: заместитель главного
 * бухгалтера действует на шаге «Главный бухгалтер» (решение 2026-09-10).
 */
export function approvalRoleForUser(role?: string | null): string | null {
  if (role === 'deputy_chief_accountant') return 'chief_accountant';
  return role ?? null;
}

export const DEPUTY_CHIEF_ACCOUNTANT_LABEL = 'Заместитель главного бухгалтера';

/**
 * Шаг «Главный бухгалтер» — общая очередь главбуха и зама: действовать может
 * любой из пары, независимо от того, на кого шаг назначен формально.
 */
export function userMatchesApprovalStep(
  step: { roleCode: string; approverUserId: string },
  userId?: string | null,
  userRole?: string | null,
): boolean {
  if (!userId) return false;
  if (step.approverUserId === userId) return true;
  return step.roleCode === 'chief_accountant' && approvalRoleForUser(userRole) === 'chief_accountant';
}

export function contractApprovalRoleLabel(roleCode: string): string {
  return CONTRACT_APPROVAL_ROLE_LABELS[roleCode as ContractApprovalRoleCode] ?? roleCode;
}

/**
 * Подпись стороны в листе согласования: если на шаге «Главный бухгалтер»
 * фактически действует зам, лист должен показывать именно «Заместитель
 * главного бухгалтера».
 */
export function contractApprovalStepRoleLabel(roleCode: string, approverRole?: string | null): string {
  if (roleCode === 'chief_accountant' && approverRole === 'deputy_chief_accountant') {
    return DEPUTY_CHIEF_ACCOUNTANT_LABEL;
  }
  return contractApprovalRoleLabel(roleCode);
}
