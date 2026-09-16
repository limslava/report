import ExcelJS from 'exceljs';
import { DISPATCHER_FINANCE_FIELDS } from '../constants/dispatcher-journal-access';

/**
 * Excel реестра диспетчерского отдела: все заявки, лист на каждый месяц, столбцы как в реестре
 * (порядок строк — общий порядок реестра). Цвета статусов и значений справочников — как в таблице.
 */

export type ExportOrder = {
  orderDate: string;
  position: number;
  [field: string]: unknown;
};

export type ExportColor = { color: string | null; textColor: string | null };

type ExportColumn = {
  field: string;
  title: string;
  width: number;
  kind?: 'money' | 'checkbox' | 'computed';
  /** справочник, из которого берётся цвет значения */
  palette?: 'status' | 'client' | 'ktk_type' | 'vat' | 'operation' | 'terminal_from' | 'terminal_to';
};

/** Столбцы реестра (порядок и названия — как в DispatcherJournalPage). */
export const DISPATCHER_EXPORT_COLUMNS: ExportColumn[] = [
  { field: 'orderNumber', title: '№ заказа', width: 11 },
  { field: 'status', title: 'Статус', width: 16, palette: 'status' },
  { field: 'info', title: 'Инфо', width: 10 },
  { field: 'client', title: 'Клиент', width: 18, palette: 'client' },
  { field: 'driverName', title: 'ФИО водителя', width: 18 },
  { field: 'vehiclePlate', title: 'Гос номер', width: 13 },
  { field: 'ktkNumber', title: '№ КТК', width: 15 },
  { field: 'ktkType', title: 'Тип', width: 9, palette: 'ktk_type' },
  { field: 'grossWeight', title: 'Вес (брутто)', width: 11 },
  { field: 'comments', title: 'Комментарии', width: 24 },
  { field: 'operation', title: 'Операция', width: 14, palette: 'operation' },
  { field: 'terminalFrom', title: 'Терминал постановки', width: 20, palette: 'terminal_from' },
  { field: 'slotFrom', title: 'Слот', width: 9 },
  { field: 'pinFrom', title: 'Пин', width: 9 },
  { field: 'submitTime', title: 'Время подачи', width: 10 },
  { field: 'deliveryAddress', title: 'Адрес доставки', width: 28 },
  { field: 'terminalTo', title: 'Терминал снятия', width: 20, palette: 'terminal_to' },
  { field: 'slotTo', title: 'Слот снятия', width: 9 },
  { field: 'pinTo', title: 'Пин снятия', width: 9 },
  { field: 'driverRate', title: 'Ставка водителя', width: 13, kind: 'money' },
  { field: 'vat', title: 'НДС', width: 10, palette: 'vat' },
  { field: 'clientRate', title: 'Ставка', width: 13, kind: 'money' },
  { field: 'passes', title: 'Пропуска', width: 12, kind: 'money' },
  { field: 'amountWithoutVat', title: 'Без НДС', width: 13, kind: 'computed' },
  { field: 'extraAddress', title: 'Доп адрес', width: 20 },
  { field: 'demurrage', title: 'Простой/руб', width: 12, kind: 'money' },
  { field: 'orderOnVehicle', title: 'Заказ на ТС', width: 9, kind: 'checkbox' },
  { field: 'invoiceSent', title: 'Отправка счета', width: 9, kind: 'checkbox' },
  { field: 'extraTon', title: 'Доп тонна', width: 10 },
  { field: 'seal', title: 'Пломба', width: 11 },
  { field: 'recoupling', title: 'Перецеп', width: 9, kind: 'checkbox' },
  { field: 'driverRemarks', title: 'Замечания к водителю', width: 24 },
  { field: 'responsible', title: 'Ответственный', width: 16 },
];

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Сумма из ячейки реестра: «41 000», «12000+3800», «2x2500», «27,5»; непонятный текст — null. */
export const parseRegistryAmount = (raw: unknown): number | null => {
  const text = String(raw ?? '').replace(/ /g, ' ').trim();
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
};

/** «Без НДС»: (ставка + пропуска) / (1 + ставка НДС), как в реестре. */
const amountWithoutVat = (order: ExportOrder): number | null => {
  const rate = parseRegistryAmount(order.clientRate);
  const passes = parseRegistryAmount(order.passes) ?? 0;
  if (rate === null && !passes) return null;
  const vatMatch = /(\d+(?:[.,]\d+)?)\s*%/.exec(String(order.vat ?? ''));
  const vatRate = vatMatch ? Number(vatMatch[1].replace(',', '.')) : 0;
  return Math.round((((rate ?? 0) + passes) / (1 + vatRate / 100)) * 100) / 100;
};

const argb = (hex: string): string => `FF${hex.replace('#', '').toUpperCase()}`;

/** Тёмный текст на светлом фоне и белый на тёмном — как в реестре. */
const contrastText = (hex: string): string => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1F2733' : '#FFFFFF';
};

export function buildDispatcherJournalWorkbook(params: {
  orders: ExportOrder[];
  /** цвета значений: palette → название → цвет */
  palettes: Record<string, Map<string, ExportColor>>;
  hideFinance: boolean;
}): ExcelJS.Workbook {
  const hidden = new Set<string>(params.hideFinance ? [...DISPATCHER_FINANCE_FIELDS, 'amountWithoutVat'] : []);
  const columns = DISPATCHER_EXPORT_COLUMNS.filter((column) => !hidden.has(column.field));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Report';

  const byMonth = new Map<string, ExportOrder[]>();
  [...params.orders]
    .sort((a, b) => a.position - b.position || a.orderDate.localeCompare(b.orderDate))
    .forEach((order) => {
      const month = order.orderDate.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), order]);
    });

  const border = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  [...byMonth.keys()].sort().forEach((month) => {
    const [year, monthNo] = month.split('-').map(Number);
    const sheet = workbook.addWorksheet(`${MONTHS[monthNo - 1]} ${year}`, {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    });
    sheet.columns = [
      { header: '№', key: '__num', width: 6 },
      { header: 'Дата', key: 'orderDate', width: 11 },
      ...columns.map((column) => ({ header: column.title, key: column.field, width: column.width })),
    ];
    const header = sheet.getRow(1);
    header.height = 30;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF1F2733' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: border, left: border, bottom: border, right: border };
    });

    (byMonth.get(month) ?? []).forEach((order, index) => {
      const [y, m, d] = order.orderDate.split('-').map(Number);
      const values: Record<string, unknown> = { __num: index + 1, orderDate: new Date(Date.UTC(y, m - 1, d)) };
      columns.forEach((column) => {
        const raw = order[column.field];
        if (column.kind === 'checkbox') values[column.field] = raw ? 'да' : '';
        else if (column.kind === 'computed') values[column.field] = amountWithoutVat(order);
        else if (column.kind === 'money') values[column.field] = parseRegistryAmount(raw) ?? (raw ?? '');
        else values[column.field] = raw ?? '';
      });
      const row = sheet.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { vertical: 'top' };
      });
      row.getCell('orderDate').numFmt = 'dd.mm.yyyy';
      columns.forEach((column) => {
        const cell = row.getCell(column.field);
        if (column.kind === 'money' || column.kind === 'computed') {
          if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
          cell.alignment = { vertical: 'top', horizontal: 'right' };
        }
        if (column.kind === 'checkbox') cell.alignment = { vertical: 'top', horizontal: 'center' };
        if (!column.palette) return;
        const entry = params.palettes[column.palette]?.get(String(order[column.field] ?? ''));
        if (!entry?.color) return;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(entry.color) } };
        cell.font = { color: { argb: argb(entry.textColor ?? contrastText(entry.color)) } };
      });
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length + 2 } };
  });

  if (!workbook.worksheets.length) workbook.addWorksheet('Заявок нет');
  return workbook;
}
