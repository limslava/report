/**
 * Устройство с «грубым» указателем (палец) — телефоны и планшеты.
 * Используется, чтобы НЕ автофокусировать поля на тач-устройствах:
 * автофокус мгновенно открывает клавиатуру, экран прыгает и скролл
 * ощущается сломанным (замечание тестирования склада 09.09).
 */
export const isCoarsePointer = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches
);
