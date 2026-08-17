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

/**
 * Инициатор своего договора видит и скачивает файлы САМОГО договора
 * (context='contract' — заполненный договор и его редакции), решение
 * 2026-08-17. Служебные файлы шагов согласования (СБ, бухгалтерия и т.п.)
 * ему по-прежнему не видны.
 */
export function canViewOwnContractFile(
  contract: Contract,
  attachmentContext: string,
  userId?: string,
): boolean {
  return Boolean(userId && contract.initiatorId === userId && attachmentContext === 'contract');
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
