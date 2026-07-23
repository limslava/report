import type {
  ApprovalInboxItem,
  ApprovalSheet,
  ContractRecord,
  DecisionHistoryEvent,
  SecurityInboxItem,
  SheetStep,
} from '../types/contracts';

export const CONTRACT_STATUS_LABELS: Record<ContractRecord['status'], string> = {
  draft: 'Черновик',
  in_approval: 'На согласовании',
  rework: 'На доработке',
  approved: 'Подписан',
  rejected: 'Отклонен',
};

// Договор формально ещё in_approval, но все визы проставлены и он ушёл секретарю
// на подпись — это отдельный этап «На подписании» (без отдельного статуса в БД).
export function isAwaitingSignature(
  contract: Pick<ContractRecord, 'status' | 'currentStageRole'>,
): boolean {
  return contract.status === 'in_approval' && contract.currentStageRole === 'secretary';
}

// Ключ для CSS-класса и логики фильтра: реальный статус, но с выделением этапа подписания.
export type ContractDisplayStatus = ContractRecord['status'] | 'signing';

export function getContractDisplayStatus(
  contract: Pick<ContractRecord, 'status' | 'currentStageRole'>,
): ContractDisplayStatus {
  return isAwaitingSignature(contract) ? 'signing' : contract.status;
}

export function getContractStatusLabel(
  contract: Pick<ContractRecord, 'status' | 'currentStageRole'>,
): string {
  return isAwaitingSignature(contract) ? 'На подписании' : CONTRACT_STATUS_LABELS[contract.status];
}

export function formatDecisionLabel(decision: DecisionHistoryEvent['newDecision'] | null, comment?: string | null): string {
  if (!decision) return 'Не выбрано';
  if (decision === 'reject') return 'Не согласован';
  if (decision === 'rework') return 'Возвращен на доработку';
  return comment?.trim() ? 'Согласован с замечаниями' : 'Согласован';
}

export function normalizeCounterpartyName(fullName: string): string {
  const trimmed = fullName.trim();
  const quoteMatch = trimmed.match(/["«](.+?)["»]/);
  if (quoteMatch?.[1]) {
    return quoteMatch[1].trim();
  }
  return trimmed
    .replace(/^ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ\s+/i, '')
    .replace(/^ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО\s+/i, '')
    .replace(/^АКЦИОНЕРНОЕ ОБЩЕСТВО\s+/i, '')
    .replace(/^ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ\s+/i, '')
    .trim();
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateOnly(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatContractTypeLabel(
  contractType: 'expense' | 'income',
  incomeSubtype: 'standard' | 'with_psr' | null,
  incomeKind?: 'teu' | 'agency' | null,
): string {
  if (contractType === 'expense') return 'Расходный';
  const kindLabel = incomeKind === 'agency' ? 'Агентский' : 'ТЭУ';
  const psrLabel = incomeSubtype === 'with_psr' ? 'с ПСР' : 'без ПСР';
  return `Доходный · ${kindLabel} (${psrLabel})`;
}

// Базовый тип — только доходный / расходный (для колонки «Тип»).
export function formatContractBaseTypeLabel(contractType: 'expense' | 'income'): string {
  return contractType === 'income' ? 'Доходный' : 'Расходный';
}

// Подтип по ПСР — только для доходных (для колонки «Подтип»).
export function formatContractSubtypeLabel(
  contractType: 'expense' | 'income',
  incomeSubtype: 'standard' | 'with_psr' | null,
): string {
  if (contractType !== 'income') return '—';
  return incomeSubtype === 'with_psr' ? 'С ПСР' : 'Без ПСР';
}

export function getSecurityVisaLabel(item: Pick<SecurityInboxItem, 'securityDecision' | 'securityComment'>): string {
  if (!item.securityDecision) return 'Не обработан';
  if (item.securityDecision === 'reject') return 'Не согласован';
  if (item.securityComment?.trim()) return 'Согласован с замечаниями';
  return 'Согласован';
}

export function getSecurityVisaColor(item: Pick<SecurityInboxItem, 'securityDecision' | 'securityComment'>): 'default' | 'success' | 'warning' | 'error' {
  if (!item.securityDecision) return 'default';
  if (item.securityDecision === 'reject') return 'error';
  if (item.securityComment?.trim()) return 'warning';
  return 'success';
}

export function getStepDecisionLabel(step: Pick<SheetStep, 'decision' | 'comment' | 'roleCode' | 'assignedAt'>): string {
  if (step.roleCode === 'secretary' && step.decision === 'approve') return 'Подписан';
  if (step.roleCode === 'secretary' && step.assignedAt && !step.decision) return 'На подписи';
  if (!step.decision) return 'Ожидает';
  if (step.decision === 'reject') return 'Не согласован';
  if (step.decision === 'rework') return 'На доработку';
  if (step.comment?.trim()) return 'Согласован с замечаниями';
  return 'Согласован';
}

export function getApprovalStartDate(sheet: ApprovalSheet): string | null {
  return sheet.steps.find((step) => step.assignedAt)?.assignedAt
    ?? sheet.steps.find((step) => step.acceptedAt)?.acceptedAt
    ?? null;
}

export function buildPrintFileName(sheet: ApprovalSheet): string {
  const counterparty = normalizeCounterpartyName(sheet.contract.counterpartyName)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'Контрагент';
  const date = sheet.contract.contractDate || new Date().toISOString().slice(0, 10);
  return `${counterparty}_${date}`;
}

export function getStepDecisionTone(step: Pick<SheetStep, 'decision' | 'comment' | 'roleCode'>): 'default' | 'success' | 'warning' | 'error' {
  if (!step.decision) return 'default';
  if (step.decision === 'reject' || step.decision === 'rework') return 'error';
  if (step.comment?.trim()) return 'warning';
  return 'success';
}

export function getApprovalInboxDecisionLabel(item: Pick<ApprovalInboxItem, 'stepDecision' | 'stepComment' | 'roleCode' | 'assignedAt'>): string {
  return getStepDecisionLabel({
    decision: item.stepDecision,
    comment: item.stepComment,
    roleCode: item.roleCode,
    assignedAt: item.assignedAt,
  });
}

export function getApprovalInboxDecisionTone(item: Pick<ApprovalInboxItem, 'stepDecision' | 'stepComment' | 'roleCode'>): 'default' | 'success' | 'warning' | 'error' {
  return getStepDecisionTone({
    decision: item.stepDecision,
    comment: item.stepComment,
    roleCode: item.roleCode,
  });
}
