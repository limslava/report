import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { OperationsPreviewState } from '../models/operations-preview-state.model';

const operationsPreviewRepo = AppDataSource.getRepository(OperationsPreviewState);
const OPERATIONS_PREVIEW_SCOPE_KEY = 'ktk_vvo_preview_v1';

const isValidFilter = (value: unknown): value is 'Все' | 'Контейнеры' | 'Авто' | 'Диспетчера' | 'Курьеры' =>
  value === 'Все' ||
  value === 'Контейнеры' ||
  value === 'Авто' ||
  value === 'Диспетчера' ||
  value === 'Курьеры';

type PreviewSection = 'containers' | 'auto' | 'dispatchers' | 'couriers';
type PreviewMode = 'plan' | 'fact';
type Department = 'Контейнеры' | 'Авто' | 'Диспетчера' | 'Курьеры';
type CellCode = 'W' | 'O' | 'B' | 'H' | 'R' | 'N' | 'V';
type OverrideScopeKey = `${PreviewMode}|${string}`;
type SortField = 'manual' | 'name' | 'plate';
type SortDirection = 'asc' | 'desc';

type PersonRow = {
  id: string;
  name: string;
  secondName?: string;
  plate: string;
  note?: string;
  secondNote?: string;
  department: Department;
};

type PreviewPersistedState = {
  mode?: PreviewMode;
  overrides?: Record<OverrideScopeKey, Record<string, CellCode>>;
  peopleByMonth?: Record<string, PersonRow[]>;
  peopleState?: PersonRow[];
  monthValue?: string;
};

const DEPARTMENT_BY_SECTION: Record<PreviewSection, Department> = {
  containers: 'Контейнеры',
  auto: 'Авто',
  dispatchers: 'Диспетчера',
  couriers: 'Курьеры',
};

const SECTION_LABEL: Record<PreviewSection, string> = {
  containers: 'Контейнеровозы',
  auto: 'Автовозы',
  dispatchers: 'Диспетчера',
  couriers: 'Курьеры (Оперативники)',
};

const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DEFAULT_PREVIEW_PEOPLE: PersonRow[] = [
  { id: 'p1', name: 'Гилев', plate: 'Н1098СВ', department: 'Контейнеры' },
  { id: 'p2', name: 'Иваненко', plate: 'А590ХР', department: 'Контейнеры' },
  { id: 'p3', name: 'Ким', plate: 'М1604ХР', department: 'Контейнеры' },
  { id: 'p4', name: 'Адамюк Р.', plate: 'М1560ХР', department: 'Контейнеры' },
  { id: 'p5', name: 'Анисимов', plate: 'Т216РА', department: 'Контейнеры' },
  { id: 'p6', name: 'Туркин Михаил', plate: 'Т216РА', department: 'Авто' },
  { id: 'p7', name: 'Подгайко Константин', plate: 'Е617ХР', department: 'Авто' },
  { id: 'p8', name: 'Бояров Петр', plate: 'С357ХТ', department: 'Авто' },
  { id: 'p9', name: 'Кузьменко Александр', plate: 'Н103СВ', department: 'Авто' },
  { id: 'p10', name: 'Марутов Евгений', plate: 'Н106СВ', department: 'Авто' },
  { id: 'p11', name: 'Петровский Юрий', plate: 'Х795РА', department: 'Авто' },
  { id: 'p12', name: 'Ахматшин Сергей', plate: 'Н105СВ', department: 'Авто' },
];

const sanitizePayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const source = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if (typeof source.monthValue === 'string') {
    result.monthValue = source.monthValue;
  }
  if (source.mode === 'plan' || source.mode === 'fact') {
    result.mode = source.mode;
  }
  if (isValidFilter(source.filter)) {
    result.filter = source.filter;
  }
  if (source.overrides && typeof source.overrides === 'object' && !Array.isArray(source.overrides)) {
    result.overrides = source.overrides;
  }
  if (source.peopleByMonth && typeof source.peopleByMonth === 'object' && !Array.isArray(source.peopleByMonth)) {
    result.peopleByMonth = source.peopleByMonth;
  }
  if (Array.isArray(source.peopleState)) {
    result.peopleState = source.peopleState;
  }

  return result;
};

const isValidSection = (value: unknown): value is PreviewSection =>
  value === 'containers' || value === 'auto' || value === 'dispatchers' || value === 'couriers';

const isValidSortField = (value: unknown): value is SortField =>
  value === 'manual' || value === 'name' || value === 'plate';

const isValidSortDirection = (value: unknown): value is SortDirection =>
  value === 'asc' || value === 'desc';

const getPrevMonthValue = (value: string): string | null => {
  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

const getMonthlyCell = (rowIndex: number, day: number, department: Department): CellCode => {
  if (department === 'Диспетчера' || department === 'Курьеры') {
    if ((rowIndex + day) % 17 === 0) return 'V';
    if ((rowIndex + day) % 7 === 0) return 'O';
    return 'W';
  }
  if (day % 13 === 0) return 'R';
  if (day % 17 === 0) return 'V';
  if ((rowIndex + day) % 9 === 0) return 'B';
  if ((rowIndex + day) % 7 === 0) return 'O';
  if ((rowIndex + day) % 6 === 0) return 'H';
  if ((rowIndex + day) % 11 === 0) return 'V';
  if ((rowIndex + day) % 5 === 0) return 'N';
  return 'W';
};

const toCellLabel = (code: CellCode): string => {
  const map: Record<CellCode, string> = {
    W: '1',
    O: 'В',
    V: 'О',
    B: 'Б',
    H: 'П',
    R: 'Р',
    N: 'Н',
  };
  return map[code];
};

const buildContentDisposition = (filename: string): string => {
  const sanitized = filename.replace(/"/g, '');
  const asciiFallback = sanitized
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[\\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safeFallback = asciiFallback || 'report.xlsx';
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
};

const extractPeopleByMonth = (payload: PreviewPersistedState): Record<string, PersonRow[]> => {
  if (payload.peopleByMonth && typeof payload.peopleByMonth === 'object') {
    return payload.peopleByMonth;
  }
  if (Array.isArray(payload.peopleState) && payload.peopleState.length > 0) {
    const baseMonth = typeof payload.monthValue === 'string' ? payload.monthValue : '2026-04';
    return { [baseMonth]: payload.peopleState };
  }
  return { '2026-04': DEFAULT_PREVIEW_PEOPLE };
};

const resolvePeopleForMonth = (targetMonth: string, source: Record<string, PersonRow[]>): PersonRow[] => {
  if (Array.isArray(source[targetMonth]) && source[targetMonth].length > 0) return source[targetMonth];
  const prevMonth = getPrevMonthValue(targetMonth);
  if (prevMonth && Array.isArray(source[prevMonth]) && source[prevMonth].length > 0) return source[prevMonth];
  return DEFAULT_PREVIEW_PEOPLE;
};

const parseYear = (value: unknown, fallback: number): number => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return fallback;
  return year;
};

const parseMonth = (value: unknown, fallback: number): number => {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return month;
};

export const getOperationsPreviewState = async (_req: Request, res: Response) => {
  const row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_KEY },
  });

  res.json({
    state: row?.payload ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
};

export const saveOperationsPreviewState = async (req: Request, res: Response) => {
  const sanitized = sanitizePayload(req.body);
  if (!sanitized.overrides || (!sanitized.peopleByMonth && !sanitized.peopleState)) {
    const error: any = new Error('Invalid operations preview payload');
    error.statusCode = 400;
    throw error;
  }

  let row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_KEY },
  });

  if (!row) {
    row = operationsPreviewRepo.create({
      scopeKey: OPERATIONS_PREVIEW_SCOPE_KEY,
      payload: sanitized,
      updatedByUserId: req.user?.id ?? null,
    });
  } else {
    row.payload = sanitized;
    row.updatedByUserId = req.user?.id ?? null;
  }

  const saved = await operationsPreviewRepo.save(row);
  res.json({
    ok: true,
    updatedAt: saved.updatedAt,
  });
};

export const downloadOperationsPreviewExcel = async (req: Request, res: Response) => {
  const sectionRaw = req.query.section;
  if (!isValidSection(sectionRaw)) {
    const error: any = new Error('Invalid section');
    error.statusCode = 400;
    throw error;
  }
  const section = sectionRaw;
  const department = DEPARTMENT_BY_SECTION[section];

  const now = new Date();
  const year = parseYear(req.query.year, now.getFullYear());
  const month = parseMonth(req.query.month, now.getMonth() + 1);
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  const requestedMode: PreviewMode = req.query.mode === 'plan' ? 'plan' : 'fact';
  const mode: PreviewMode = section === 'containers' ? requestedMode : 'fact';

  const sortField: SortField = isValidSortField(req.query.sortField) ? req.query.sortField : 'manual';
  const sortDirection: SortDirection = isValidSortDirection(req.query.sortDirection) ? req.query.sortDirection : 'asc';

  const row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_KEY },
  });

  const payload = (row?.payload ?? {}) as PreviewPersistedState;
  const overrides = (payload.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>;
  const peopleByMonth = extractPeopleByMonth(payload);
  const allPeople = resolvePeopleForMonth(monthValue, peopleByMonth);
  const sectionPeopleBase = allPeople
    .map((person, index) => ({ ...person, rowIndex: index }))
    .filter((person) => person.department === department);

  const sectionPeople =
    sortField === 'manual' || (sortField === 'plate' && (section === 'dispatchers' || section === 'couriers'))
      ? sectionPeopleBase
      : (() => {
          const sorted = [...sectionPeopleBase].sort((a, b) => {
            const left = sortField === 'name' ? a.name : a.plate;
            const right = sortField === 'name' ? b.name : b.plate;
            return left.localeCompare(right, 'ru', { sensitivity: 'base' });
          });
          if (sortDirection === 'desc') {
            sorted.reverse();
          }
          return sorted;
        })();

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekdays = monthDays.map((day) => WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]);
  const scopeKey = `${mode}|${monthValue}` as OverrideScopeKey;
  const scopeOverrides = overrides[scopeKey] ?? {};

  const getCellCode = (
    rowIndex: number,
    day: number,
    personId: string,
    lane: '1' | '2' = '1'
  ): CellCode => {
    const key = `${personId}-${lane}-${day}`;
    return scopeOverrides[key] ?? getMonthlyCell(rowIndex, day, department);
  };

  const isPersonnel = section === 'dispatchers' || section === 'couriers';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('График работы');

  const startRow = 3;
  const nameCol = 1;
  const plateCol = isPersonnel ? -1 : 2;
  const noteCol = isPersonnel ? -1 : 3;
  const dayStartCol = isPersonnel ? 2 : 4;
  const totalCol = dayStartCol + monthDays.length;

  sheet.getCell(1, 1).value = `График работы - ${SECTION_LABEL[section]} (${mode === 'plan' ? 'План' : 'Факт'})`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = `Период: ${String(month).padStart(2, '0')}.${year}`;

  sheet.getColumn(nameCol).width = 24;
  if (!isPersonnel) {
    sheet.getColumn(plateCol).width = 12;
    sheet.getColumn(noteCol).width = 14;
  }
  monthDays.forEach((_, idx) => {
    sheet.getColumn(dayStartCol + idx).width = 4;
  });
  sheet.getColumn(totalCol).width = isPersonnel ? 17 : 11;

  const headerDaysRow = startRow;
  const headerWeekdaysRow = startRow + 1;
  const verticalHeaderEnd = startRow + 1;

  sheet.mergeCells(headerDaysRow, nameCol, verticalHeaderEnd, nameCol);
  sheet.getCell(headerDaysRow, nameCol).value = 'ФИО';
  if (!isPersonnel) {
    sheet.mergeCells(headerDaysRow, plateCol, verticalHeaderEnd, plateCol);
    sheet.getCell(headerDaysRow, plateCol).value = 'Г/Н ТС';
    sheet.mergeCells(headerDaysRow, noteCol, verticalHeaderEnd, noteCol);
    sheet.getCell(headerDaysRow, noteCol).value = 'Примечание';
  }
  sheet.mergeCells(headerDaysRow, totalCol, verticalHeaderEnd, totalCol);
  sheet.getCell(headerDaysRow, totalCol).value = isPersonnel ? 'Количество рабочих смен' : 'Кол-во смен';

  monthDays.forEach((day, index) => {
    const col = dayStartCol + index;
    sheet.getCell(headerDaysRow, col).value = day;
    const weekdayCell = sheet.getCell(headerWeekdaysRow, col);
    weekdayCell.value = weekdays[index];
    if (weekdays[index] === 'сб' || weekdays[index] === 'вс') {
      weekdayCell.font = { color: { argb: 'FFD32F2F' } };
    }
  });

  const applyBorder = (rowNumber: number) => {
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(rowNumber, col).border = {
        top: { style: 'thin', color: { argb: 'FFD6DCE8' } },
        left: { style: 'thin', color: { argb: 'FFD6DCE8' } },
        bottom: { style: 'thin', color: { argb: 'FFD6DCE8' } },
        right: { style: 'thin', color: { argb: 'FFD6DCE8' } },
      };
    }
  };

  const applyRowAlignment = (rowNumber: number) => {
    sheet.getRow(rowNumber).height = 26;
    for (let col = 1; col <= totalCol; col += 1) {
      const isLeft = col === nameCol || (!isPersonnel && (col === plateCol || col === noteCol));
      sheet.getCell(rowNumber, col).alignment = {
        vertical: 'middle',
        horizontal: isLeft ? 'left' : 'center',
      };
    }
  };

  [headerDaysRow, headerWeekdaysRow].forEach((rowNumber) => {
    applyBorder(rowNumber);
    applyRowAlignment(rowNumber);
    sheet.getRow(rowNumber).font = { size: 11, bold: false };
  });

  sheet.getRow(headerDaysRow).height = 30;
  sheet.getRow(headerWeekdaysRow).height = 28;

  let cursorRow = startRow + 2;
  sectionPeople.forEach((person) => {
    const lanes: Array<'1' | '2'> = person.secondName ? ['1', '2'] : ['1'];
    lanes.forEach((lane) => {
      const rowIndex = lane === '1' ? person.rowIndex : person.rowIndex + 50;
      const name = lane === '1' ? person.name : person.secondName ?? '';
      const note = lane === '1' ? person.note ?? '' : person.secondNote ?? '';

      sheet.getCell(cursorRow, nameCol).value = name;
      if (!isPersonnel) {
        sheet.getCell(cursorRow, plateCol).value = lane === '1' ? person.plate : '';
        sheet.getCell(cursorRow, noteCol).value = note;
      }

      let workCount = 0;
      monthDays.forEach((day, index) => {
        const code = getCellCode(rowIndex, day, person.id, lane);
        if (code === 'W') workCount += 1;
        sheet.getCell(cursorRow, dayStartCol + index).value = toCellLabel(code);
      });
      sheet.getCell(cursorRow, totalCol).value = workCount;

      applyBorder(cursorRow);
      applyRowAlignment(cursorRow);
      cursorRow += 1;
    });
  });

  sheet.getCell(cursorRow, nameCol).value = isPersonnel ? 'На смене:' : 'Итого';
  if (!isPersonnel) {
    const uniquePlates = new Set(
      sectionPeople.map((person) => person.plate.trim().toUpperCase()).filter((plate) => plate.length > 0)
    ).size;
    sheet.getCell(cursorRow, plateCol).value = uniquePlates;
  }

  monthDays.forEach((day, index) => {
    const total = sectionPeople.reduce((acc, person) => {
      const code = getCellCode(person.rowIndex, day, person.id, '1');
      if (section === 'containers') {
        const primaryWorked = code === 'W' || code === 'H';
        const secondaryWorked = person.secondName
          ? (() => {
              const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
              return code2 === 'W' || code2 === 'H';
            })()
          : false;
        return acc + (primaryWorked || secondaryWorked ? 1 : 0);
      }

      let next = code === 'W' ? acc + 1 : acc;
      if (person.secondName) {
        const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
        if (code2 === 'W') next += 1;
      }
      return next;
    }, 0);
    sheet.getCell(cursorRow, dayStartCol + index).value = total;
  });

  applyBorder(cursorRow);
  applyRowAlignment(cursorRow);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `График работы - ${SECTION_LABEL[section]} - ${String(month).padStart(2, '0')}.${year}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.send(Buffer.from(buffer));
};
