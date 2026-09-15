/**
 * Чистые помощники реестра диспетчеров: ФИО с инициалами, суммы из
 * «текстовых» денежных ячеек, НДС, время подачи, текст заказа водителю.
 */

/** Тёмный или светлый текст поверх цветной заливки (статус, значение справочника). */
export function textColorFor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#1f2733';
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? '#1f2733' : '#ffffff';
}

/** «Чугунов Иван Петрович» → «Чугунов И.П.»; уже сокращённое и одиночное слово — как есть. */
export function shortPersonName(raw: string | null | undefined): string {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const [surname, ...rest] = parts;
  const initials = rest
    .flatMap((part) => part.split('.'))
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('');
  return `${surname} ${initials}`;
}

/** Сравнение ФИО без учёта формы записи: «Чугунов И.П.» == «Чугунов Иван Петрович». */
export const personKey = (raw: string | null | undefined): string =>
  shortPersonName(raw).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Госномер без пробелов и в верхнем регистре, латиница → кириллица. */
export function plateKey(raw: string | null | undefined): string {
  const latinToCyrillic: Record<string, string> = {
    A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х',
  };
  return (raw ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[ABEKMHOPCTYX]/g, (char) => latinToCyrillic[char] ?? char);
}

/**
 * Сумма из текстовой ячейки: «41 000», «12000+3800», «2x2500», «2*2 500», «27,5».
 * Непонятный текст — null (в расчётах не участвует).
 */
export function parseAmount(raw: string | null | undefined): number | null {
  const text = (raw ?? '').replace(/ /g, ' ').trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, '').replace(/[хx×*]/gi, '*').replace(/,/g, '.');
  if (!/^[\d.+*]+$/.test(compact)) return null;
  let total = 0;
  for (const term of compact.split('+')) {
    if (!term) return null;
    let product = 1;
    for (const factor of term.split('*')) {
      const value = Number(factor);
      if (!factor || !Number.isFinite(value)) return null;
      product *= value;
    }
    total += product;
  }
  return total;
}

/** Ставка НДС из варианта справочника: «НДС22%» → 22; «без НДС», «нал» → 0; пусто → null. */
export function vatRateOf(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(text);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

/**
 * «Без НДС»: (ставка + пропуска), из которой выделен НДС. Ставка в реестре
 * указывается с НДС, поэтому при «НДС22%» сумма делится на 1,22; при
 * «без НДС» / «нал» — остаётся как есть. Без ставки — null.
 */
export function amountWithoutVat(clientRate: string | null, passes: string | null, vat: string | null): number | null {
  const rate = parseAmount(clientRate);
  const passesAmount = parseAmount(passes) ?? 0;
  if (rate === null && !passesAmount) return null;
  const gross = (rate ?? 0) + passesAmount;
  const vatRate = vatRateOf(vat) ?? 0;
  return Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
}

export const formatMoney = (value: number | null): string =>
  value === null ? '' : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/**
 * Формат «Финансы» (как в google): «41000» → «41 000,00 ₽». Только для чистого
 * числа; запись вроде «12000+3800», «2x2500» или «уточнить» показывается как есть.
 */
export function formatFinance(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).trim();
  if (!text) return '';
  if (!/^-?\d[\d\s\u00a0\u202f]*([.,]\d+)?$/.test(text)) return text;
  const value = Number(text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return text;
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Время подачи из ручного ввода: «8» → 08:00, «830» / «8.30» / «8-30» → 08:30,
 * «18:30» → 18:30. Если это не время (например «к 10», «13-14/30») — текст как есть.
 */
export function normalizeTimeInput(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  let match = /^(\d{1,2})$/.exec(text);
  if (match) {
    const hours = Number(match[1]);
    return hours <= 23 ? `${pad2(hours)}:00` : text;
  }
  match = /^(\d{1,2})[:.\-,](\d{2})$/.exec(text) ?? /^(\d{1,2})(\d{2})$/.exec(text);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours <= 23 && minutes <= 59 ? `${pad2(hours)}:${pad2(minutes)}` : text;
  }
  return text;
}

export const isStrictTime = (value: string | null | undefined): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');

/** Строка «выполнено» — подсвечивается зелёным. */
export const isCompletedStatus = (status: string | null | undefined): boolean =>
  /^выполнен/i.test((status ?? '').trim());

/** Предупреждение в примечании заказа (как в рабочем шаблоне отдела). */
export const ORDER_AXLE_WARNING =
  '❗️ ❗️ ❗️ При проезде пунктов автоматического весового и габаритного контроля- опускать все все оси❗️ ❗️ ❗️';

export type OrderTextSource = {
  orderDate: string;
  ktkNumber: string | null;
  ktkType: string | null;
  grossWeight: string | null;
  operation: string | null;
  terminalFrom: string | null;
  slotFrom: string | null;
  pinFrom: string | null;
  deliveryAddress: string | null;
  submitTime: string | null;
  terminalTo: string | null;
  vehiclePlate: string | null;
  /** «Комментарии» реестра — там диспетчеры пишут контакт получателя */
  comments: string | null;
};

/** Перемещение КТК между терминалами: доставки на адрес нет. */
export const isRelocationOperation = (operation: string | null | undefined): boolean =>
  /^перемещени/i.test((operation ?? '').trim());

/**
 * Текст «Заказ» для отправки водителю/перевозчику в мессенджер (*…* — жирный).
 * Для перемещения строки «Адрес доставки» и «Время доставки» не выводятся.
 */
export function buildOrderText(row: OrderTextSource): string {
  const [year, month, day] = row.orderDate.split('-');
  const value = (raw: string | null) => (raw ?? '').trim();
  const note = [value(row.vehiclePlate), ORDER_AXLE_WARNING].filter(Boolean).join('\n');
  const relocation = isRelocationOperation(row.operation);
  const lines: Array<[string, string] | null> = [
    ['Номер контейнера', value(row.ktkNumber)],
    ['Тип контейнера', value(row.ktkType)],
    ['Вес', value(row.grossWeight)],
    ['Тип операции', value(row.operation)],
    ['Терминал постановки', value(row.terminalFrom)],
    ['Слот', value(row.slotFrom)],
    ['Пин', value(row.pinFrom)],
    relocation ? null : ['Адрес доставки', value(row.deliveryAddress)],
    relocation ? null : ['Время доставки', value(row.submitTime)],
    ['Контактная информация', value(row.comments)],
    ['Сдача контейнера', value(row.terminalTo)],
    ['Примечание', note],
  ];
  return [
    `ДАТА ${day}.${month}.${year.slice(2)}`,
    ...lines
      .filter((line): line is [string, string] => line !== null)
      .map(([label, text]) => `*${label}* ${text}`.trimEnd()),
  ].join('\n');
}

/**
 * Разбор буфера обмена из Excel / google-таблиц в сетку ячеек: колонки — табуляция,
 * строки — перевод строки; ячейка с переносами внутри приходит в кавычках ("…", "" — кавычка).
 * Завершающая пустая строка (Excel добавляет её в конце) отбрасывается.
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let index = 0;
  const source = text.replace(/\r\n?/g, '\n');
  while (index < source.length) {
    const char = source[index];
    if (cell === '' && char === '"') {
      // ячейка в кавычках: читаем до закрывающей кавычки перед \t, \n или концом
      let end = index + 1;
      let value = '';
      let closed = false;
      while (end < source.length) {
        if (source[end] === '"') {
          if (source[end + 1] === '"') {
            value += '"';
            end += 2;
            continue;
          }
          const after = source[end + 1];
          if (after === undefined || after === '\t' || after === '\n') {
            closed = true;
            break;
          }
        }
        value += source[end];
        end += 1;
      }
      if (closed) {
        cell = value;
        index = end + 1;
        continue;
      }
    }
    if (char === '\t') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
    index += 1;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Протягивание с Ctrl: «TRZU0009» + 1 → «TRZU0010», «5» + 2 → «7»; без числа в конце — как есть. */
export function seriesValue(value: string, step: number): string {
  const match = /^(.*?)(\d+)(\D*)$/.exec(value);
  if (!match) return value;
  const [, prefix, digits, suffix] = match;
  const next = Number(digits) + step;
  if (next < 0) return value;
  return `${prefix}${String(next).padStart(digits.length, '0')}${suffix}`;
}

/** Дата «YYYY-MM-DD» + дни. */
export function addDaysYmd(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Своя сортировка сотрудника (как в google, но у каждого своя): порядок id строк.
 * Строки, которых в сохранённом порядке нет (добавлены позже, в том числе
 * коллегами), встают сразу за своим предыдущим соседом из общего порядка.
 */
export function applyPersonalOrder<T extends { id: string }>(rows: T[], order: string[] | null): T[] {
  if (!order?.length) return rows;
  const rank = new Map(order.map((id, index) => [id, index]));
  let lastRank = -1;
  const ranked = rows.map((row, index) => {
    const known = rank.get(row.id);
    if (known !== undefined) lastRank = known;
    // неизвестная строка — сразу за предыдущей известной, сохраняя общий порядок между собой
    return { row, key: known !== undefined ? known : lastRank + 0.5 + index / (rows.length * 4 + 4) };
  });
  return ranked.sort((a, b) => a.key - b.key).map((item) => item.row);
}

/**
 * Сортировка «как в google» один раз: видимые строки (после фильтра) сортируются
 * между собой и встают на места, которые они занимали; скрытые остаются на своих.
 * Возвращает новый порядок id всей таблицы.
 */
export function sortWithinSlots<T extends { id: string }>(
  full: T[],
  visibleIds: string[],
  sortVisible: (rows: T[]) => T[],
): string[] {
  const visibleSet = new Set(visibleIds);
  const slots: number[] = [];
  const visibleRows: T[] = [];
  full.forEach((row, index) => {
    if (!visibleSet.has(row.id)) return;
    slots.push(index);
    visibleRows.push(row);
  });
  const sorted = sortVisible(visibleRows);
  const next = full.map((row) => row.id);
  slots.forEach((slot, index) => {
    next[slot] = sorted[index].id;
  });
  return next;
}

/** Дни идут сплошными блоками (нужно для жёлтых полос дней): одна дата не встречается дважды вразброс. */
export function datesAreGrouped(rows: Array<{ orderDate: string }>): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const date = rows[index].orderDate;
    if (index > 0 && date === rows[index - 1].orderDate) continue;
    if (seen.has(date)) return false;
    seen.add(date);
  }
  return true;
}
