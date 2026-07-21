import { Contract, ContractStatus } from '../models/contract.model';
import { ContractApprovalStep } from '../models/contract-approval-step.model';

export function hasContractDetailAccess(
  contract: Contract,
  steps: ContractApprovalStep[],
  userId?: string,
  userRole?: string | null,
): boolean {
  if (!userId) return false;
  if (userRole === 'admin') return true;
  if (userRole === 'general_director') return true;
  if (contract.status === ContractStatus.APPROVED) return true;
  if (contract.initiatorId === userId) return true;

  return steps.some((step) => step.approverUserId === userId || step.roleCode === userRole);
}

// Прикреплённые к листу согласования файлы (сам договор и вложения по шагам)
// видят только эти роли. Остальные (инициатор, юрист, офис-менеджер, менеджеры)
// карточку и чат видят, но файлы листа согласования — нет. Файлы чата не ограничены.
export const CONTRACT_ATTACHMENT_VIEW_ROLES = new Set<string>([
  'admin',
  'general_director',
  'security',
  'financer',
  'chief_accountant',
  'lawyer',
]);

export function canViewContractAttachments(userRole?: string | null): boolean {
  return Boolean(userRole && CONTRACT_ATTACHMENT_VIEW_ROLES.has(userRole));
}

export function assertContractDetailAccess(
  contract: Contract,
  steps: ContractApprovalStep[],
  userId?: string,
  userRole?: string | null,
): void {
  if (!hasContractDetailAccess(contract, steps, userId, userRole)) {
    const error: any = new Error('Нет доступа к карточке договора');
    error.statusCode = userId ? 403 : 401;
    throw error;
  }
}
