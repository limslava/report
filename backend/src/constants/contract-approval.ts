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
export const CONTRACT_INITIATOR_ROLES = [
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
] as const;
export const CONTRACT_APPROVAL_DASHBOARD_ROLES = new Set<string>(CONTRACT_APPROVAL_WORK_ROLES);

export function contractApprovalRoleLabel(roleCode: string): string {
  return CONTRACT_APPROVAL_ROLE_LABELS[roleCode as ContractApprovalRoleCode] ?? roleCode;
}
