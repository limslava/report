import type { CandidateCheckStatus } from '../services/api';

export const candidateStatusLabels: Record<CandidateCheckStatus, string> = {
  pending_security: 'Проверка СБ',
  approved: 'Согласован',
  approved_with_remarks: 'Согласован с замечаниями',
  rejected: 'Не согласован',
};

export const candidateDecisionLabels: Record<Exclude<CandidateCheckStatus, 'pending_security'>, string> = {
  approved: 'Согласован',
  approved_with_remarks: 'Согласован с замечаниями',
  rejected: 'Не согласован',
};

// Семантичные, различимые оттенки: в процессе — синий, согласован — зелёный,
// с замечаниями — янтарный, отказ — красный.
export const candidateStatusChip = (status: CandidateCheckStatus): { bgcolor: string; color: string } => {
  if (status === 'pending_security') return { bgcolor: '#e4eefc', color: '#1c5cab' };
  if (status === 'approved') return { bgcolor: '#e9f6ea', color: '#1f6b25' };
  if (status === 'approved_with_remarks') return { bgcolor: '#fdeecf', color: '#8a5b00' };
  return { bgcolor: '#ffe1e1', color: '#9f1d1d' };
};

export const formatSurnameInitials = (fullName?: string | null): string => {
  const raw = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '—';
  const parts = raw.split(' ');
  if (parts.length === 1) return parts[0];
  const [surname, ...rest] = parts;
  const initials = rest.filter(Boolean).map((part) => `${part[0].toUpperCase()}.`).join(' ');
  return `${surname} ${initials}`.trim();
};

export const formatCandidateDateTime = (value: string | null): string => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const candidateErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Array<{ msg?: string }> } } }).response;
    return response?.data?.message || response?.data?.errors?.[0]?.msg || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};
