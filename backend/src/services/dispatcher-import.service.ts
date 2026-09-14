import ExcelJS from 'exceljs';

/**
 * Разовый импорт рабочей google-таблицы диспетчеров (выгрузка .xlsx) в реестр.
 *
 * Листы-месяцы («Сентябрь 2026» и т.п.) распознаются по шапке: в первых строках
 * есть «статус» и «клиент». Колонки сопоставляются по названиям; повторяющиеся
 * «слот»/«пин» относятся к терминалу, после которого стоят (постановки/снятия).
 * Строки без даты и строки-разделители дней (только дата) пропускаются.
 */

export type ImportedOrder = {
  orderDate: string;
  status: string | null;
  info: string | null;
  client: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  ktkNumber: string | null;
  ktkType: string | null;
  grossWeight: string | null;
  comments: string | null;
  operation: string | null;
  terminalFrom: string | null;
  slotFrom: string | null;
  pinFrom: string | null;
  submitTime: string | null;
  deliveryAddress: string | null;
  terminalTo: string | null;
  slotTo: string | null;
  pinTo: string | null;
  driverRate: string | null;
  vat: string | null;
  clientRate: string | null;
  passes: string | null;
  extraAddress: string | null;
  demurrage: string | null;
  orderOnVehicle: boolean;
  invoiceSent: boolean;
  extraTon: string | null;
  seal: string | null;
  recoupling: boolean;
  driverRemarks: string | null;
};

export type ImportedSheet = { name: string; orders: ImportedOrder[]; skippedRows: number; unmappedColumns: string[] };

type TextField = Exclude<keyof ImportedOrder, 'orderDate' | 'orderOnVehicle' | 'invoiceSent' | 'recoupling'>;
type BoolField = 'orderOnVehicle' | 'invoiceSent' | 'recoupling';

/** Заглушки из выпадающих списков таблицы — не данные. */
const PLACEHOLDERS = new Set(['вес', 'пин', 'слот']);
const TRUE_WORDS = new Set(['true', 'да', 'истина', '1', '+', 'yes']);

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Значение ячейки exceljs → «сырой» объект без обёрток (формулы, rich text, ссылки). */
const unwrap = (value: ExcelJS.CellValue): unknown => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as unknown as Record<string, unknown>;
    if ('result' in record) return record.result;
    if ('richText' in record && Array.isArray(record.richText)) {
      return (record.richText as Array<{ text: string }>).map((part) => part.text).join('');
    }
    if ('text' in record) return record.text;
    if ('error' in record) return null;
  }
  return value;
};

/**
 * Google сам превращает набранные диапазоны в даты: «10-12» → 10 декабря
 * текущего года, «8-18» → август 2018 (второе число > 12 — это «год»).
 * Для слотов/пинов возвращаем текст, как его набирали.
 */
const googleDateToTyped = (value: Date): string => {
  const day = value.getUTCDate();
  const month = value.getUTCMonth() + 1;
  const year = value.getUTCFullYear();
  if (day === 1 && year >= 2013 && year <= 2024) return `${month}-${String(year).slice(2)}`;
  if (year >= 2025 && year <= 2027) return `${day}-${month}`;
  return `${pad2(day)}.${pad2(month)}.${year}`;
};

/** «8», «10-00», «11.00», «8^30» → чч:мм; «к 10», «до 15:30» и прочий текст — как есть. */
const normalizeTypedTime = (text: string): string => {
  const match = /^(\d{1,2})(?:[:.\-^](\d{2}))?$/.exec(text);
  if (!match) return text;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  return hours <= 23 && minutes <= 59 ? `${pad2(hours)}:${pad2(minutes)}` : text;
};

const cellText = (value: unknown, field: TextField): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (field === 'submitTime' && value.getUTCFullYear() < 1901) {
      return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
    }
    return googleDateToTyped(value);
  }
  if (typeof value === 'number' && field === 'submitTime') {
    // «8» — это 08:00; дробь суток (0,375) — время в формате Excel
    if (Number.isInteger(value) && value >= 0 && value <= 23) return `${pad2(value)}:00`;
    if (value > 0 && value < 1) {
      const minutes = Math.round(value * 24 * 60);
      return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
    }
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === 'boolean') return value ? 'да' : '';
  const text = String(value).replace(/\r\n/g, '\n').trim();
  return field === 'submitTime' ? normalizeTypedTime(text) : text;
};

const cellDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === 'string') {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(value.trim());
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${pad2(Number(match[2]))}-${pad2(Number(match[1]))}`;
    }
  }
  return null;
};

type ColumnPlan = {
  date: number;
  text: Map<number, TextField>;
  bool: Map<number, BoolField>;
  /** колонки шапки, которые не удалось сопоставить (для сводки импорта) */
  unmapped: string[];
};

/** Сопоставление колонок по шапке листа; null — лист не похож на реестр. */
function planColumns(header: string[]): ColumnPlan | null {
  if (!header.includes('статус') || !header.includes('клиент')) return null;
  const text = new Map<number, TextField>();
  const bool = new Map<number, BoolField>();
  const unmapped: string[] = [];
  let section: 'from' | 'to' | null = null;
  const clientColumn = header.indexOf('клиент') + 1;
  const plateColumn = header.indexOf('гос номер') + 1;
  header.forEach((name, index) => {
    const column = index + 1;
    if (index === 0) return; // дата
    // колонку ФИО иногда затирают фамилией — она всегда между «клиентом» и «гос номером»
    if (clientColumn && plateColumn === clientColumn + 2 && column === clientColumn + 1) {
      text.set(column, 'driverName');
      return;
    }
    // вторая колонка «пин» бывает без заголовка
    if (!name) {
      const previous = text.get(column - 1);
      if (previous === 'pinFrom' || previous === 'pinTo') text.set(column, previous);
      return;
    }
    if (name === 'терминал постановки') { text.set(column, 'terminalFrom'); section = 'from'; return; }
    if (name === 'терминал снятия') { text.set(column, 'terminalTo'); section = 'to'; return; }
    if (name === 'слот' && section) { text.set(column, section === 'from' ? 'slotFrom' : 'slotTo'); return; }
    if (name === 'пин' && section) { text.set(column, section === 'from' ? 'pinFrom' : 'pinTo'); return; }
    const direct: Record<string, TextField> = {
      статус: 'status',
      инфо: 'info',
      клиент: 'client',
      'фио водителя': 'driverName',
      'гос номер': 'vehiclePlate',
      '№ ктк': 'ktkNumber',
      'тип ктк': 'ktkType',
      'вес ктк (брутто)': 'grossWeight',
      вес: 'grossWeight',
      комментарии: 'comments',
      операция: 'operation',
      'время подачи': 'submitTime',
      'адрес доставки': 'deliveryAddress',
      'ставка водителя': 'driverRate',
      ндс: 'vat',
      ставка: 'clientRate',
      пропуска: 'passes',
      'доп адрес': 'extraAddress',
      'доп тонна': 'extraTon',
      пломба: 'seal',
      'замечания к водителю': 'driverRemarks',
    };
    if (direct[name]) { text.set(column, direct[name]); return; }
    if (name.startsWith('простой')) { text.set(column, 'demurrage'); return; }
    if (name === 'заказ на тс') { bool.set(column, 'orderOnVehicle'); return; }
    if (name === 'отправка счета') { bool.set(column, 'invoiceSent'); return; }
    if (name === 'перецеп') { bool.set(column, 'recoupling'); return; }
    unmapped.push(name);
  });
  return { date: 1, text, bool, unmapped };
}

const emptyOrder = (orderDate: string): ImportedOrder => ({
  orderDate,
  status: null, info: null, client: null, driverName: null, vehiclePlate: null, ktkNumber: null,
  ktkType: null, grossWeight: null, comments: null, operation: null, terminalFrom: null, slotFrom: null,
  pinFrom: null, submitTime: null, deliveryAddress: null, terminalTo: null, slotTo: null, pinTo: null,
  driverRate: null, vat: null, clientRate: null, passes: null, extraAddress: null, demurrage: null,
  orderOnVehicle: false, invoiceSent: false, extraTon: null, seal: null, recoupling: false, driverRemarks: null,
});

export async function parseDispatcherWorkbook(buffer: Buffer): Promise<ImportedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets: ImportedSheet[] = [];

  workbook.eachSheet((worksheet) => {
    // шапка — одна из первых трёх строк
    let plan: ColumnPlan | null = null;
    let headerRow = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(3, worksheet.rowCount); rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const header: string[] = [];
      for (let column = 1; column <= Math.max(row.cellCount, 60); column += 1) {
        header.push(normalizeHeader(cellText(unwrap(row.getCell(column).value), 'info')));
      }
      plan = planColumns(header);
      if (plan) { headerRow = rowNumber; break; }
    }
    if (!plan) return;

    const orders: ImportedOrder[] = [];
    let skippedRows = 0;
    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const orderDate = cellDate(unwrap(row.getCell(plan.date).value));
      if (!orderDate) {
        if (row.hasValues) skippedRows += 1;
        continue;
      }
      const order = emptyOrder(orderDate);
      let filled = false;
      plan.text.forEach((field, column) => {
        const value = cellText(unwrap(row.getCell(column).value), field);
        if (!value || PLACEHOLDERS.has(value.toLowerCase())) return;
        const previous = order[field];
        // «пин» занимает две колонки — значения склеиваются
        (order[field] as string | null) = previous ? `${previous} ${value}` : value.slice(0, 4000);
        filled = true;
      });
      plan.bool.forEach((field, column) => {
        const raw = unwrap(row.getCell(column).value);
        const value = raw === true
          || (typeof raw === 'number' && raw !== 0)
          || (typeof raw === 'string' && TRUE_WORDS.has(raw.trim().toLowerCase()));
        order[field] = value;
        if (value) filled = true;
      });
      // строка-разделитель дня (только дата) — не заявка
      if (!filled) {
        skippedRows += 1;
        continue;
      }
      orders.push(order);
    }
    sheets.push({ name: worksheet.name, orders, skippedRows, unmappedColumns: plan.unmapped });
  });

  return sheets;
}
