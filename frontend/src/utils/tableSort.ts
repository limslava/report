/**
 * Общая сортировка табличных заголовков (справочники, топливо) — в стиле
 * графиков работы: клик по заголовку циклит asc → desc → исходный порядок,
 * выбор запоминается в localStorage на пользователя.
 */

export type TableSortState = { field: string; direction: 'asc' | 'desc' } | null;

export function cycleSort(prev: TableSortState, field: string): TableSortState {
  if (!prev || prev.field !== field) return { field, direction: 'asc' };
  if (prev.direction === 'asc') return { field, direction: 'desc' };
  return null;
}

export function sortIndicator(sort: TableSortState, field: string): 'none' | 'asc' | 'desc' {
  return sort && sort.field === field ? sort.direction : 'none';
}

/** Числа сравниваем как числа (в т.ч. «2 019», «27,5»), строки — по-русски. */
function compareNonEmpty(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a).trim();
  const bs = String(b).trim();
  const an = Number(as.replace(/\s/g, '').replace(',', '.'));
  const bn = Number(bs.replace(/\s/g, '').replace(',', '.'));
  if (as !== '' && bs !== '' && Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return as.localeCompare(bs, 'ru', { sensitivity: 'base', numeric: true });
}

const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === '';

/** Пустые значения всегда внизу, независимо от направления. */
export function sortRows<T>(
  rows: T[],
  sort: TableSortState,
  getValue: (row: T, field: string) => unknown
): T[] {
  if (!sort) return rows;
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = getValue(x, sort.field);
    const b = getValue(y, sort.field);
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return compareNonEmpty(a, b) * dir;
  });
}

export function loadSortState<T>(storageKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveSortState(storageKey: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}
