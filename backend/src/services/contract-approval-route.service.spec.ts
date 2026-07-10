import { Contract, ContractIncomeSubtype, ContractStatus, ContractType } from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import {
  arePreSecretaryApprovalsComplete,
  buildContractApprovalRouteRoles,
  buildContractFlowMeta,
  canCreateFinalPrintPackage,
  getPreSecretaryApprovalSteps,
} from './contract-approval-route.service';
import { contractApprovalRoleLabel } from '../constants/contract-approval';

function contract(input: Partial<Contract>): Contract {
  return {
    id: 'contract-1',
    contractType: ContractType.EXPENSE,
    incomeSubtype: null,
    status: ContractStatus.DRAFT,
    initiatorId: 'initiator-1',
    ...input,
  } as Contract;
}

function step(input: Partial<ContractApprovalStep>): ContractApprovalStep {
  return {
    id: `${input.roleCode || 'step'}-1`,
    contractId: 'contract-1',
    roleCode: 'security',
    approverUserId: `${input.roleCode || 'security'}-user`,
    orderNo: 1,
    revisionNo: 1,
    assignedAt: new Date('2026-07-01T00:00:00.000Z'),
    decision: null,
    comment: null,
    ...input,
  } as ContractApprovalStep;
}

describe('contract approval route service', () => {
  it('starts full contracts with all pre-secretary roles in parallel', () => {
    expect(buildContractApprovalRouteRoles(contract({ contractType: ContractType.EXPENSE }))).toEqual([
      'security',
      'lawyer',
      'chief_accountant',
      'financer',
      'secretary',
    ]);
    expect(buildContractApprovalRouteRoles(contract({
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.WITH_PSR,
    }))).toEqual([
      'security',
      'lawyer',
      'chief_accountant',
      'financer',
      'secretary',
    ]);
  });

  it('shortens income contracts without PSR to security and secretary', () => {
    expect(buildContractApprovalRouteRoles(contract({
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.STANDARD,
    }))).toEqual(['security', 'secretary']);
    expect(buildContractApprovalRouteRoles(contract({
      contractType: ContractType.INCOME,
      incomeSubtype: null,
    }))).toEqual(['security', 'secretary']);
  });

  it('treats every non-secretary step as the pre-secretary approval block', () => {
    const steps = [
      step({ roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'lawyer', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'secretary', decision: null }),
    ];

    expect(getPreSecretaryApprovalSteps(steps).map((item) => item.roleCode)).toEqual(['security', 'lawyer']);
    expect(arePreSecretaryApprovalsComplete(steps)).toBe(true);
  });

  it('allows print package after every pre-secretary step has any decision', () => {
    expect(canCreateFinalPrintPackage([
      step({ roleCode: 'security', decision: ContractApprovalDecision.REJECT }),
      step({ roleCode: 'lawyer', decision: ContractApprovalDecision.REWORK }),
      step({ roleCode: 'chief_accountant', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'financer', decision: ContractApprovalDecision.APPROVE, comment: 'Есть замечания' }),
      step({ roleCode: 'secretary', decision: null }),
    ])).toBe(true);

    expect(canCreateFinalPrintPackage([
      step({ roleCode: 'security', decision: null }),
      step({ roleCode: 'lawyer', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'secretary', decision: null }),
    ])).toBe(false);

    expect(canCreateFinalPrintPackage([
      step({ roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'lawyer', decision: null }),
      step({ roleCode: 'chief_accountant', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'financer', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'secretary', decision: null }),
    ])).toBe(false);

    expect(canCreateFinalPrintPackage([
      step({ roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'lawyer', decision: ContractApprovalDecision.APPROVE, comment: 'Есть замечания' }),
      step({ roleCode: 'chief_accountant', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'financer', decision: ContractApprovalDecision.APPROVE }),
      step({ roleCode: 'secretary', decision: null }),
    ])).toBe(true);
  });

  it('builds registry flow meta for parallel approval and secretary handoff', () => {
    const baseContract = contract({ status: ContractStatus.IN_APPROVAL });
    expect(buildContractFlowMeta({
      contract: baseContract,
      steps: [
        step({ roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
        step({ roleCode: 'lawyer', decision: null }),
        step({ roleCode: 'secretary', assignedAt: null, decision: null }),
      ],
      roleLabel: contractApprovalRoleLabel,
      secretaryHasSignedFile: false,
    }).statusDetail).toBe('Согласование: 1 из 2');

    expect(buildContractFlowMeta({
      contract: baseContract,
      steps: [
        step({ roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
        step({ roleCode: 'secretary', assignedAt: new Date('2026-07-02T00:00:00.000Z'), decision: null }),
      ],
      roleLabel: contractApprovalRoleLabel,
      secretaryHasSignedFile: false,
    })).toMatchObject({
      currentStageRole: 'secretary',
      currentStageLabel: 'На подписи',
      needsSignedAttachment: true,
    });
  });
});
