/** Справочник причин отказа — зеркало backend/src/constants/hh.ts. */
export const REJECTION_REASONS: Array<{ code: string; label: string }> = [
  { code: 'salary', label: 'Не сошлись по деньгам' },
  { code: 'experience', label: 'Не хватает опыта или квалификации' },
  { code: 'no_contact', label: 'Не вышел на связь' },
  { code: 'candidate_declined', label: 'Кандидат отказался сам' },
  { code: 'location', label: 'Не подходит локация или график' },
  { code: 'security', label: 'Не прошёл проверку' },
  { code: 'other', label: 'Другое (нужен комментарий)' },
];

export const rejectionLabel = (code?: string | null): string | null =>
  code ? (REJECTION_REASONS.find((reason) => reason.code === code)?.label ?? code) : null;
