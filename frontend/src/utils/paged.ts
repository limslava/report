import type { HhPaged } from '../types/hh';

/**
 * Приводит ответ списка к странице.
 *
 * Списки модуля отдают `{items, total, page, perPage}`, но бэкенд может быть
 * старой версии и вернуть обычный массив — тогда страница собирается из него.
 * Без этой нормализации устаревший сервер (или ошибка) роняет экран на
 * `undefined.find`, а не показывает пустой список.
 */
export function normalizePage<T>(
  data: HhPaged<T> | T[] | null | undefined,
  perPage = 50,
): HhPaged<T> {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 0, perPage };
  }
  if (data && Array.isArray((data as HhPaged<T>).items)) {
    return data as HhPaged<T>;
  }
  return { items: [], total: 0, page: 0, perPage };
}

/** Массив из ответа, который должен быть массивом, но может им не оказаться. */
export function asArray<T>(data: T[] | null | undefined): T[] {
  return Array.isArray(data) ? data : [];
}
