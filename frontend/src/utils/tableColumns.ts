/**
 * Настройка колонок таблиц пользователем: какие показывать и в каком порядке.
 * Хранится в localStorage на пользователя (как сортировка в tableSort.ts).
 * Первая колонка (ФИО/номер) и колонка действий не настраиваются.
 * Часть колонок скрыта по умолчанию (defaultHidden) — это поля карточек,
 * которые пользователь может вывести в таблицу при желании.
 */

export type ColumnPrefs = { order: string[]; hidden: string[] };

/** Действующий набор скрытых ключей с учётом настроек и скрытых по умолчанию. */
export function effectiveHidden(allKeys: string[], defaultHidden: string[], prefs: ColumnPrefs | undefined): Set<string> {
  const known = new Set(allKeys);
  if (!prefs) return new Set(defaultHidden.filter((key) => known.has(key)));
  const hidden = new Set(prefs.hidden.filter((key) => known.has(key)));
  // новые колонки, появившиеся после сохранения настроек, уважают своё умолчание
  for (const key of defaultHidden) {
    if (known.has(key) && !prefs.order.includes(key) && !prefs.hidden.includes(key)) hidden.add(key);
  }
  return hidden;
}

/** Полный порядок (включая скрытые) — для диалога настройки. */
export function orderedKeys(allKeys: string[], prefs: ColumnPrefs | undefined): string[] {
  const known = new Set(allKeys);
  const order = (prefs?.order ?? []).filter((key) => known.has(key));
  for (const key of allKeys) if (!order.includes(key)) order.push(key);
  return order;
}

/** Итоговый порядок видимых ключей. */
export function applyColumnPrefs(allKeys: string[], defaultHidden: string[], prefs: ColumnPrefs | undefined): string[] {
  const hidden = effectiveHidden(allKeys, defaultHidden, prefs);
  return orderedKeys(allKeys, prefs).filter((key) => !hidden.has(key));
}

export function isHidden(allKeys: string[], defaultHidden: string[], prefs: ColumnPrefs | undefined, key: string): boolean {
  return effectiveHidden(allKeys, defaultHidden, prefs).has(key);
}

export function toggleHidden(allKeys: string[], defaultHidden: string[], prefs: ColumnPrefs | undefined, key: string): ColumnPrefs {
  const hidden = effectiveHidden(allKeys, defaultHidden, prefs);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);
  return { order: orderedKeys(allKeys, prefs), hidden: [...hidden] };
}

/** Перетаскивание/стрелки: ключ key встаёт на позицию targetIndex (в полном порядке). */
export function moveColumnTo(allKeys: string[], defaultHidden: string[], prefs: ColumnPrefs | undefined, key: string, targetIndex: number): ColumnPrefs {
  const order = orderedKeys(allKeys, prefs);
  const hidden = [...effectiveHidden(allKeys, defaultHidden, prefs)];
  const index = order.indexOf(key);
  if (index < 0) return { order, hidden };
  order.splice(index, 1);
  order.splice(Math.max(0, Math.min(targetIndex, order.length)), 0, key);
  return { order, hidden };
}
