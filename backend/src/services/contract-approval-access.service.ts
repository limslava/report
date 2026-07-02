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
