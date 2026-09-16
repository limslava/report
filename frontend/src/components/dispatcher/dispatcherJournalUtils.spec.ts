import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  amountWithoutVat,
  parseClipboardGrid,
  clipboardTextForCell,
  seriesValue,
  buildOrderText,
  isCompletedStatus,
  normalizeTimeInput,
  parseAmount,
  personKey,
  plateKey,
  shortPersonName,
  vatRateOf,
  formatFinance,
  sortWithinSlots,
  applyPersonalOrder,
  orderNumberSortKey,
  datesAreGrouped,
  rangeCellKeys,
  summarizeSelection,
  planBlockFill,
  planPasteIntoSelection,
  matchesCondition,
  isConditionActive,
  colorKeyOf,
} from './dispatcherJournalUtils';

describe('dispatcherJournalUtils', () => {
  it('сокращает ФИО до фамилии и инициалов', () => {
    expect(shortPersonName('Чугунов Иван Петрович')).toBe('Чугунов И.П.');
    expect(shortPersonName('Чугунов И.П.')).toBe('Чугунов И.П.');
    expect(shortPersonName('Чугунов')).toBe('Чугунов');
    expect(personKey('чугунов иван петрович')).toBe(personKey('Чугунов И. П.'));
  });

  it('нормализует госномер', () => {
    expect(plateKey('M604XP 125')).toBe(plateKey('М604ХР125'));
  });

  it('разбирает суммы из текста', () => {
    expect(parseAmount('41 000')).toBe(41000);
    expect(parseAmount('12000+3800')).toBe(15800);
    expect(parseAmount('2x2500')).toBe(5000);
    expect(parseAmount('27,5')).toBe(27.5);
    expect(parseAmount('к 10')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('считает «Без НДС» из ставки и пропусков', () => {
    expect(vatRateOf('НДС22%')).toBe(22);
    expect(vatRateOf('нал')).toBe(0);
    expect(amountWithoutVat('24400', '', 'НДС22%')).toBe(20000);
    expect(amountWithoutVat('20000', '2x500', 'нал')).toBe(21000);
    expect(amountWithoutVat('', '', 'НДС22%')).toBeNull();
  });

  it('приводит ручной ввод к времени', () => {
    expect(normalizeTimeInput('8')).toBe('08:00');
    expect(normalizeTimeInput('830')).toBe('08:30');
    expect(normalizeTimeInput('18.30')).toBe('18:30');
    expect(normalizeTimeInput('к 10')).toBe('к 10');
  });

  it('узнаёт выполненный статус', () => {
    expect(isCompletedStatus('выполнена')).toBe(true);
    expect(isCompletedStatus('новая')).toBe(false);
  });

  it('собирает текст заказа', () => {
    const text = buildOrderText({
      orderDate: '2026-09-01',
      ktkNumber: 'TRZU1103134',
      ktkType: '40HC',
      grossWeight: '9200',
      operation: 'выгрузка',
      terminalFrom: 'Сухой порт',
      slotFrom: 'ам 9164',
      pinFrom: null,
      deliveryAddress: 'г.Артем Солнечная 46 с 4',
      submitTime: '10:00',
      terminalTo: 'Первомайский',
      vehiclePlate: 'Н099СВ 125',
      comments: '8 914 711-32-23 Алексей',
    });
    expect(text.split('\n')[0]).toBe('ДАТА 01.09.26');
    expect(text).toContain('*Номер контейнера* TRZU1103134');
    expect(text).toContain('*Пин*\n');
    expect(text).toContain('*Контактная информация* 8 914 711-32-23 Алексей');
    expect(text).toContain('*Примечание* Н099СВ 125\n❗️');
  });

  it('для перемещения не выводит адрес и время доставки', () => {
    const base = {
      orderDate: '2026-09-01', ktkNumber: 'TRZU1103134', ktkType: '40HC', grossWeight: null,
      terminalFrom: 'Сухой порт', slotFrom: null, pinFrom: null, deliveryAddress: 'г.Артем',
      submitTime: '10:00', terminalTo: 'Первомайский', vehiclePlate: null, comments: null,
    };
    const relocation = buildOrderText({ ...base, operation: 'Перемещение' });
    expect(relocation).not.toContain('Адрес доставки');
    expect(relocation).not.toContain('Время доставки');
    expect(relocation).toContain('*Сдача контейнера* Первомайский');
    expect(buildOrderText({ ...base, operation: 'выгрузка' })).toContain('*Адрес доставки* г.Артем');
  });

  it('разбирает вставку из Excel/google: столбик, таблица, ячейки с переносами', () => {
    expect(parseClipboardGrid('TRZU1\nTRZU2\nTRZU3\n')).toEqual([['TRZU1'], ['TRZU2'], ['TRZU3']]);
    expect(parseClipboardGrid('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseClipboardGrid('"Владивосток,\nПолтавская 18"\tвыгрузка\nx\ty')).toEqual([
      ['Владивосток,\nПолтавская 18', 'выгрузка'],
      ['x', 'y'],
    ]);
    expect(parseClipboardGrid('кузов "А"\t1')).toEqual([['кузов "А"', '1']]);
  });

  it('протягивание рядом: число в конце увеличивается, нули сохраняются', () => {
    expect(seriesValue('TRZU0009', 1)).toBe('TRZU0010');
    expect(seriesValue('5', 2)).toBe('7');
    expect(seriesValue('выгрузка', 3)).toBe('выгрузка');
    expect(addDaysYmd('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('formatFinance', () => {
  const norm = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
  it('форматирует чистое число как «41 000,00 ₽»', () => {
    expect(norm(formatFinance('41000'))).toBe('41 000,00 ₽');
    expect(norm(formatFinance('41 000'))).toBe('41 000,00 ₽');
    expect(norm(formatFinance('2500,5'))).toBe('2 500,50 ₽');
    expect(norm(formatFinance(3800))).toBe('3 800,00 ₽');
  });
  it('выражения и текст оставляет как есть', () => {
    expect(formatFinance('12000+3800')).toBe('12000+3800');
    expect(formatFinance('2x2500')).toBe('2x2500');
    expect(formatFinance('уточнить')).toBe('уточнить');
    expect(formatFinance('')).toBe('');
    expect(formatFinance(null)).toBe('');
  });
});

describe('своя сортировка', () => {
  const row = (id: string, status: string, orderDate = '2026-09-15') => ({ id, status, orderDate });
  const byStatus = <T extends { status: string }>(list: T[]) => [...list].sort((a, b) => a.status.localeCompare(b.status, 'ru'));

  it('сортирует только видимые строки на их местах — как в google после снятия фильтра', () => {
    const full = [row('a', 'в', '2026-09-14'), row('b', 'новая'), row('c', 'за', '2026-09-16'), row('d', 'выполнена')];
    // фильтр по 15.09: видны b и d
    expect(sortWithinSlots(full, ['b', 'd'], byStatus)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('хвостовые пустые строки буфера не превращаются в правки соседних заявок', () => {
    expect(parseClipboardGrid('A1\n')).toEqual([['A1']]);
    expect(parseClipboardGrid('A1\n\n')).toEqual([['A1']]);
    expect(parseClipboardGrid('A1\nB1\n\n')).toEqual([['A1'], ['B1']]);
    expect(parseClipboardGrid('A1\t\nB1\t\n')).toEqual([['A1', ''], ['B1', '']]);
  });

  it('текст в правящуюся ячейку: переносы только в многострочных', () => {
    expect(clipboardTextForCell('ул. Русская 99\nконтакт 8-914\n', true)).toBe('ул. Русская 99\nконтакт 8-914');
    expect(clipboardTextForCell('ул. Русская 99\nконтакт 8-914', false)).toBe('ул. Русская 99 контакт 8-914');
    expect(clipboardTextForCell('A\tB', false)).toBe('A B');
  });

  it('своя сортировка: новые строки встают за предыдущим соседом из общего порядка', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'new' }, { id: 'c' }];
    expect(applyPersonalOrder(rows, ['c', 'b', 'a']).map((item) => item.id)).toEqual(['c', 'b', 'new', 'a']);
    expect(applyPersonalOrder(rows, null).map((item) => item.id)).toEqual(['a', 'b', 'new', 'c']);
  });

  it('№ заказа сортируется по месяцу и номеру', () => {
    expect(orderNumberSortKey('2609-012')).toBeLessThan(orderNumberSortKey('2609-1000') as number);
    expect(orderNumberSortKey('2608-999')).toBeLessThan(orderNumberSortKey('2609-001') as number);
    expect(orderNumberSortKey(null)).toBe('');
  });

  it('полосы дней только когда дни идут блоками', () => {
    expect(datesAreGrouped([row('a', '', '1'), row('b', '', '1'), row('c', '', '2')])).toBe(true);
    expect(datesAreGrouped([row('a', '', '1'), row('b', '', '2'), row('c', '', '1')])).toBe(false);
  });
});

describe('выделение ячеек', () => {
  it('диапазон между двумя ячейками в любом направлении', () => {
    const rows = ['r1', 'r2', 'r3'];
    const fields = ['a', 'b', 'c'];
    expect(rangeCellKeys({ rowId: 'r3', field: 'b' }, { rowId: 'r2', field: 'a' }, rows, fields))
      .toEqual(['r2|a', 'r2|b', 'r3|a', 'r3|b']);
    expect(rangeCellKeys({ rowId: 'x', field: 'a' }, { rowId: 'r1', field: 'a' }, rows, fields)).toEqual([]);
  });

  it('итоги: заполнено, сумма и среднее чисел', () => {
    expect(summarizeSelection(['41000', '12000+3800', 'SKLU1582588', '', '2x2500'])).toEqual({
      filled: 4, numbers: 3, sum: 61800, average: 20600,
    });
    expect(summarizeSelection(['текст', ''])).toEqual({ filled: 1, numbers: 0, sum: 0, average: null });
  });
});

describe('протягивание и вставка в выделение', () => {
  const block = [['A1', '1'], ['A2', '2']];
  const textAt = (row: number, col: number) => block[row]?.[col] ?? '';

  it('блок из двух строк повторяется вниз', () => {
    const plan = planBlockFill({ minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 }, 4, textAt, null);
    expect(plan.filter((cell) => cell.col === 0).map((cell) => `${cell.row}:${cell.text}`)).toEqual(['2:A1', '3:A2', '4:A1']);
  });

  it('с рядом — продолжает крайнее значение блока', () => {
    const plan = planBlockFill({ minRow: 0, maxRow: 1, minCol: 1, maxCol: 1 }, 3, textAt, (_col, base, delta) => String(Number(base) + delta));
    expect(plan.map((cell) => cell.text)).toEqual(['3', '4']);
  });

  it('вверх — от первой строки блока', () => {
    const plan = planBlockFill({ minRow: 5, maxRow: 5, minCol: 0, maxCol: 0 }, 3, () => 'x', null);
    expect(plan.map((cell) => cell.row)).toEqual([3, 4]);
  });

  it('одно значение — во все выделенные; кратная таблица — повторяется', () => {
    const cells = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 3, col: 0 }];
    expect(planPasteIntoSelection(cells, [['v']])?.map((cell) => cell.text)).toEqual(['v', 'v', 'v', 'v']);
    expect(planPasteIntoSelection(cells, [['a'], ['b']])?.map((cell) => cell.text)).toEqual(['a', 'b', 'a', 'b']);
    expect(planPasteIntoSelection(cells, [['a'], ['b'], ['c']])).toBeNull();
  });
});

describe('фильтр по условию и цвету', () => {
  it('пусто / не пусто / содержит / не содержит — без учёта регистра', () => {
    expect(matchesCondition('', { type: 'empty' })).toBe(true);
    expect(matchesCondition('  ', { type: 'notEmpty' })).toBe(false);
    expect(matchesCondition('РЖД БИЗНЕС АКТИВ', { type: 'contains', value: 'ржд' })).toBe(true);
    expect(matchesCondition('Хасан', { type: 'notContains', value: 'ржд' })).toBe(true);
    expect(matchesCondition('Хасан', { type: 'contains', value: '  ' })).toBe(true);
  });

  it('дата с … по … включительно, пустая граница — без ограничения', () => {
    const range = { type: 'dateRange' as const, from: '2026-09-10', to: '2026-09-15' };
    expect(['2026-09-09', '2026-09-10', '2026-09-15', '2026-09-16'].map((date) => matchesCondition(date, range)))
      .toEqual([false, true, true, false]);
    expect(matchesCondition('2026-09-30', { type: 'dateRange', from: '2026-09-20', to: '' })).toBe(true);
    expect(isConditionActive({ type: 'dateRange', from: '', to: '' })).toBe(false);
  });

  it('ключ цвета', () => {
    expect(colorKeyOf('#38761D')).toBe('#38761d');
    expect(colorKeyOf(null)).toBe('none');
  });
});
