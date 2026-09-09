/**
 * Настройка колонок таблиц пользователем: какие показывать и в каком порядке.
 * Хранится в localStorage на пользователя (как сортировка в tableSort.ts).
 * Первая колонка (ФИО/номер) и колонка действий не настраиваются.
 */

export type ColumnPrefs = { order: string[]; hidden: string[] };

/**
 * Итоговый порядок видимых ключей: сохранённый порядок + неизвестные ключи
 * (новые колонки после обновлений) в конец, скрытые отфильтрованы.
 */
export function applyColumnPrefs(allKeys: string[], prefs: ColumnPrefs | undefined): string[] {
  const known = new Set(allKeys);
  const order = (prefs?.order ?? []).filter((key) => known.has(key));
  for (const key of allKeys) if (!order.includes(key)) order.push(key);
  const hidden = new Set((prefs?.hidden ?? []).filter((key) => known.has(key)));
  return order.filter((key) => !hidden.has(key));
}

/** Полный порядок (включая скрытые) — для диалога настройки. */
export function orderedKeys(allKeys: string[], prefs: ColumnPrefs | undefined): string[] {
  const known = new Set(allKeys);
  const order = (prefs?.order ?? []).filter((key) => known.has(key));
  for (const key of allKeys) if (!order.includes(key)) order.push(key);
  return order;
}

export function isHidden(key: string, prefs: ColumnPrefs | undefined): boolean {
  return (prefs?.hidden ?? []).includes(key);
}

export function toggleHidden(allKeys: string[], prefs: ColumnPrefs | undefined, key: string): ColumnPrefs {
  const hidden = new Set((prefs?.hidden ?? []).filter((k) => allKeys.includes(k)));
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);
  return { order: orderedKeys(allKeys, prefs), hidden: [...hidden] };
}

export function moveColumn(allKeys: string[], prefs: ColumnPrefs | undefined, key: string, delta: -1 | 1): ColumnPrefs {
  const order = orderedKeys(allKeys, prefs);
  const index = order.indexOf(key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) {
    return { order, hidden: prefs?.hidden ?? [] };
  }
  [order[index], order[target]] = [order[target], order[index]];
  return { order, hidden: prefs?.hidden ?? [] };
}

/** Перетаскивание: ключ key встаёт на позицию targetIndex (в полном порядке). */
export function moveColumnTo(allKeys: string[], prefs: ColumnPrefs | undefined, key: string, targetIndex: number): ColumnPrefs {
  const order = orderedKeys(allKeys, prefs);
  const index = order.indexOf(key);
  if (index < 0) return { order, hidden: prefs?.hidden ?? [] };
  order.splice(index, 1);
  order.splice(Math.max(0, Math.min(targetIndex, order.length)), 0, key);
  return { order, hidden: prefs?.hidden ?? [] };
}
