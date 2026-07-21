import { useCallback, useMemo, useState } from 'react';
import { getSecurityContractInbox } from '../services/api';
import type { InboxView, SecurityInboxItem } from '../types/contracts';
import { formatDateOnly } from '../utils/contract-approval';

type UseSecurityInboxOptions = {
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

function securityInboxErrorMessage(error: any): string {
  return error?.response?.data?.message || error?.message || 'Не удалось загрузить входящие руководителя СБ';
}

function matchesSecurityView(item: SecurityInboxItem, view: InboxView, now: Date) {
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
    const signedAt = item.securitySignedAt ? new Date(item.securitySignedAt) : null;
    return Boolean(
      signedAt
      && !Number.isNaN(signedAt.getTime())
      && signedAt.getFullYear() === now.getFullYear()
      && signedAt.getMonth() === now.getMonth(),
    );
  }
  return true;
}

function securitySearchText(item: SecurityInboxItem) {
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
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function useSecurityInbox({ enabled, onError }: UseSecurityInboxOptions) {
  const [securityInbox, setSecurityInbox] = useState<SecurityInboxItem[]>([]);
  const [securityInboxView, setSecurityInboxView] = useState<InboxView>('active');
  const [securitySearch, setSecuritySearch] = useState('');

  const loadSecurityInbox = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await getSecurityContractInbox(apiInboxView(securityInboxView));
      setSecurityInbox(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      onError(securityInboxErrorMessage(error));
    }
  }, [enabled, onError, securityInboxView]);

  const filteredSecurityInbox = useMemo(() => {
    const now = new Date();
    const query = securitySearch.trim().toLowerCase();
    return securityInbox.filter((item) => {
      if (!matchesSecurityView(item, securityInboxView, now)) return false;
      return !query || securitySearchText(item).includes(query);
    });
  }, [securityInbox, securityInboxView, securitySearch]);

  return {
    securityInbox,
    securityInboxView,
    setSecurityInboxView,
    securitySearch,
    setSecuritySearch,
    filteredSecurityInbox,
    loadSecurityInbox,
  };
}
