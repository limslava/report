import { Contract } from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import { EffectiveWorkSchedule } from './contract-work-schedule.service';
import {
  arePreSecretaryApprovalsComplete,
  buildContractApprovalRouteRoles,
  getPreSecretaryApprovalSteps,
  isPreSecretaryApprovalRole,
} from './contract-approval-route.service';

type ResolveApproverUserId = (roleCode: string, contract: Contract) => Promise<string>;
type ResolveSlaWorkdays = (contract: Contract, roleCode: string) => Promise<number>;
type ResolveWorkSchedule = (roleCode: string, approverUserId: string) => Promise<EffectiveWorkSchedule>;
type CalculateDeadline = (assignedAt: Date, slaWorkdays: number, schedule: EffectiveWorkSchedule) => Promise<Date>;

export type ContractApprovalWorkflowDependencies = {
  resolveApproverUserId: ResolveApproverUserId;
  resolveSlaWorkdays: ResolveSlaWorkdays;
  resolveEffectiveWorkSchedule: ResolveWorkSchedule;
  calculateDeadlineBySchedule: CalculateDeadline;
};

export async function assignApprovalStep(
  step: ContractApprovalStep,
  assignedAt: Date,
  dependencies: Pick<ContractApprovalWorkflowDependencies, 'resolveEffectiveWorkSchedule' | 'calculateDeadlineBySchedule'>,
): Promise<ContractApprovalStep> {
  step.assignedAt = assignedAt;
  const schedule = await dependencies.resolveEffectiveWorkSchedule(step.roleCode, step.approverUserId);
  step.deadlineAt = await dependencies.calculateDeadlineBySchedule(
    assignedAt,
    Math.max(1, step.slaWorkdays || 1),
    schedule,
  );
  step.reminderBeforeSentAt = null;
  step.reminderDeadlineSentAt = null;
  step.reminderOverdueSentAt = null;
  step.escalationSentAt = null;
  return step;
}

export async function buildApprovalStepPayloads(params: {
  contract: Contract;
  revisionNo: number;
  assignedAt: Date;
  dependencies: ContractApprovalWorkflowDependencies;
}): Promise<Array<Partial<ContractApprovalStep>>> {
  const routeRoles = buildContractApprovalRouteRoles(params.contract);
  const stepsPayload: Array<Partial<ContractApprovalStep>> = [];

  for (let index = 0; index < routeRoles.length; index += 1) {
    const roleCode = routeRoles[index];
    const approverUserId = await params.dependencies.resolveApproverUserId(roleCode, params.contract);
    const slaWorkdays = await params.dependencies.resolveSlaWorkdays(params.contract, roleCode);
    const shouldAssignImmediately = isPreSecretaryApprovalRole(roleCode);
    let deadlineAt: Date | null = null;

    if (shouldAssignImmediately) {
      const schedule = await params.dependencies.resolveEffectiveWorkSchedule(roleCode, approverUserId);
      deadlineAt = await params.dependencies.calculateDeadlineBySchedule(params.assignedAt, slaWorkdays, schedule);
    }

    stepsPayload.push({
      contractId: params.contract.id,
      roleCode,
      approverUserId,
      orderNo: index + 1,
      revisionNo: params.revisionNo,
      acceptedAt: null,
      signedAt: null,
      decision: null,
      comment: null,
      slaWorkdays,
      assignedAt: shouldAssignImmediately ? params.assignedAt : null,
      deadlineAt,
      reminderBeforeSentAt: null,
      reminderDeadlineSentAt: null,
      reminderOverdueSentAt: null,
      escalationSentAt: null,
    });
  }

  return stepsPayload;
}

export function applyApprovalDecision(params: {
  step: ContractApprovalStep;
  decision: ContractApprovalDecision;
  comment: string | null;
  decidedAt: Date;
}): void {
  params.step.decision = params.decision;
  params.step.comment = params.comment?.trim() || null;
  params.step.acceptedAt = params.step.acceptedAt ?? params.decidedAt;
  params.step.signedAt = params.decidedAt;
}

export function findSecretaryStepReadyForAssignment(steps: ContractApprovalStep[]): ContractApprovalStep | null {
  const secretaryStep = steps.find((step) => step.roleCode === 'secretary') ?? null;
  if (!secretaryStep || secretaryStep.assignedAt) {
    return null;
  }
  return arePreSecretaryApprovalsComplete(steps) ? secretaryStep : null;
}

export function getDecidedPreSecretaryPeers(
  steps: ContractApprovalStep[],
  changedStep: ContractApprovalStep,
): ContractApprovalStep[] {
  return getPreSecretaryApprovalSteps(steps).filter((step) => (
    step.id !== changedStep.id && Boolean(step.decision)
  ));
}
