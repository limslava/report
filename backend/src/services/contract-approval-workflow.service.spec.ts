import { Contract, ContractIncomeSubtype, ContractType } from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import {
  applyApprovalDecision,
  assignApprovalStep,
  buildApprovalStepPayloads,
  findSecretaryStepReadyForAssignment,
  getDecidedPreSecretaryPeers,
} from './contract-approval-workflow.service';

function contract(input: Partial<Contract>): Contract {
  return {
    id: 'contract-1',
    contractType: ContractType.EXPENSE,
    incomeSubtype: null,
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
    slaWorkdays: 2,
    assignedAt: null,
    deadlineAt: null,
    decision: null,
    comment: null,
    ...input,
  } as ContractApprovalStep;
}

const workflowDependencies = {
  resolveApproverUserId: jest.fn(async (roleCode: string) => `${roleCode}-user`),
  resolveSlaWorkdays: jest.fn(async (_contract: Contract, roleCode: string) => (roleCode === 'secretary' ? 1 : 2)),
  resolveEffectiveWorkSchedule: jest.fn(async () => ({
    timezone: 'Asia/Vladivostok',
    workdayStart: '10:00',
    workdayEnd: '19:00',
    workdays: [1, 2, 3, 4, 5],
  })),
  calculateDeadlineBySchedule: jest.fn(async (assignedAt: Date, slaWorkdays: number) => {
    const deadline = new Date(assignedAt);
    deadline.setUTCDate(deadline.getUTCDate() + slaWorkdays);
    return deadline;
  }),
};

describe('contract approval workflow service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds immediately assigned pre-secretary steps for the full route', async () => {
    const assignedAt = new Date('2026-07-01T00:00:00.000Z');
    const payloads = await buildApprovalStepPayloads({
      contract: contract({ contractType: ContractType.EXPENSE }),
      revisionNo: 3,
      assignedAt,
      dependencies: workflowDependencies,
    });

    expect(payloads.map((item) => item.roleCode)).toEqual([
      'security',
      'lawyer',
      'chief_accountant',
      'financer',
      'secretary',
    ]);
    expect(payloads.filter((item) => item.assignedAt).map((item) => item.roleCode)).toEqual([
      'security',
      'lawyer',
      'chief_accountant',
      'financer',
    ]);
    expect(payloads.find((item) => item.roleCode === 'secretary')?.assignedAt).toBeNull();
    expect(payloads.every((item) => item.revisionNo === 3)).toBe(true);
  });

  it('builds a shortened income-without-PSR route', async () => {
    const payloads = await buildApprovalStepPayloads({
      contract: contract({
        contractType: ContractType.INCOME,
        incomeSubtype: ContractIncomeSubtype.STANDARD,
      }),
      revisionNo: 1,
      assignedAt: new Date('2026-07-01T00:00:00.000Z'),
      dependencies: workflowDependencies,
    });

    expect(payloads.map((item) => item.roleCode)).toEqual(['security', 'secretary']);
    expect(payloads.find((item) => item.roleCode === 'security')?.assignedAt).toBeInstanceOf(Date);
    expect(payloads.find((item) => item.roleCode === 'secretary')?.assignedAt).toBeNull();
  });

  it('assigns deadlines and clears reminder fields for a step', async () => {
    const item = step({
      roleCode: 'secretary',
      reminderBeforeSentAt: new Date('2026-06-01T00:00:00.000Z'),
      reminderDeadlineSentAt: new Date('2026-06-01T00:00:00.000Z'),
      reminderOverdueSentAt: new Date('2026-06-01T00:00:00.000Z'),
      escalationSentAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const assignedAt = new Date('2026-07-01T00:00:00.000Z');

    await assignApprovalStep(item, assignedAt, workflowDependencies);

    expect(item.assignedAt).toBe(assignedAt);
    expect(item.deadlineAt).toEqual(new Date('2026-07-03T00:00:00.000Z'));
    expect(item.reminderBeforeSentAt).toBeNull();
    expect(item.reminderDeadlineSentAt).toBeNull();
    expect(item.reminderOverdueSentAt).toBeNull();
    expect(item.escalationSentAt).toBeNull();
  });

  it('applies a decision and finds secretary only after all pre-secretary decisions', () => {
    const lawyerStep = step({ id: 'lawyer-step', roleCode: 'lawyer' });
    applyApprovalDecision({
      step: lawyerStep,
      decision: ContractApprovalDecision.APPROVE,
      comment: '  с замечанием  ',
      decidedAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    expect(lawyerStep.decision).toBe(ContractApprovalDecision.APPROVE);
    expect(lawyerStep.comment).toBe('с замечанием');
    expect(lawyerStep.acceptedAt).toEqual(new Date('2026-07-02T00:00:00.000Z'));

    const steps = [
      step({ id: 'security-step', roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
      lawyerStep,
      step({ id: 'secretary-step', roleCode: 'secretary', decision: null }),
    ];

    expect(findSecretaryStepReadyForAssignment(steps)?.id).toBe('secretary-step');
    expect(getDecidedPreSecretaryPeers(steps, lawyerStep).map((item) => item.id)).toEqual(['security-step']);
  });

  it('does not assign the secretary while any pre-secretary step is pending', () => {
    const steps = [
      step({ id: 'security-step', roleCode: 'security', decision: ContractApprovalDecision.APPROVE }),
      step({ id: 'lawyer-step', roleCode: 'lawyer', decision: null }),
      step({ id: 'secretary-step', roleCode: 'secretary', assignedAt: null, decision: null }),
    ];

    expect(findSecretaryStepReadyForAssignment(steps)).toBeNull();
  });

  it('treats any pre-secretary decision as completed before assigning the secretary', () => {
    const steps = [
      step({ id: 'security-step', roleCode: 'security', decision: ContractApprovalDecision.REJECT }),
      step({ id: 'secretary-step', roleCode: 'secretary', assignedAt: null, decision: null }),
    ];

    expect(findSecretaryStepReadyForAssignment(steps)?.id).toBe('secretary-step');
  });

  it('normalizes empty and whitespace decision comments', () => {
    const reworkStep = step({ id: 'lawyer-step', roleCode: 'lawyer' });
    applyApprovalDecision({
      step: reworkStep,
      decision: ContractApprovalDecision.REWORK,
      comment: '   ',
      decidedAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    expect(reworkStep.decision).toBe(ContractApprovalDecision.REWORK);
    expect(reworkStep.comment).toBeNull();

    applyApprovalDecision({
      step: reworkStep,
      decision: ContractApprovalDecision.REJECT,
      comment: '  причина отказа  ',
      decidedAt: new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(reworkStep.decision).toBe(ContractApprovalDecision.REJECT);
    expect(reworkStep.comment).toBe('причина отказа');
    expect(reworkStep.acceptedAt).toEqual(new Date('2026-07-02T00:00:00.000Z'));
    expect(reworkStep.signedAt).toEqual(new Date('2026-07-03T00:00:00.000Z'));
  });
});
