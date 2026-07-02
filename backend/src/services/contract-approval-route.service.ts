import { Contract, ContractIncomeSubtype, ContractStatus, ContractType } from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import { CONTRACT_PRE_SECRETARY_APPROVAL_ROLES } from '../constants/contract-approval';

export type ContractFlowMeta = {
  currentStageRole: string | null;
  currentStageLabel: string | null;
  statusDetail: string | null;
  needsSignedAttachment: boolean;
};

export function buildContractApprovalRouteRoles(contract: Contract): string[] {
  if (contract.contractType === ContractType.INCOME && contract.incomeSubtype !== ContractIncomeSubtype.WITH_PSR) {
    return ['security', 'secretary'];
  }
  return [...CONTRACT_PRE_SECRETARY_APPROVAL_ROLES, 'secretary'];
}

export function getLatestApprovalRevision(steps: ContractApprovalStep[]): number {
  return Math.max(1, ...steps.map((step) => step.revisionNo || 1));
}

export function getCurrentApprovalSteps(steps: ContractApprovalStep[]): ContractApprovalStep[] {
  const latestRevision = getLatestApprovalRevision(steps);
  return steps.filter((step) => (step.revisionNo || 1) === latestRevision);
}

export function getNextRevisionForDocuments(contractStatus: ContractStatus, steps: ContractApprovalStep[]): number {
  const latestRevision = getLatestApprovalRevision(steps);
  return contractStatus === ContractStatus.REWORK ? latestRevision + 1 : latestRevision;
}

export function isParallelSecretaryRoute(steps: ContractApprovalStep[]): boolean {
  return steps.some((step) => step.roleCode === 'secretary');
}

export function getPreSecretaryApprovalSteps(steps: ContractApprovalStep[]): ContractApprovalStep[] {
  return steps.filter((step) => step.roleCode !== 'secretary');
}

export function isPreSecretaryApprovalRole(roleCode: string): boolean {
  return roleCode !== 'secretary';
}

export function arePreSecretaryApprovalsComplete(steps: ContractApprovalStep[]): boolean {
  const preSecretarySteps = getPreSecretaryApprovalSteps(steps);
  return preSecretarySteps.length > 0 && preSecretarySteps.every((step) => Boolean(step.decision));
}

export function hasPreSecretaryApprovalRemarks(steps: ContractApprovalStep[]): boolean {
  return getPreSecretaryApprovalSteps(steps).some((step) => (
    step.decision === ContractApprovalDecision.REJECT
    || step.decision === ContractApprovalDecision.REWORK
    || Boolean(step.comment?.trim())
  ));
}

export function canCreateFinalPrintPackage(steps: ContractApprovalStep[]): boolean {
  const currentSteps = getCurrentApprovalSteps(steps);
  const preSecretarySteps = getPreSecretaryApprovalSteps(currentSteps);
  return preSecretarySteps.length > 0
    && preSecretarySteps.some((step) => step.roleCode === 'security' && step.decision === ContractApprovalDecision.APPROVE)
    && preSecretarySteps.every((step) => Boolean(step.decision));
}

export function buildContractFlowMeta(params: {
  contract: Contract;
  steps: ContractApprovalStep[];
  roleLabel: (roleCode: string) => string;
  secretaryHasSignedFile: boolean;
}): ContractFlowMeta {
  const { contract, roleLabel, secretaryHasSignedFile } = params;
  const contractSteps = getCurrentApprovalSteps(params.steps);
  const currentPending = contractSteps.find((step) => !step.decision) ?? null;
  const lastDecided = [...contractSteps].reverse().find((step) => Boolean(step.decision)) ?? null;
  const hasParallelRoute = isParallelSecretaryRoute(contractSteps);
  const secretaryStep = contractSteps.find((step) => step.roleCode === 'secretary') ?? null;
  const parallelSteps = getPreSecretaryApprovalSteps(contractSteps);
  const completedParallelCount = parallelSteps.filter((step) => Boolean(step.decision)).length;
  const hasParallelRemarks = parallelSteps.some((step) => (
    step.decision === ContractApprovalDecision.REJECT
    || Boolean(step.comment?.trim())
  ));
  let currentStageLabel = currentPending ? `Проверка ${roleLabel(currentPending.roleCode)}` : null;
  let statusDetail: string | null = null;

  if (contract.status === ContractStatus.IN_APPROVAL) {
    if (hasParallelRoute && secretaryStep?.assignedAt && !secretaryStep.decision) {
      statusDetail = hasParallelRemarks ? 'На подписи, есть замечания' : 'На подписи';
      currentStageLabel = statusDetail;
    } else if (hasParallelRoute) {
      statusDetail = `Согласование: ${completedParallelCount} из ${parallelSteps.length}`;
      currentStageLabel = statusDetail;
    } else {
      statusDetail = currentStageLabel;
    }
  } else if (contract.status === ContractStatus.REJECTED && lastDecided?.decision === ContractApprovalDecision.REJECT) {
    statusDetail = lastDecided.roleCode === 'security'
      ? 'Отклонено руководителем СБ'
      : `Отклонено: ${roleLabel(lastDecided.roleCode)}`;
  }

  return {
    currentStageRole: currentPending?.roleCode ?? null,
    currentStageLabel,
    statusDetail,
    needsSignedAttachment: (
      (contract.status === ContractStatus.APPROVED || Boolean(secretaryStep?.assignedAt))
      && !secretaryHasSignedFile
    ),
  };
}
