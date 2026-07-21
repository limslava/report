import { useCallback, useMemo, useState } from 'react';
import { getMyContractApprovalInbox } from '../services/api';
import type { ApprovalInboxItem, InboxView } from '../types/contracts';
import { formatDateOnly, getApprovalInboxDecisionLabel } from '../utils/contract-approval';

type UseApprovalInboxOptions = {
  enabled: boolean;
  onError: (message: string) => void;
};

function isSameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function apiInboxView(view: InboxView) {
  if (view === 'completed_month') return 'processed';
  if (view === 'new' || view === 'due_today' || view === 'overdue') return 'active';
  return view;
}

function approvalInboxErrorMessage(error: any): string {
  return error?.response?.data?.message || error?.message || 'Не удалось загрузить договоры на согласование';
}

function matchesApprovalView(item: ApprovalInboxItem, view: InboxView, now: Date) {
  const assigned = item.assignedAt ? new Date(item.assignedAt) : null;
  const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
  const hasAssigned = assigned && !Number.isNaN(assigned.getTime());
  const hasDeadline = deadline && !Number.isNaN(deadline.getTime());

  if (view === 'new') return Boolean(hasAssigned && isSameDate(assigned, now));
  if (view === 'due_today') {
    // Только еще не просроченные задачи с дедлайном сегодня — в соответствии с KPI дашборда.
    return Boolean(hasDeadline && isSameDate(deadline, now) && deadline.getTime() >= now.getTime());
  }
  if (view === 'overdue') {
    if (!hasDeadline) return false;
    return deadline.getTime() < now.getTime();
  }
  if (view === 'completed_month') {
    const signedAt = item.stepSignedAt ? new Date(item.stepSignedAt) : null;
    return Boolean(
      signedAt
      && !Number.isNaN(signedAt.getTime())
      && signedAt.getFullYear() === now.getFullYear()
      && signedAt.getMonth() === now.getMonth(),
    );
  }
  return true;
}

function approvalSearchText(item: ApprovalInboxItem) {
  return [
    item.contractNumber,
    item.contractDate,
    item.contractType === 'expense' ? 'расходный' : 'доходный',
    item.incomeSubtype === 'with_psr' ? 'с пср' : item.incomeSubtype === 'standard' ? 'без пср' : '',
    item.subject,
    item.counterpartyShortName,
    item.counterpartyName,
    item.counterpartyInn,
    item.initiatorName,
    formatDateOnly(item.deadlineAt),
    getApprovalInboxDecisionLabel(item),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function useApprovalInbox({ enabled, onError }: UseApprovalInboxOptions) {
  const [approvalInbox, setApprovalInbox] = useState<ApprovalInboxItem[]>([]);
  const [approvalInboxView, setApprovalInboxView] = useState<InboxView>('active');
  const [approvalSearch, setApprovalSearch] = useState('');

  const loadApprovalInbox = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await getMyContractApprovalInbox(apiInboxView(approvalInboxView));
      setApprovalInbox(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      onError(approvalInboxErrorMessage(error));
    }
  }, [approvalInboxView, enabled, onError]);

  const filteredApprovalInbox = useMemo(() => {
    const now = new Date();
    const query = approvalSearch.trim().toLowerCase();
    return approvalInbox.filter((item) => {
      if (!matchesApprovalView(item, approvalInboxView, now)) return false;
      return !query || approvalSearchText(item).includes(query);
    });
  }, [approvalInbox, approvalInboxView, approvalSearch]);

  return {
    approvalInbox,
    approvalInboxView,
    setApprovalInboxView,
    approvalSearch,
    setApprovalSearch,
    filteredApprovalInbox,
    loadApprovalInbox,
  };
}
