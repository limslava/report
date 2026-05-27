import { ContractApprovalStep } from '../models/contract-approval-step.model';

export async function processContractApprovalDeadlines(): Promise<void> {
  // Deadlines are shown in dashboards and registries. We intentionally do not send
  // deadline/overdue emails to avoid noisy BP notifications.
}

export async function assignDeadlineForStep(step: ContractApprovalStep): Promise<void> {
  void step;
}
