import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Работа с ячейками реестра «как в google-таблицах»:
 * клик — выделить ячейку, двойной клик / Enter / F2 / ввод символа — править,
 * стрелки и Tab — перейти к соседней ячейке.
 */
export type CellNavDirection = 'up' | 'down' | 'left' | 'right' | 'next' | 'prev';

export const CELL_NAV_EVENT = 'dj-cell-nav';

/** Попросить таблицу перевести выделение из этой ячейки в соседнюю. */
export const requestCellNav = (from: HTMLElement, direction: CellNavDirection): void => {
  from.dispatchEvent(new CustomEvent<{ direction: CellNavDirection }>(CELL_NAV_EVENT, { bubbles: true, detail: { direction } }));
};

/** Символ, с которого начинается ввод в выделенную ячейку (буква, цифра, знак). */
export const isPrintableKey = (event: ReactKeyboardEvent): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

/** Направление перехода по клавише в режиме выделения (null — клавиша не для перехода). */
export const navDirectionOf = (event: ReactKeyboardEvent): CellNavDirection | null => {
  switch (event.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Tab': return event.shiftKey ? 'prev' : 'next';
    default: return null;
  }
};
