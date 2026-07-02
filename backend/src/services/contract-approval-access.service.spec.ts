import { Contract, ContractStatus } from '../models/contract.model';
import { ContractApprovalStep } from '../models/contract-approval-step.model';
import { assertContractDetailAccess, hasContractDetailAccess } from './contract-approval-access.service';

function contract(input: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    initiatorId: 'initiator-1',
    status: ContractStatus.IN_APPROVAL,
    ...input,
  } as Contract;
}

function step(input: Partial<ContractApprovalStep> = {}): ContractApprovalStep {
  return {
    id: 'step-1',
    contractId: 'contract-1',
    roleCode: 'lawyer',
    approverUserId: 'lawyer-1',
    ...input,
  } as ContractApprovalStep;
}

describe('contract approval access service', () => {
  it('allows administrative and registry-level access', () => {
    expect(hasContractDetailAccess(contract(), [], 'admin-1', 'admin')).toBe(true);
    expect(hasContractDetailAccess(contract(), [], 'gd-1', 'general_director')).toBe(true);
  });

  it('allows initiator, assigned approver, and matching role access', () => {
    const steps = [step({ approverUserId: 'lawyer-1', roleCode: 'lawyer' })];

    expect(hasContractDetailAccess(contract(), steps, 'initiator-1', 'manager_sales')).toBe(true);
    expect(hasContractDetailAccess(contract(), steps, 'lawyer-1', 'lawyer')).toBe(true);
    expect(hasContractDetailAccess(contract(), steps, 'another-lawyer', 'lawyer')).toBe(true);
  });

  it('allows approved contracts to module users and denies anonymous access', () => {
    expect(hasContractDetailAccess(contract({ status: ContractStatus.APPROVED }), [], 'user-1', 'manager_sales')).toBe(true);
    expect(hasContractDetailAccess(contract({ status: ContractStatus.APPROVED }), [], undefined, undefined)).toBe(false);
  });

  it('throws an auth-aware error when access is denied', () => {
    expect(() => assertContractDetailAccess(contract(), [], undefined, undefined)).toThrow('Нет доступа к карточке договора');

    try {
      assertContractDetailAccess(contract(), [], 'other-1', 'manager_sales');
      throw new Error('Expected access check to throw');
    } catch (error) {
      expect((error as any).statusCode).toBe(403);
    }
  });
});
