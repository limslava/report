import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, MenuItem, Paper, Snackbar, TextField } from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import {
  downloadOperationsPreviewExcel,
  getOperationsPreviewState,
  saveOperationsPreviewState,
  type OperationsPreviewLocation,
} from '../services/api';
import { registerUnsavedHandlers, setHasUnsavedChanges } from '../store/unsavedChanges';
import { downloadBlob } from '../utils/download';
import '../styles/operations-preview.css';

type PreviewLocation = OperationsPreviewLocation;
type PreviewSection = 'containers' | 'auto' | 'dispatchers' | 'couriers' | 'mechanics' | 'efficiency';
type PreviewMode = 'plan' | 'fact';
type Department = 'Контейнеры' | 'Авто' | 'Диспетчера' | 'Курьеры' | 'Автослесари';
type EfficiencyLocation = 'ktk_vvo' | 'ktk_mow';
type SortField = 'manual' | 'name' | 'plate';
type SortDirection = 'asc' | 'desc';
type SectionSortState = { field: SortField; direction: SortDirection };
type SortBySection = Record<Department, SectionSortState>;

const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const PREVIEW_STORAGE_KEY = 'ops-preview-daily-input-draft-v1';
const PREVIEW_SORT_STORAGE_PREFIX = 'ops-preview-sort-v1';
const DEFAULT_SORT_BY_SECTION: SortBySection = {
  Контейнеры: { field: 'manual', direction: 'asc' },
  Авто: { field: 'manual', direction: 'asc' },
  Диспетчера: { field: 'manual', direction: 'asc' },
  Курьеры: { field: 'manual', direction: 'asc' },
  Автослесари: { field: 'manual', direction: 'asc' },
};
const MONTH_OPTIONS = [
  { value: 1, label: 'Январь' },
  { value: 2, label: 'Февраль' },
  { value: 3, label: 'Март' },
  { value: 4, label: 'Апрель' },
  { value: 5, label: 'Май' },
  { value: 6, label: 'Июнь' },
  { value: 7, label: 'Июль' },
  { value: 8, label: 'Август' },
  { value: 9, label: 'Сентябрь' },
  { value: 10, label: 'Октябрь' },
  { value: 11, label: 'Ноябрь' },
  { value: 12, label: 'Декабрь' },
];
const MONTH_LABELS_SHORT = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const EFFICIENCY_LOCATION_OPTIONS: Array<{ value: EfficiencyLocation; label: string }> = [
  { value: 'ktk_vvo', label: 'КТК Влк' },
  { value: 'ktk_mow', label: 'КТК Мск' },
];

const LOCATION_SECTIONS: Record<PreviewLocation, PreviewSection[]> = {
  ktk_vvo: ['containers', 'auto', 'dispatchers', 'couriers', 'efficiency'],
  ktk_mow: ['containers', 'dispatchers', 'couriers', 'efficiency'],
  garage_vvo: ['mechanics'],
  garage_mow: ['mechanics'],
};

const DEPARTMENT_BY_SECTION: Partial<Record<PreviewSection, Department>> = {
  containers: 'Контейнеры',
  auto: 'Авто',
  dispatchers: 'Диспетчера',
  couriers: 'Курьеры',
  mechanics: 'Автослесари',
};

const SECTION_BY_DEPARTMENT: Record<Department, PreviewSection> = {
  Контейнеры: 'containers',
  Авто: 'auto',
  Диспетчера: 'dispatchers',
  Курьеры: 'couriers',
  Автослесари: 'mechanics',
};

const getLocationFromQuery = (value: string | null): PreviewLocation => {
  if (value === 'garage') return 'garage_vvo';
  if (value === 'ktk_mow' || value === 'garage_vvo' || value === 'garage_mow') return value;
  return 'ktk_vvo';
};

const getDepartmentsForLocation = (location: PreviewLocation): Department[] =>
  LOCATION_SECTIONS[location]
    .map((section) => DEPARTMENT_BY_SECTION[section])
    .filter(Boolean) as Department[];

const isPersonnelDepartment = (department: Department): boolean =>
  department === 'Диспетчера' || department === 'Курьеры' || department === 'Автослесари';

type PersonRow = {
  id: string;
  name: string;
  secondName?: string;
  plate: string;
  note?: string;
  secondNote?: string;
  department: Department;
};

const PREVIEW_PEOPLE: PersonRow[] = [];

type CellCode = 'W' | 'O' | 'B' | 'H' | 'S' | 'R' | 'N' | 'V' | 'E';
type OverrideScopeKey = `${PreviewMode}|${string}`;
type ScopedOverrides = Record<OverrideScopeKey, Record<string, CellCode>>;
type PeopleByMonth = Record<string, PersonRow[]>;
type PreviewPersistedState = {
  filter: 'Все' | Department;
  monthValue: string;
  mode: PreviewMode;
  overrides: ScopedOverrides;
  peopleByMonth: PeopleByMonth;
  meta?: {
    overrideScopeVersions?: Record<string, string>;
    peopleMonthVersions?: Record<string, string>;
  };
  peopleState?: PersonRow[]; // legacy fallback
};

const CELL_META: Record<CellCode, { code: string; label: string; css: string }> = {
  E: { code: '', label: 'пусто', css: 'empty' },
  W: { code: '1', label: 'на линии', css: 'work' },
  O: { code: 'В', label: 'выходной', css: 'off' },
  V: { code: 'О', label: 'отпуск', css: 'vacation' },
  B: { code: 'Б', label: 'больничный', css: 'sick' },
  H: { code: 'П', label: 'пол дня', css: 'half' },
  S: { code: 'С', label: 'снятие груза', css: 'cargo-removal' },
  R: { code: 'Р', label: 'ремонт', css: 'repair' },
  N: { code: 'Н', label: 'нет водителя', css: 'idle' },
};

const VALID_CELL_CODES = new Set<CellCode>(['W', 'O', 'B', 'H', 'S', 'R', 'N', 'V', 'E']);
const normalizeCellCode = (value: unknown): CellCode => {
  return typeof value === 'string' && VALID_CELL_CODES.has(value as CellCode) ? (value as CellCode) : 'E';
};

const getMonthlyCell = (_rowIndex: number, _day: number, _department: Department): CellCode => {
  return 'E';
};

const getShiftValueForCount = (department: Department, code: CellCode): number => {
  if (code === 'W') return 1;
  if (department === 'Авто' && code === 'S') return 1;
  if (code !== 'H') return 0;
  if (department === 'Контейнеры') return 0.5;
  if (department === 'Авто') return 1;
  return 0;
};

const clonePeople = (rows: PersonRow[]): PersonRow[] => rows.map((row) => ({ ...row }));
const isTestPersonRow = (row: PersonRow): boolean =>
  row.id.startsWith('test-') || row.name.startsWith('Тест Водитель') || (row.secondName?.startsWith('Тест Водитель') ?? false);

const sanitizePeopleByMonth = (input: PeopleByMonth): PeopleByMonth => {
  const next: PeopleByMonth = {};
  Object.entries(input).forEach(([monthKey, rows]) => {
    next[monthKey] = Array.isArray(rows) ? rows.filter((row) => !isTestPersonRow(row)) : [];
  });
  return next;
};

const getPrevMonthValue = (value: string): string | null => {
  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

const getDaysInMonthValue = (value: string): number => {
  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 31;
  return new Date(year, month, 0).getDate();
};

const extractFilename = (disposition?: string): string | null => {
  if (!disposition) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).normalize('NFC');
    } catch {
      return utfMatch[1].normalize('NFC');
    }
  }
  const asciiMatch = /filename="([^"]+)"/i.exec(disposition);
  if (asciiMatch?.[1]) {
    return asciiMatch[1].normalize('NFC');
  }
  return null;
};

export default function OperationsPreview() {
  type VisibleRow = { personId: string; lane: '1' | '2'; personName: string; rowIndex: number; department: Department };
  type RangeRect = { rowStart: number; rowEnd: number; dayStart: number; dayEnd: number };
  const [searchParams, setSearchParams] = useSearchParams();
  const activeLocation = getLocationFromQuery(searchParams.get('location'));
  const activeEfficiencyLocation: EfficiencyLocation = activeLocation === 'ktk_mow' ? 'ktk_mow' : 'ktk_vvo';
  const allowedDepartments = useMemo(() => getDepartmentsForLocation(activeLocation), [activeLocation]);
  const allowedDepartmentSet = useMemo(() => new Set<Department>(allowedDepartments), [allowedDepartments]);
  const userId = useAuthStore((state) => state.user?.id);
  const userRole = useAuthStore((state) => state.user?.role);
  const isHrScheduleRole = userRole === 'head_hr' || userRole === 'hr_specialist';
  const canManagePlanFact = (
    userRole === 'admin'
    || userRole === 'head_ktk_vvo'
    || userRole === 'head_ktk_mow'
    || userRole === 'head_hr'
    || userRole === 'hr_specialist'
  );
  const efficiencyOnlyViewer = userRole === 'director' || userRole === 'general_director' || userRole === 'financer';
  const canChooseEfficiencyDirection = userRole === 'director' || userRole === 'general_director' || userRole === 'financer';
  const [filter, setFilter] = useState<'Все' | Department>('Все');
  const [monthValue, setMonthValue] = useState('2026-04');
  const [mode, setMode] = useState<PreviewMode>('fact');
  const [efficiencyLocation, setEfficiencyLocation] = useState<EfficiencyLocation>('ktk_vvo');
  const [allOverrides, setAllOverrides] = useState<ScopedOverrides>({} as ScopedOverrides);
  const allOverridesRef = useRef<ScopedOverrides>({} as ScopedOverrides);
  const [copyStatus, setCopyStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState<string>('');
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<PreviewPersistedState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setActiveCell] = useState<{
    key: string;
    personName: string;
    day: number;
    value: CellCode;
    personId: string;
    lane: '1' | '2';
    rowIndex: number;
    department: Department;
  } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    key: string;
    personName: string;
    day: number;
    value: CellCode;
    personId: string;
    lane: '1' | '2';
    rowIndex: number;
    department: Department;
  } | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [paintCode, setPaintCode] = useState<CellCode>('W');
  const [lastPaintKeyAt, setLastPaintKeyAt] = useState<number | null>(null);
  const [paintRow, setPaintRow] = useState<{ personId: string; lane: '1' | '2' } | null>(null);
  const [clipboardCell, setClipboardCell] = useState<CellCode | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<{ personId: string; lane: '1' | '2'; day: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<RangeRect | null>(null);
  const [clipboardRange, setClipboardRange] = useState<CellCode[][] | null>(null);
  const [editPerson, setEditPerson] = useState<PersonRow | null>(null);
  const matrixSectionRef = useRef<HTMLElement | null>(null);
  const matrixBodyRef = useRef<HTMLDivElement | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const scopeVersionsRef = useRef<{
    overrideScopeVersions: Record<string, string>;
    peopleMonthVersions: Record<string, string>;
  }>({
    overrideScopeVersions: {},
    peopleMonthVersions: {},
  });
  const [matrixScale, setMatrixScale] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    person: PersonRow;
    target: 'name' | 'plate';
    lane?: '1' | '2';
  } | null>(null);
  const [dragOverMarker, setDragOverMarker] = useState<{ personId: string; pos: 'before' | 'after' } | null>(null);
  const [clipboardPerson, setClipboardPerson] = useState<PersonRow | null>(null);
  const [noteEdit, setNoteEdit] = useState<{
    personId: string;
    lane: '1' | '2';
    value: string;
  } | null>(null);

  const [peopleByMonth, setPeopleByMonth] = useState<PeopleByMonth>({});
  const peopleByMonthRef = useRef<PeopleByMonth>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [sortBySection, setSortBySection] = useState<SortBySection>(DEFAULT_SORT_BY_SECTION);
  const [sortHydrated, setSortHydrated] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [fillPrevConfirmOpen, setFillPrevConfirmOpen] = useState(false);
  const [newPerson, setNewPerson] = useState<{
    name: string;
    secondName: string;
    plate: string;
  }>({
    name: '',
    secondName: '',
    plate: '',
  });

  const resolvePeopleForMonth = (targetMonth: string, source: PeopleByMonth): PersonRow[] => {
    if (source[targetMonth]?.length) return source[targetMonth];
    const prevMonth = getPrevMonthValue(targetMonth);
    if (prevMonth && source[prevMonth]?.length) return source[prevMonth];
    return PREVIEW_PEOPLE;
  };

  const peopleState = useMemo(
    () => resolvePeopleForMonth(monthValue, peopleByMonth),
    [monthValue, peopleByMonth]
  );

  const setPeopleStateForCurrentMonth = (updater: (prev: PersonRow[]) => PersonRow[]) => {
    setPeopleByMonth((prev) => {
      const current = clonePeople(resolvePeopleForMonth(monthValue, prev));
      const updated = updater(current);
      return {
        ...prev,
        [monthValue]: updated,
      };
    });
  };

  useEffect(() => {
    allOverridesRef.current = allOverrides;
  }, [allOverrides]);

  useEffect(() => {
    peopleByMonthRef.current = peopleByMonth;
  }, [peopleByMonth]);

  const baseRowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    peopleState.forEach((person, index) => map.set(person.id, index));
    return map;
  }, [peopleState]);

  const parsedMonth = useMemo(() => {
    const [yearRaw, monthRaw] = monthValue.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const now = new Date();
    return {
      year: Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : now.getFullYear(),
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    };
  }, [monthValue]);

  const setPeriod = (year: number, month: number) => {
    const safeYear = Math.max(2020, Math.min(2100, year));
    const safeMonth = Math.max(1, Math.min(12, month));
    setMonthValue(`${safeYear}-${String(safeMonth).padStart(2, '0')}`);
  };

  const monthDays = useMemo(
    () => Array.from({ length: new Date(parsedMonth.year, parsedMonth.month, 0).getDate() }, (_, index) => index + 1),
    [parsedMonth.month, parsedMonth.year]
  );

  const weekdaysByDay = useMemo(
    () =>
      monthDays.map((day) => {
        const date = new Date(parsedMonth.year, parsedMonth.month - 1, day);
        return WEEKDAY_LABELS[date.getDay()];
      }),
    [monthDays, parsedMonth.month, parsedMonth.year]
  );

  const efficiencyBySection = useMemo(() => {
    const calcForDepartment = (department: Department) => {
      return Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;
        const monthValueForYear = `${parsedMonth.year}-${String(month).padStart(2, '0')}`;
        const monthPeople = resolvePeopleForMonth(monthValueForYear, peopleByMonth).filter(
          (person) => person.department === department
        );
        const factScopeKey = `fact|${monthValueForYear}` as OverrideScopeKey;
        const factOverrides = allOverrides[factScopeKey] ?? {};
        const daysInMonth = new Date(parsedMonth.year, month, 0).getDate();

        const getCellCodeForMonth = (
          rowIndex: number,
          day: number,
          personId: string,
          lane: '1' | '2' = '1'
        ): CellCode => {
          const key = `${personId}-${lane}-${day}`;
          return normalizeCellCode(factOverrides[key] ?? getMonthlyCell(rowIndex, day, department));
        };

        const uniquePlatesCount = new Set(
          monthPeople.map((person) => person.plate.trim().toUpperCase()).filter((plate) => plate.length > 0)
        ).size;
        const totalAutoDays = uniquePlatesCount * daysInMonth;

        let workAutoDays = 0;
        let offOrVacationDays = 0;
        let repairDays = 0;
        let noDriverDays = 0;
        let sickDays = 0;

        monthPeople.forEach((person) => {
          const rowIndex = monthPeople.findIndex((p) => p.id === person.id);
          if (rowIndex < 0) return;

          for (let day = 1; day <= daysInMonth; day += 1) {
            const code1 = getCellCodeForMonth(rowIndex, day, person.id, '1');
            const code2 = person.secondName ? getCellCodeForMonth(rowIndex + 50, day, person.id, '2') : null;
            const dayCodes = [code1, code2].filter(Boolean) as CellCode[];

            const isWorked = dayCodes.some((code) => code === 'W' || code === 'H' || code === 'S');
            if (isWorked) {
              workAutoDays += 1;
              continue;
            }
            if (dayCodes.some((code) => code === 'R')) {
              repairDays += 1;
              continue;
            }
            if (dayCodes.some((code) => code === 'N')) {
              noDriverDays += 1;
              continue;
            }
            if (dayCodes.some((code) => code === 'B')) {
              sickDays += 1;
              continue;
            }
            if (dayCodes.some((code) => code === 'O' || code === 'V')) {
              offOrVacationDays += 1;
            }
          }
        });

        const totalIdleDays = offOrVacationDays + repairDays + noDriverDays + sickDays;
        const technicalReadyDays = totalAutoDays - repairDays;
        const loadFactor = totalAutoDays > 0 ? workAutoDays / totalAutoDays : null;
        const technicalReadyFactor = totalAutoDays > 0 ? technicalReadyDays / totalAutoDays : null;

        return {
          month,
          daysInMonth,
          uniquePlatesCount,
          totalAutoDays,
          workAutoDays,
          loadFactor,
          offOrVacationDays,
          repairDays,
          noDriverDays,
          sickDays,
          totalIdleDays,
          technicalReadyDays,
          technicalReadyFactor,
        };
      });
    };

    return {
      containers: calcForDepartment('Контейнеры'),
      auto: calcForDepartment('Авто'),
    };
  }, [allOverrides, parsedMonth.year, peopleByMonth]);

  const sortedPeopleBySection = useMemo(() => {
    const compareByField = (a: PersonRow, b: PersonRow, field: Exclude<SortField, 'manual'>) => {
      const left = field === 'name' ? a.name : a.plate;
      const right = field === 'name' ? b.name : b.plate;
      return left.localeCompare(right, 'ru', { sensitivity: 'base' });
    };

    const sortSection = (section: Department): Array<PersonRow & { rowIndex: number }> => {
      const base = peopleState
        .filter((person) => person.department === section)
        .map((person) => ({ ...person, rowIndex: baseRowIndexById.get(person.id) ?? 0 }));
      const sortState = sortBySection[section];
      if (sortState.field === 'manual') {
        return base;
      }
      const sortField: Exclude<SortField, 'manual'> = sortState.field;
      const sorted = [...base].sort((a, b) => compareByField(a, b, sortField));
      if (sortState.direction === 'desc') {
        sorted.reverse();
      }
      return sorted;
    };

    return {
      Контейнеры: sortSection('Контейнеры'),
      Авто: sortSection('Авто'),
      Диспетчера: sortSection('Диспетчера'),
      Курьеры: sortSection('Курьеры'),
      Автослесари: sortSection('Автослесари'),
    } as const;
  }, [peopleState, baseRowIndexById, sortBySection]);
  const addDepartment: Department =
    filter !== 'Все' && allowedDepartmentSet.has(filter)
      ? filter
      : allowedDepartments[0] ?? 'Контейнеры';
  const isPersonnelSection = filter !== 'Все' && isPersonnelDepartment(filter);
  const canManageMechanicPlan = userRole === 'admin' || isHrScheduleRole;
  const canUsePlanMode = (
    (filter === 'Контейнеры' && canManagePlanFact)
    || (filter === 'Автослесари' && canManageMechanicPlan)
  );
  const effectiveMode: PreviewMode = (filter === 'Контейнеры' || filter === 'Автослесари') ? mode : 'fact';
  const canManageVvoMechanics = isHrScheduleRole && activeLocation === 'garage_vvo' && filter === 'Автослесари';
  const canEditCurrentSchedule = !isHrScheduleRole || canManageVvoMechanics || (effectiveMode === 'plan' && (filter === 'Контейнеры' || filter === 'Автослесари'));
  const canEditRows = !isHrScheduleRole || canManageVvoMechanics;
  const canAddRows = canEditRows || (isHrScheduleRole && activeLocation === 'garage_vvo' && addDepartment === 'Автослесари');
  const visibleCellCodes: CellCode[] = isPersonnelSection
    ? ['W', 'V', 'O', 'B']
    : filter === 'Авто'
      ? ['W', 'O', 'V', 'B', 'H', 'S', 'R', 'N']
      : ['W', 'O', 'V', 'B', 'H', 'R', 'N'];
  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    const visiblePeople =
      filter === 'Все'
        ? allowedDepartments.flatMap((department) => sortedPeopleBySection[department])
        : sortedPeopleBySection[filter];
    visiblePeople.forEach((person) => {
      rows.push({
        personId: person.id,
        lane: '1',
        personName: person.name,
        rowIndex: person.rowIndex,
        department: person.department,
      });
      if (person.secondName) {
        rows.push({
          personId: person.id,
          lane: '2',
          personName: person.secondName ?? '',
          rowIndex: person.rowIndex + 50,
          department: person.department,
        });
      }
    });
    return rows;
  }, [allowedDepartments, filter, sortedPeopleBySection]);

  const buildRangeRect = useCallback(
    (from: { personId: string; lane: '1' | '2'; day: number }, to: { personId: string; lane: '1' | '2'; day: number }): RangeRect | null => {
      const fromRow = visibleRows.findIndex((row) => row.personId === from.personId && row.lane === from.lane);
      const toRow = visibleRows.findIndex((row) => row.personId === to.personId && row.lane === to.lane);
      if (fromRow < 0 || toRow < 0) return null;
      return {
        rowStart: Math.min(fromRow, toRow),
        rowEnd: Math.max(fromRow, toRow),
        dayStart: Math.max(1, Math.min(from.day, to.day)),
        dayEnd: Math.min(monthDays.length, Math.max(from.day, to.day)),
      };
    },
    [visibleRows, monthDays.length]
  );

  const isKeyInSelection = useCallback(
    (personId: string, lane: '1' | '2', day: number): boolean => {
      if (!selectionRect) return false;
      const rowIndex = visibleRows.findIndex((row) => row.personId === personId && row.lane === lane);
      if (rowIndex < 0) return false;
      return (
        rowIndex >= selectionRect.rowStart
        && rowIndex <= selectionRect.rowEnd
        && day >= selectionRect.dayStart
        && day <= selectionRect.dayEnd
      );
    },
    [selectionRect, visibleRows]
  );

  const getCrosshairClass = useCallback((personId: string, lane: '1' | '2', day: number) => {
    if (!selectedCell) return '';
    const inSameRow = selectedCell.personId === personId && selectedCell.lane === lane;
    const inSameColumn = selectedCell.day === day;
    if (inSameRow && inSameColumn) return ' ops-matrix__cell--crosshair-intersection';
    if (inSameRow) return ' ops-matrix__cell--crosshair-row';
    if (inSameColumn) return ' ops-matrix__cell--crosshair-col';
    return '';
  }, [selectedCell]);

  const selectedCellInCurrentView = useMemo(() => {
    if (!selectedCell) return false;
    return visibleRows.some((row) => row.personId === selectedCell.personId && row.lane === selectedCell.lane);
  }, [selectedCell, visibleRows]);

  useEffect(() => {
    if (!selectedCell) return;
    if (!selectedCellInCurrentView) {
      setSelectedCell(null);
      setSelectionRect(null);
      setSelectionAnchor(null);
    }
  }, [selectedCell, selectedCellInCurrentView]);
  const dayColumnStart = 4;
  const totalColumnIndex = dayColumnStart + monthDays.length;
  const currentScopeKey = `${effectiveMode}|${monthValue}` as OverrideScopeKey;
  const overrides = allOverrides[currentScopeKey] ?? {};

  const activeSection = (searchParams.get('section') as PreviewSection | null) ?? null;
  const isEfficiencySection = activeSection === 'efficiency';
  const filterFromSection = (section: PreviewSection | null): Department | null => {
    return section ? DEPARTMENT_BY_SECTION[section] ?? null : null;
  };
  const currentDataSnapshot = useMemo(
    () => ({
      overrides: allOverrides,
      peopleByMonth,
    }),
    [allOverrides, peopleByMonth]
  );
  const currentSnapshot: PreviewPersistedState = useMemo(
    () => ({
      filter,
      monthValue,
      mode,
      overrides: allOverrides,
      peopleByMonth,
    }),
    [filter, monthValue, mode, allOverrides, peopleByMonth]
  );
  const currentDataSignature = useMemo(() => JSON.stringify(currentDataSnapshot), [currentDataSnapshot]);
  const hasUnsavedChanges = hydrated && currentDataSignature !== lastSavedSignature;

  const getVisibleSections = (): Department[] =>
    filter === 'Все' ? allowedDepartments : [filter].filter((section) => allowedDepartmentSet.has(section));

  const toggleSort = (field: Exclude<SortField, 'manual'>) => {
    setSortBySection((prev) => {
      const next: SortBySection = { ...prev };
      const sections = getVisibleSections();
      sections.forEach((section) => {
        if (field === 'plate' && (section === 'Диспетчера' || section === 'Курьеры' || section === 'Автослесари')) {
          return;
        }
        const current = prev[section];
        if (current.field !== field) {
          next[section] = { field, direction: 'asc' };
          return;
        }
        if (current.direction === 'asc') {
          next[section] = { field, direction: 'desc' };
          return;
        }
        next[section] = { field: 'manual', direction: 'asc' };
      });
      return next;
    });
  };

  const currentSort = useMemo<SectionSortState>(() => {
    const sections = getVisibleSections();
    const first = sortBySection[sections[0]];
    const equal = sections.every((section) => {
      const current = sortBySection[section];
      return current.field === first.field && current.direction === first.direction;
    });
    return equal ? first : { field: 'manual', direction: 'asc' };
  }, [filter, sortBySection]);

  const getSortState = (field: Exclude<SortField, 'manual'>): 'none' | 'asc' | 'desc' => {
    if (currentSort.field !== field) return 'none';
    return currentSort.direction;
  };

  const reorderPersonByDrop = (sourceId: string, targetId: string, position: 'before' | 'after' = 'before') => {
    if (!canEditRows) return;
    if (sourceId === targetId) return;
    setPeopleStateForCurrentMonth((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === sourceId);
      const toIndex = prev.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const source = prev[fromIndex];
      const target = prev[toIndex];
      if (source.department !== target.department) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      let insertIndex = position === 'after' ? toIndex + 1 : toIndex;
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(next.length, insertIndex));
      next.splice(insertIndex, 0, moved);
      return next;
    });
    const sourcePerson = peopleState.find((item) => item.id === sourceId);
    if (sourcePerson) {
      setSortBySection((prev) => ({
        ...prev,
        [sourcePerson.department]: { field: 'manual', direction: 'asc' },
      }));
    }
  };

  const startRowDrag = (event: DragEvent<HTMLButtonElement>, personId: string, label: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.setData('application/x-ops-person-id', personId);
    event.dataTransfer.setData('text/plain', personId);
    setDraggingId(personId);

    const ghost = document.createElement('div');
    ghost.className = 'ops-drag-ghost';
    ghost.textContent = label;
    ghost.style.position = 'fixed';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    ghost.style.maxWidth = '420px';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.98';
    ghost.style.background = '#ffffff';
    ghost.style.boxShadow = '0 12px 28px rgba(15, 23, 42, 0.25)';
    ghost.style.border = '1px solid #7aa2ff';
    ghost.style.borderRadius = '8px';
    ghost.style.padding = '8px 12px';
    ghost.style.fontSize = '13px';
    ghost.style.fontWeight = '600';
    ghost.style.color = '#1f2937';
    ghost.style.whiteSpace = 'nowrap';
    ghost.style.overflow = 'hidden';
    ghost.style.textOverflow = 'ellipsis';
    ghost.style.zIndex = '9999';
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    event.dataTransfer.setDragImage(ghost, 16, 16);
  };

  const endRowDrag = () => {
    setDraggingId(null);
    setDragOverMarker(null);
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  const getDraggedPersonId = (event?: DragEvent<HTMLElement>): string | null => {
    if (draggingId) return draggingId;
    if (!event) return null;
    return (
      event.dataTransfer.getData('application/x-ops-person-id')
      || event.dataTransfer.getData('text/plain')
      || null
    );
  };

  const resolveDropPos = (
    clientY: number,
    rect: DOMRect,
  ): 'before' | 'after' => (clientY < rect.top + rect.height / 2 ? 'before' : 'after');

  const handleDeleteFromContext = () => {
    if (!contextMenu) return;
    const { person, target, lane } = contextMenu;
    if (target === 'plate') {
      if (!window.confirm(`Удалить запись ТС "${person.plate}" целиком?`)) return;
      handleDeletePerson(person.id);
      return;
    }
    if (!window.confirm(`Удалить ${lane === '2' ? 'второго' : 'первого'} водителя?`)) return;
    setPeopleStateForCurrentMonth((prev) =>
      prev
        .map((item) => {
          if (item.id !== person.id) return item;
          if (!item.secondName) return null;
          if (lane === '2') {
            return { ...item, secondName: undefined, secondNote: undefined };
          }
          return {
            ...item,
            name: item.secondName,
            note: item.secondNote,
            secondName: undefined,
            secondNote: undefined,
          };
        })
        .filter(Boolean) as PersonRow[]
    );
  };

  const resolveSectionForExport = (): PreviewSection => {
    if (activeSection === 'efficiency') return 'efficiency';
    if (filter !== 'Все') return SECTION_BY_DEPARTMENT[filter];
    if (activeSection && LOCATION_SECTIONS[activeLocation].includes(activeSection)) {
      return activeSection;
    }
    return LOCATION_SECTIONS[activeLocation].find((section) => section !== 'efficiency') ?? 'containers';
  };

  useEffect(() => {
    setSortHydrated(false);
    const storageKey = `${PREVIEW_SORT_STORAGE_PREFIX}:${activeLocation}:${userId ?? 'anonymous'}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setSortBySection(DEFAULT_SORT_BY_SECTION);
        setSortHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<Record<Department, Partial<SectionSortState>>>;
      const normalizeSection = (section: Department): SectionSortState => {
        const current = parsed?.[section];
        const field: SortField =
          current?.field === 'manual' || current?.field === 'name' || current?.field === 'plate'
            ? current.field
            : 'manual';
        const direction: SortDirection = current?.direction === 'desc' ? 'desc' : 'asc';
        return { field, direction };
      };
      setSortBySection({
        Контейнеры: normalizeSection('Контейнеры'),
        Авто: normalizeSection('Авто'),
        Диспетчера: normalizeSection('Диспетчера'),
        Курьеры: normalizeSection('Курьеры'),
        Автослесари: normalizeSection('Автослесари'),
      });
    } catch {
      setSortBySection(DEFAULT_SORT_BY_SECTION);
    } finally {
      setSortHydrated(true);
    }
  }, [activeLocation, userId]);

  useEffect(() => {
    if (!sortHydrated) return;
    const storageKey = `${PREVIEW_SORT_STORAGE_PREFIX}:${activeLocation}:${userId ?? 'anonymous'}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sortBySection));
    } catch {
      // ignore localStorage write issues
    }
  }, [activeLocation, sortBySection, sortHydrated, userId]);

  useEffect(() => {
    if (!efficiencyOnlyViewer) return;
    if (activeSection === 'efficiency') return;
    const next = new URLSearchParams(searchParams);
    if (!next.get('location')) {
      next.set('location', 'ktk_vvo');
    }
    next.set('section', 'efficiency');
    setSearchParams(next, { replace: true });
  }, [activeSection, efficiencyOnlyViewer, searchParams, setSearchParams]);

  useEffect(() => {
    if (efficiencyLocation !== activeEfficiencyLocation) {
      setEfficiencyLocation(activeEfficiencyLocation);
    }
  }, [activeEfficiencyLocation, efficiencyLocation]);

  useEffect(() => {
    let cancelled = false;

    const fallback: PreviewPersistedState = {
      filter: 'Все',
      monthValue: '2026-04',
      mode: 'fact',
      overrides: {} as ScopedOverrides,
      peopleByMonth: {},
    };

    const restoreFromPayload = (payload: Partial<PreviewPersistedState> | null | undefined) => {
      const liveSectionRaw = new URLSearchParams(window.location.search).get('section') as PreviewSection | null;
      const liveSection = liveSectionRaw && LOCATION_SECTIONS[activeLocation].includes(liveSectionRaw) ? liveSectionRaw : activeSection;
      const sectionFilter = filterFromSection(liveSection);
      const restoredPeopleByMonthRaw: PeopleByMonth = (() => {
        if (payload?.peopleByMonth && typeof payload.peopleByMonth === 'object') {
          return payload.peopleByMonth as PeopleByMonth;
        }
        if (Array.isArray(payload?.peopleState) && payload.peopleState.length > 0) {
          const baseMonth = typeof payload?.monthValue === 'string' ? payload.monthValue : fallback.monthValue;
          return {
            [baseMonth]: payload.peopleState as PersonRow[],
          };
        }
        return fallback.peopleByMonth;
      })();
      const restoredPeopleByMonth = sanitizePeopleByMonth(restoredPeopleByMonthRaw);
      const restored: PreviewPersistedState = {
        filter: sectionFilter ?? (
          payload?.filter === 'Контейнеры' ||
          payload?.filter === 'Авто' ||
          payload?.filter === 'Диспетчера' ||
          payload?.filter === 'Курьеры' ||
          payload?.filter === 'Автослесари' ||
          payload?.filter === 'Все'
            ? payload.filter
            : fallback.filter
        ),
        monthValue: typeof payload?.monthValue === 'string' ? payload.monthValue : fallback.monthValue,
        mode: payload?.mode === 'plan' || payload?.mode === 'fact' ? payload.mode : fallback.mode,
        overrides:
          payload?.overrides && typeof payload.overrides === 'object'
            ? (payload.overrides as ScopedOverrides)
            : fallback.overrides,
        peopleByMonth: restoredPeopleByMonth,
      };

      if (cancelled) return;
      scopeVersionsRef.current = {
        overrideScopeVersions:
          payload?.meta?.overrideScopeVersions && typeof payload.meta.overrideScopeVersions === 'object'
            ? payload.meta.overrideScopeVersions
            : {},
        peopleMonthVersions:
          payload?.meta?.peopleMonthVersions && typeof payload.meta.peopleMonthVersions === 'object'
            ? payload.meta.peopleMonthVersions
            : {},
      };
      setFilter(restored.filter === 'Все' || allowedDepartmentSet.has(restored.filter) ? restored.filter : allowedDepartments[0] ?? 'Все');
      setMonthValue(restored.monthValue);
      setMode(restored.mode);
      setAllOverrides(restored.overrides);
      setPeopleByMonth(restored.peopleByMonth);
      setLastSavedSnapshot(restored);
      setLastSavedSignature(
        JSON.stringify({
          overrides: restored.overrides,
          peopleByMonth: restored.peopleByMonth,
        })
      );
      setHydrated(true);
    };

    const bootstrap = async () => {
      const requestedSection: PreviewSection = efficiencyOnlyViewer
        ? 'efficiency'
        : activeSection && LOCATION_SECTIONS[activeLocation].includes(activeSection)
          ? activeSection
          : LOCATION_SECTIONS[activeLocation].find((section) => section !== 'efficiency') ?? 'containers';
      try {
        const response = await getOperationsPreviewState({
          location: activeLocation,
          section: requestedSection,
        });
        const payload = (response.data?.state ?? null) as Partial<PreviewPersistedState> | null;
        restoreFromPayload(payload);
        return;
      } catch {
        // Ignore API error and try legacy local draft once.
      }

      try {
        const raw = localStorage.getItem(`${PREVIEW_STORAGE_KEY}:${activeLocation}`);
        if (!raw) {
          restoreFromPayload(null);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<PreviewPersistedState>;
        restoreFromPayload(parsed);
      } catch {
        restoreFromPayload(null);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [activeLocation, activeSection, allowedDepartments, allowedDepartmentSet, efficiencyOnlyViewer]);

  useEffect(() => {
    const mapped = filterFromSection(activeSection);
    if (!mapped) return;
    if (!allowedDepartmentSet.has(mapped)) return;
    if (filter !== mapped) {
      setFilter(mapped);
    }
  }, [activeSection, allowedDepartmentSet, filter]);

  useEffect(() => {
    if (filter !== 'Контейнеры' && filter !== 'Автослесари' && mode !== 'fact') {
      setMode('fact');
      return;
    }
    if (!canUsePlanMode && mode !== 'fact') {
      setMode('fact');
    }
  }, [canUsePlanMode, mode, filter]);

  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasUnsavedChanges]);

  const getCellCode = (
    rowIndex: number,
    day: number,
    personId: string,
    department: Department,
    lane: '1' | '2' = '1',
    targetMode: PreviewMode = effectiveMode
  ) => {
    const key = `${personId}-${lane}-${day}`;
    const scopeKey = `${targetMode}|${monthValue}` as OverrideScopeKey;
    const scopeOverrides = allOverrides[scopeKey] ?? {};
    return normalizeCellCode(scopeOverrides[key] ?? getMonthlyCell(rowIndex, day, department));
  };

  const setCellCode = ({
    key,
    rowIndex,
    day,
    code,
    department,
    targetMode = effectiveMode,
  }: {
    key: string;
    rowIndex: number;
    day: number;
    code: CellCode;
    department: Department;
    targetMode?: PreviewMode;
  }) => {
    const scopeKey = `${targetMode}|${monthValue}` as OverrideScopeKey;
    setAllOverrides((prev) => {
      const current = prev[scopeKey] ?? {};
      const baseline = getMonthlyCell(rowIndex, day, department);
      const currentResolved = normalizeCellCode(current[key] ?? baseline);
      if (currentResolved === code) return prev;

      const nextScope = { ...current };
      // Persist explicit empty code to make deletions resilient across reloads/sessions.
      // Relying on key deletion (unset) can be lost in edge race/conflict flows.
      nextScope[key] = code;

      const nextAllOverrides = {
        ...prev,
        [scopeKey]: nextScope,
      };
      // Keep ref in sync immediately to avoid save race when user clicks "Сохранить" right after edit/delete.
      allOverridesRef.current = nextAllOverrides;
      return nextAllOverrides;
    });
  };

  const hasManualFactEditsForMonth = useMemo(() => {
    const planDepartment: Department | null = filter === 'Контейнеры' || filter === 'Автослесари' ? filter : null;
    if (!planDepartment) return false;
    const planKey = `plan|${monthValue}` as OverrideScopeKey;
    const factKey = `fact|${monthValue}` as OverrideScopeKey;
    const planMap = allOverrides[planKey] ?? {};
    const factMap = allOverrides[factKey] ?? {};
    const sectionPeople = peopleState.filter((person) => person.department === planDepartment);

    for (const person of sectionPeople) {
      const rowIndex = peopleState.findIndex((candidate) => candidate.id === person.id);
      if (rowIndex < 0) continue;

      for (const day of monthDays) {
        const keyLane1 = `${person.id}-1-${day}`;
        if (factMap[keyLane1] !== undefined) {
          const factValue = factMap[keyLane1] ?? getMonthlyCell(rowIndex, day, planDepartment);
          const planValue = planMap[keyLane1] ?? getMonthlyCell(rowIndex, day, planDepartment);
          if (factValue !== planValue) return true;
        }

        if (person.secondName) {
          const keyLane2 = `${person.id}-2-${day}`;
          if (factMap[keyLane2] !== undefined) {
            const factValue = factMap[keyLane2] ?? getMonthlyCell(rowIndex + 50, day, planDepartment);
            const planValue = planMap[keyLane2] ?? getMonthlyCell(rowIndex + 50, day, planDepartment);
            if (factValue !== planValue) return true;
          }
        }
      }
    }

    return false;
  }, [allOverrides, monthValue, peopleState, monthDays, filter]);

  const applyCopyPlanToFact = (options?: { switchToFactAfterCopy?: boolean }): boolean => {
    const planDepartment: Department | null = filter === 'Контейнеры' || filter === 'Автослесари' ? filter : null;
    if (!planDepartment) return false;
    const switchToFactAfterCopy = options?.switchToFactAfterCopy ?? false;
    const planKey = `plan|${monthValue}` as OverrideScopeKey;
    const factKey = `fact|${monthValue}` as OverrideScopeKey;
    const currentOverrides = allOverridesRef.current;
    const planMap = currentOverrides[planKey] ?? {};
    const sectionPeople = peopleState.filter((person) => person.department === planDepartment);
    const nextFactMap: Record<string, CellCode> = {};

    sectionPeople.forEach((person) => {
      const rowIndex = peopleState.findIndex((candidate) => candidate.id === person.id);
      if (rowIndex < 0) return;

      monthDays.forEach((day) => {
        const keyLane1 = `${person.id}-1-${day}`;
        const planLane1 = planMap[keyLane1] ?? getMonthlyCell(rowIndex, day, planDepartment);
        if (planLane1 !== 'E') {
          nextFactMap[keyLane1] = planLane1;
        }

        if (person.secondName) {
          const keyLane2 = `${person.id}-2-${day}`;
          const planLane2 = planMap[keyLane2] ?? getMonthlyCell(rowIndex + 50, day, planDepartment);
          if (planLane2 !== 'E') {
            nextFactMap[keyLane2] = planLane2;
          }
        }
      });
    });

    const nextOverrides = {
      ...currentOverrides,
      [factKey]: nextFactMap,
    };
    allOverridesRef.current = nextOverrides;
    setAllOverrides(nextOverrides);
    if (switchToFactAfterCopy) {
      setMode('fact');
    }
    return true;
  };

  const copyPlanToFactAndSave = async () => {
    const copied = applyCopyPlanToFact({ switchToFactAfterCopy: false });
    if (!copied) return;
    setCopyStatus({ type: 'success', text: 'План скопирован во Факт. Сохраняем изменения...' });
    const saved = await saveDraft();
    if (saved) {
      setCopyStatus({ type: 'success', text: 'План скопирован во Факт и сохранен.' });
    }
  };

  const handleCopyPlanToFact = () => {
    if (hasManualFactEditsForMonth && canUsePlanMode) {
      setCopyConfirmOpen(true);
      return;
    }
    void copyPlanToFactAndSave();
  };

  const handleFillPlanFromPreviousMonth = () => {
    const planDepartment: Department | null = filter === 'Контейнеры' || filter === 'Автослесари' ? filter : null;
    const prevMonth = getPrevMonthValue(monthValue);
    if (!planDepartment || !prevMonth) return;

    const prevPeople = clonePeople(resolvePeopleForMonth(prevMonth, peopleByMonthRef.current))
      .filter((person) => person.department === planDepartment);
    if (prevPeople.length === 0) {
      setCopyStatus({ type: 'error', text: 'В прошлом месяце нет строк для переноса.' });
      return;
    }

    const prevPlanKey = `plan|${prevMonth}` as OverrideScopeKey;
    const prevFactKey = `fact|${prevMonth}` as OverrideScopeKey;
    const currentPlanKey = `plan|${monthValue}` as OverrideScopeKey;
    const prevPlan = allOverridesRef.current[prevPlanKey] ?? {};
    const prevFact = allOverridesRef.current[prevFactKey] ?? {};
    const prevDaysInMonth = getDaysInMonthValue(prevMonth);
    const nextPlan: Record<string, CellCode> = {};

    prevPeople.forEach((person, rowIndex) => {
      monthDays.forEach((day) => {
        if (day > prevDaysInMonth) return;
        const lane1Key = `${person.id}-1-${day}`;
        const lane1 = normalizeCellCode(prevPlan[lane1Key] ?? prevFact[lane1Key] ?? getMonthlyCell(rowIndex, day, planDepartment));
        if (lane1 !== 'E') {
          nextPlan[lane1Key] = lane1;
        }

        if (person.secondName) {
          const lane2Key = `${person.id}-2-${day}`;
          const lane2 = normalizeCellCode(prevPlan[lane2Key] ?? prevFact[lane2Key] ?? getMonthlyCell(rowIndex + 50, day, planDepartment));
          if (lane2 !== 'E') {
            nextPlan[lane2Key] = lane2;
          }
        }
      });
    });

    setPeopleByMonth((prev) => {
      const currentRows = clonePeople(resolvePeopleForMonth(monthValue, prev));
      const nextRows = [
        ...currentRows.filter((person) => person.department !== planDepartment),
        ...prevPeople,
      ];
      const nextPeopleByMonth = {
        ...prev,
        [monthValue]: nextRows,
      };
      peopleByMonthRef.current = nextPeopleByMonth;
      return nextPeopleByMonth;
    });

    setAllOverrides((prev) => {
      const nextOverrides = {
        ...prev,
        [currentPlanKey]: nextPlan,
      };
      allOverridesRef.current = nextOverrides;
      return nextOverrides;
    });

    setCopyStatus({
      type: 'success',
      text: 'План заполнен из прошлого месяца. Проверьте данные и нажмите «Сохранить».',
    });
  };

  const handleDeletePerson = (personId: string) => {
    if (!canEditRows) return;
    setPeopleStateForCurrentMonth((prev) => prev.filter((item) => item.id !== personId));
    setAllOverrides((prev) => {
      const next: ScopedOverrides = { ...prev };
      Object.entries(next).forEach(([scopeKeyRaw, scopeValue]) => {
        const scopeKey = scopeKeyRaw as OverrideScopeKey;
        if (!scopeKey.endsWith(`|${monthValue}`)) {
          return;
        }
        const nextScope = { ...scopeValue };
        Object.keys(nextScope).forEach((key) => {
          if (key.startsWith(`${personId}-`)) delete nextScope[key];
        });
        next[scopeKey] = nextScope;
      });
      return next;
    });
  };

  const handlePastePerson = (targetDepartment: Department) => {
    if (!canEditRows) return;
    if (!clipboardPerson) return;
    setPeopleStateForCurrentMonth((prev) => [
      ...prev,
      {
        ...clipboardPerson,
        id: `p-${Date.now()}`,
        department: targetDepartment,
      },
    ]);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedCell) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const currentIndex = visibleRows.findIndex(
          (row) => row.personId === selectedCell.personId && row.lane === selectedCell.lane
        );
        if (currentIndex === -1) return;
        let nextRowIndex = currentIndex;
        let nextDay = selectedCell.day;
        if (event.key === 'ArrowLeft') nextDay = Math.max(1, selectedCell.day - 1);
        if (event.key === 'ArrowRight') nextDay = Math.min(monthDays.length, selectedCell.day + 1);
        if (event.key === 'ArrowUp') nextRowIndex = Math.max(0, currentIndex - 1);
        if (event.key === 'ArrowDown') nextRowIndex = Math.min(visibleRows.length - 1, currentIndex + 1);
        const nextRow = visibleRows[nextRowIndex];
        const nextKey = `${nextRow.personId}-${nextRow.lane}-${nextDay}`;
        const nextValue = normalizeCellCode(overrides[nextKey] ?? getMonthlyCell(nextRow.rowIndex, nextDay, nextRow.department));
        const nextPoint = { personId: nextRow.personId, lane: nextRow.lane, day: nextDay };
        setSelectedCell({
          key: nextKey,
          personName: nextRow.personName,
          day: nextDay,
          value: nextValue,
          personId: nextRow.personId,
          lane: nextRow.lane,
          rowIndex: nextRow.rowIndex,
          department: nextRow.department,
        });
        if (event.shiftKey) {
          const anchor = selectionAnchor ?? {
            personId: selectedCell.personId,
            lane: selectedCell.lane,
            day: selectedCell.day,
          };
          setSelectionAnchor(anchor);
          setSelectionRect(buildRangeRect(anchor, nextPoint));
        } else {
          setSelectionRect(null);
          setSelectionAnchor(nextPoint);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (selectionRect) {
          const rows: CellCode[][] = [];
          for (let r = selectionRect.rowStart; r <= selectionRect.rowEnd; r += 1) {
            const row = visibleRows[r];
            if (!row) continue;
            const rowCodes: CellCode[] = [];
            for (let day = selectionRect.dayStart; day <= selectionRect.dayEnd; day += 1) {
              rowCodes.push(getCellCode(row.rowIndex, day, row.personId, row.department, row.lane));
            }
            rows.push(rowCodes);
          }
          if (rows.length > 0) {
            setClipboardRange(rows);
            setClipboardCell(rows[0]?.[0] ?? null);
            return;
          }
        }
        setClipboardRange(null);
        setClipboardCell(selectedCell.value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (!canEditCurrentSchedule) return;
        if (clipboardRange && clipboardRange.length > 0) {
          const anchorIdx = visibleRows.findIndex((row) => row.personId === selectedCell.personId && row.lane === selectedCell.lane);
          if (anchorIdx >= 0) {
            clipboardRange.forEach((rowCodes, rowOffset) => {
              const targetRow = visibleRows[anchorIdx + rowOffset];
              if (!targetRow) return;
              rowCodes.forEach((code, colOffset) => {
                const day = selectedCell.day + colOffset;
                if (day > monthDays.length) return;
                const key = `${targetRow.personId}-${targetRow.lane}-${day}`;
                setCellCode({
                  key,
                  rowIndex: targetRow.rowIndex,
                  day,
                  code,
                  department: targetRow.department,
                });
              });
            });
            setPaintCode(clipboardRange[0]?.[0] ?? paintCode);
            setLastPaintKeyAt(Date.now());
            return;
          }
        }
        if (clipboardCell && selectionRect) {
          for (let r = selectionRect.rowStart; r <= selectionRect.rowEnd; r += 1) {
            const row = visibleRows[r];
            if (!row) continue;
            for (let day = selectionRect.dayStart; day <= selectionRect.dayEnd; day += 1) {
              const key = `${row.personId}-${row.lane}-${day}`;
              setCellCode({
                key,
                rowIndex: row.rowIndex,
                day,
                code: clipboardCell,
                department: row.department,
              });
            }
          }
          setPaintCode(clipboardCell);
          setLastPaintKeyAt(Date.now());
          return;
        }
        if (!clipboardCell) return;
        setCellCode({
          key: selectedCell.key,
          rowIndex: selectedCell.rowIndex,
          day: selectedCell.day,
          code: clipboardCell,
          department: selectedCell.department,
        });
        setSelectedCell((prev) => (prev ? { ...prev, value: clipboardCell } : prev));
        setPaintCode(clipboardCell);
        setLastPaintKeyAt(Date.now());
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (!canEditCurrentSchedule) return;
        if (selectionRect) {
          for (let r = selectionRect.rowStart; r <= selectionRect.rowEnd; r += 1) {
            const row = visibleRows[r];
            if (!row) continue;
            for (let day = selectionRect.dayStart; day <= selectionRect.dayEnd; day += 1) {
              const key = `${row.personId}-${row.lane}-${day}`;
              setCellCode({
                key,
                rowIndex: row.rowIndex,
                day,
                code: 'E',
                department: row.department,
              });
            }
          }
          setPaintCode('E');
          setLastPaintKeyAt(Date.now());
          return;
        }
        setCellCode({
          key: selectedCell.key,
          rowIndex: selectedCell.rowIndex,
          day: selectedCell.day,
          code: 'E',
          department: selectedCell.department,
        });
        setSelectedCell((prev) => (prev ? { ...prev, value: 'E' } : prev));
        setPaintCode('E');
        setLastPaintKeyAt(Date.now());
        return;
      }
      const raw = event.key;
      const key = raw.length === 1 ? raw.toLowerCase() : raw;
      const keyMap: Record<string, CellCode> = {
        '1': 'W',
        'в': 'O',
        'о': 'V',
        'б': 'B',
        'с': 'S',
        'c': 'S',
        'н': 'N',
        'п': 'H',
        'р': 'R',
        'м': 'V',
      };
      const code = keyMap[key];
      if (!code) return;
      if (!visibleCellCodes.includes(code)) return;
      if (!canEditCurrentSchedule) return;
      event.preventDefault();
      setCellCode({
        key: selectedCell.key,
        rowIndex: selectedCell.rowIndex,
        day: selectedCell.day,
        code,
        department: selectedCell.department,
      });
      setSelectedCell((prev) => (prev ? { ...prev, value: code } : prev));
      setSelectionRect(null);
      setPaintCode(code);
      setLastPaintKeyAt(Date.now());
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedCell, visibleRows, overrides, clipboardCell, clipboardRange, lastPaintKeyAt, paintCode, isPainting, paintRow, visibleCellCodes, monthDays.length, selectionRect, canEditCurrentSchedule]);

  useEffect(() => {
    const handleMouseUp = () => {
      setIsPainting(false);
      setPaintRow(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const startNoteEdit = (person: PersonRow, lane: '1' | '2') => {
    if (!canEditRows) return;
    setContextMenu(null);
    setActiveCell(null);
    setEditPerson(null);
    setNoteEdit({
      personId: person.id,
      lane,
      value: lane === '1' ? person.note ?? '' : person.secondNote ?? '',
    });
  };

  const commitNoteEdit = () => {
    if (!noteEdit) return;
    setPeopleStateForCurrentMonth((prev) =>
      prev.map((item) => {
        if (item.id !== noteEdit.personId) return item;
        if (noteEdit.lane === '1') {
          return { ...item, note: noteEdit.value.trim() ? noteEdit.value : undefined };
        }
        return { ...item, secondNote: noteEdit.value.trim() ? noteEdit.value : undefined };
      })
    );
    setNoteEdit(null);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (saving) return false;
    try {
      setSaving(true);
      // Даем React завершить последний локальный апдейт ячейки перед вычислением патча.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const latestAllOverrides = allOverridesRef.current;
      const latestPeopleByMonth = peopleByMonthRef.current;
      const previousOverrides = lastSavedSnapshot?.overrides ?? {};
      const candidateScopeKeys = new Set<OverrideScopeKey>([
        ...Object.keys(latestAllOverrides),
        ...Object.keys(previousOverrides),
      ] as OverrideScopeKey[]);
      const overridesPatch = Array.from(candidateScopeKeys).reduce((acc, scopeKey) => {
        const currentScopeOverrides = latestAllOverrides[scopeKey] ?? {};
        const prevScopeOverrides = previousOverrides[scopeKey] ?? {};
        const setPatch: Record<string, CellCode> = {};
        const unsetPatch: string[] = [];

        Object.entries(currentScopeOverrides).forEach(([key, value]) => {
          if (prevScopeOverrides[key] !== value) {
            setPatch[key] = value;
          }
        });
        Object.keys(prevScopeOverrides).forEach((key) => {
          if (!(key in currentScopeOverrides)) {
            unsetPatch.push(key);
          }
        });

        if (Object.keys(setPatch).length > 0 || unsetPatch.length > 0) {
          acc[scopeKey] = {
            set: setPatch,
            unset: unsetPatch,
          };
        }
        return acc;
      }, {} as Record<OverrideScopeKey, { set: Record<string, CellCode>; unset: string[] }>);

      const currentMonthPeople = resolvePeopleForMonth(monthValue, latestPeopleByMonth);
      const previousMonthPeople = (() => {
        if (!lastSavedSnapshot) return [];
        const byMonth = lastSavedSnapshot.peopleByMonth ?? {};
        return resolvePeopleForMonth(monthValue, byMonth);
      })();
      const peopleMonthChanged = JSON.stringify(currentMonthPeople) !== JSON.stringify(previousMonthPeople);

      if (Object.keys(overridesPatch).length === 0 && !peopleMonthChanged) {
        return true;
      }

      const scopedPayload: PreviewPersistedState = {
        filter,
        monthValue,
        mode,
        overrides: latestAllOverrides,
        peopleByMonth: peopleMonthChanged
          ? {
              [monthValue]: currentMonthPeople,
            }
          : {},
      };
      const response = await saveOperationsPreviewState(
        {
          ...scopedPayload,
          location: activeLocation,
          section: resolveSectionForExport(),
          overridesPatch,
          clientVersions: {
            overrideScopeVersions: Object.fromEntries(
              Object.keys(overridesPatch).map((scopeKey) => [
                scopeKey,
                scopeVersionsRef.current.overrideScopeVersions[scopeKey] ?? null,
              ])
            ),
            peopleMonthVersions: {
              [monthValue]: scopeVersionsRef.current.peopleMonthVersions[monthValue] ?? null,
            },
          },
        } as unknown as Record<string, unknown>,
        null,
        {
          location: activeLocation,
          section: resolveSectionForExport(),
        }
      );
      const nextUpdatedAt = typeof response.data?.updatedAt === 'string' ? response.data.updatedAt : new Date().toISOString();
      Object.keys(overridesPatch).forEach((scopeKey) => {
        scopeVersionsRef.current.overrideScopeVersions[scopeKey] = nextUpdatedAt;
      });
      scopeVersionsRef.current.peopleMonthVersions[monthValue] = nextUpdatedAt;
      try {
        localStorage.setItem(
          `${PREVIEW_STORAGE_KEY}:${activeLocation}`,
          JSON.stringify({
            ...currentSnapshot,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore local storage write errors.
      }
      const nextSavedSnapshot: PreviewPersistedState = {
        filter,
        monthValue,
        mode,
        overrides: latestAllOverrides,
        peopleByMonth: latestPeopleByMonth,
      };
      setLastSavedSnapshot(nextSavedSnapshot);
      setLastSavedSignature(
        JSON.stringify({
          overrides: latestAllOverrides,
          peopleByMonth: latestPeopleByMonth,
        })
      );
      setCopyStatus((prev) => (prev?.type === 'error' ? prev : null));
      return true;
    } catch (error: any) {
      if (error?.response?.status === 409) {
        setCopyStatus({
          type: 'error',
          text: 'Данные были изменены другим пользователем. Обновите страницу и повторите сохранение.',
        });
        return false;
      }
      setCopyStatus({ type: 'error', text: 'Не удалось сохранить изменения. Повторите попытку.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setCopyStatus(null);
  }, [monthValue, mode, filter]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    registerUnsavedHandlers({
      save: async () => saveDraft(),
      discard: () => {
        if (!lastSavedSnapshot) return;
        setFilter(lastSavedSnapshot.filter);
        setMonthValue(lastSavedSnapshot.monthValue);
        setMode(lastSavedSnapshot.mode);
        setAllOverrides(lastSavedSnapshot.overrides);
        setPeopleByMonth(lastSavedSnapshot.peopleByMonth);
      },
    });

    return () => registerUnsavedHandlers(null);
  }, [lastSavedSnapshot, currentDataSignature]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (isEfficiencySection) return;
    const updateScale = () => {
      const sectionEl = matrixSectionRef.current;
      const matrixEl = matrixBodyRef.current;
      if (!sectionEl || !matrixEl) return;

      const rect = sectionEl.getBoundingClientRect();
      const availableHeight = Math.max(360, window.innerHeight - rect.top - 90);
      const naturalHeight = Math.max(1, matrixEl.scrollHeight);
      const nextScale = Math.max(0.7, Math.min(1, availableHeight / naturalHeight));
      setMatrixScale((prev) => (Math.abs(prev - nextScale) > 0.01 ? nextScale : prev));
    };

    const raf = requestAnimationFrame(updateScale);
    window.addEventListener('resize', updateScale);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateScale);
    };
  }, [isEfficiencySection, filter, monthValue, mode, peopleState, monthDays.length, isPersonnelSection]);

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      if (hasUnsavedChanges) {
        const saved = await saveDraft();
        if (!saved) {
          setDownloading(false);
          return;
        }
      }

      const section = resolveSectionForExport();
      const response = await downloadOperationsPreviewExcel({
        location: activeLocation,
        section,
        year: parsedMonth.year,
        month: parsedMonth.month,
        mode: effectiveMode,
        sortField: currentSort.field,
        sortDirection: currentSort.direction,
      });
      const filename =
        extractFilename(response.headers['content-disposition']) ??
        `График работы - ${String(parsedMonth.month).padStart(2, '0')}.${parsedMonth.year}.xlsx`;
      await downloadBlob(response.data as Blob, filename);
    } catch {
      setCopyStatus({ type: 'error', text: 'Не удалось скачать Excel. Повторите попытку.' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="ops-preview">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5, width: '100%' }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <TextField
              label="Год"
              type="number"
              size="small"
              value={parsedMonth.year}
              inputProps={{ min: 2020, max: 2100 }}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) {
                  setPeriod(next, parsedMonth.month);
                }
              }}
              sx={{
                width: 110,
                '& .MuiInputBase-root': { height: 40 },
              }}
            />
            {isEfficiencySection && canChooseEfficiencyDirection && (
              <TextField
                label="Направление"
                select
                size="small"
                value={efficiencyLocation}
                onChange={(event) => {
                  const nextLocation = event.target.value as EfficiencyLocation;
                  setEfficiencyLocation(nextLocation);
                  const next = new URLSearchParams(searchParams);
                  next.set('location', nextLocation);
                  next.set('section', 'efficiency');
                  setSearchParams(next);
                }}
                sx={{
                  width: 180,
                  '& .MuiInputBase-root': { height: 40 },
                }}
              >
                {EFFICIENCY_LOCATION_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {!isEfficiencySection && (
              <TextField
                label="Месяц"
                select
                size="small"
                value={parsedMonth.month}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next)) {
                    setPeriod(parsedMonth.year, next);
                  }
                }}
                sx={{
                  width: 160,
                  '& .MuiInputBase-root': { height: 40 },
                }}
              >
                {MONTH_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {!isEfficiencySection && canUsePlanMode && (
              <TextField
                label="Режим"
                select
                size="small"
                value={mode}
                onChange={(event) => setMode(event.target.value as PreviewMode)}
                sx={{
                  width: 130,
                  '& .MuiInputBase-root': { height: 40 },
                }}
              >
                <MenuItem value="fact">Факт</MenuItem>
                <MenuItem value="plan">План</MenuItem>
              </TextField>
            )}
            <Box sx={{ ml: 'auto' }}>
              <button
                type="button"
                className="ops-btn ops-btn--download"
                style={{ marginRight: 10 }}
                onClick={() => {
                  void handleDownloadExcel();
                }}
                disabled={downloading}
              >
                {downloading ? 'Скачивание...' : 'Скачать Excel'}
              </button>
              {!isEfficiencySection && canUsePlanMode && mode === 'plan' && (filter === 'Контейнеры' || filter === 'Автослесари') && (
                <>
                  <button
                    type="button"
                    className="ops-btn ops-btn--fill-prev"
                    style={{ marginRight: 10 }}
                    onClick={() => setFillPrevConfirmOpen(true)}
                  >
                    Заполнить из прошлого месяца
                  </button>
                  <button
                    type="button"
                    className="ops-btn ops-btn--copy"
                    style={{ marginRight: 10 }}
                    onClick={handleCopyPlanToFact}
                    disabled={hasUnsavedChanges || saving}
                  >
                    Скопировать
                  </button>
                </>
              )}
              {!isEfficiencySection && (
                <>
                  {canAddRows && (
                    <button
                      type="button"
                      className="ops-btn ops-btn--add"
                      style={{ marginRight: 10 }}
                      onClick={() => {
                        setAddError(null);
                        setAddOpen(true);
                      }}
                    >
                      Добавить
                    </button>
                  )}
                  <button
                    type="button"
                    className="ops-btn ops-btn--save"
                    disabled={!hasUnsavedChanges || saving}
                    onClick={() => {
                      void saveDraft();
                    }}
                  >
                    {saving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                  </button>
                </>
              )}
            </Box>
          </Box>
        </Paper>
      </section>
      <Snackbar
        open={Boolean(copyStatus)}
        autoHideDuration={copyStatus?.type === 'error' ? 8000 : 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setCopyStatus(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={copyStatus?.type === 'error' ? 'error' : 'success'}
          variant="filled"
          onClose={() => setCopyStatus(null)}
          sx={{ maxWidth: 560, alignItems: 'center' }}
        >
          {copyStatus?.text}
        </Alert>
      </Snackbar>

      {!isEfficiencySection && (
      <section className="ops-preview__matrix" ref={matrixSectionRef}>
          <div
            ref={matrixBodyRef}
            className={`ops-matrix ops-matrix--fit${isPersonnelSection ? ' ops-matrix--personnel' : ''}`}
            style={{
              ['--ops-fit-scale' as string]: String(matrixScale),
              ['--col-b' as string]: isPersonnelSection ? '0px' : '80px',
              ['--col-c' as string]: isPersonnelSection ? '0px' : '100px',
              ['--col-count' as string]: isPersonnelSection ? '130px' : '70px',
              ['--days-count' as string]: String(monthDays.length),
            }}
          >
            <div className="ops-matrix__head-grid">
              <div className="ops-matrix__cell ops-matrix__cell--sticky ops-matrix__cell--head-fixed" style={{ gridColumn: 1, gridRow: '1 / span 2' }}>
                <button type="button" className="ops-matrix__sort-btn" onClick={() => toggleSort('name')}>
                  <span>ФИО</span>
                  <span className={`ops-matrix__sort-indicator is-${getSortState('name')}`} aria-hidden="true" />
                </button>
              </div>
              {!isPersonnelSection && (
                <div className="ops-matrix__cell ops-matrix__cell--sticky-second ops-matrix__cell--head-fixed" style={{ gridColumn: 2, gridRow: '1 / span 2' }}>
                  <button type="button" className="ops-matrix__sort-btn" onClick={() => toggleSort('plate')}>
                    <span>Г/Н ТС</span>
                    <span className={`ops-matrix__sort-indicator is-${getSortState('plate')}`} aria-hidden="true" />
                  </button>
                </div>
              )}
              {!isPersonnelSection && (
                <div className="ops-matrix__cell ops-matrix__cell--sticky-third ops-matrix__cell--head-fixed" style={{ gridColumn: 3, gridRow: '1 / span 2' }}>
                  Примечание
                </div>
              )}
              {monthDays.map((day, index) => (
                <div
                  key={`head-${day}`}
                  className={`ops-matrix__cell ops-matrix__cell--head${selectedCellInCurrentView && selectedCell?.day === day ? ' ops-matrix__cell--head-selected' : ''}`}
                  style={{ gridColumn: dayColumnStart + index, gridRow: 1 }}
                >
                  {day}
                </div>
              ))}
              {weekdaysByDay.map((day, index) => (
                <div
                  key={`weekday-${index}`}
                  style={{ gridColumn: dayColumnStart + index, gridRow: 2 }}
                  className={`ops-matrix__cell ops-matrix__cell--weekday ${day === 'сб' || day === 'вс' ? 'weekend' : ''}${selectedCellInCurrentView && selectedCell?.day === monthDays[index] ? ' ops-matrix__cell--weekday-selected' : ''}`}
                >
                  {day}
                </div>
              ))}
              <div
                className="ops-matrix__cell ops-matrix__cell--head-fixed ops-matrix__cell--head-fixed-count"
                style={{ gridColumn: totalColumnIndex, gridRow: '1 / span 2' }}
              >
                {isPersonnelSection ? 'Количество рабочих смен' : 'Кол‑во смен'}
              </div>
            </div>

            {allowedDepartments.map((section) => {
              if (filter !== 'Все' && filter !== section) return null;
              const sectionPeople = sortedPeopleBySection[section];
              return (
                <div
                  key={`section-${section}`}
                  className="ops-matrix__section"
                  onDragOver={(event) => {
                    const sourceId = getDraggedPersonId(event);
                    if (!sourceId) return;
                    event.preventDefault();
                    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const edgeThreshold = Math.min(24, Math.max(12, rect.height * 0.08));
                    const firstInSection = sectionPeople[0];
                    const lastInSection = sectionPeople[sectionPeople.length - 1];
                    if (event.clientY <= rect.top + edgeThreshold && firstInSection) {
                      setDragOverMarker({ personId: firstInSection.id, pos: 'before' });
                      return;
                    }
                    if (event.clientY >= rect.bottom - edgeThreshold && lastInSection) {
                      setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                      return;
                    }
                  }}
                  onDrop={(event) => {
                    const sourceId = getDraggedPersonId(event);
                    if (!sourceId) return;
                    event.stopPropagation();
                    event.preventDefault();
                    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const edgeThreshold = Math.min(24, Math.max(12, rect.height * 0.08));
                    const firstInSection = sectionPeople[0];
                    const lastInSection = sectionPeople[sectionPeople.length - 1];
                    if (event.clientY <= rect.top + edgeThreshold && firstInSection) {
                      reorderPersonByDrop(sourceId, firstInSection.id, 'before');
                      setDragOverMarker({ personId: firstInSection.id, pos: 'before' });
                      window.setTimeout(() => setDragOverMarker(null), 120);
                      endRowDrag();
                      return;
                    }
                    if (event.clientY >= rect.bottom - edgeThreshold && lastInSection) {
                      reorderPersonByDrop(sourceId, lastInSection.id, 'after');
                      setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                      window.setTimeout(() => setDragOverMarker(null), 120);
                      endRowDrag();
                      return;
                    }
                    setPeopleStateForCurrentMonth((prev) =>
                      prev.map((person) =>
                        person.id === sourceId ? { ...person, department: section } : person
                      )
                    );
                    endRowDrag();
                  }}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget as Node | null;
                    if (nextTarget && (event.currentTarget as HTMLDivElement).contains(nextTarget)) return;
                    setDragOverMarker(null);
                  }}
                >
                  {draggingId && (
                    <div
                      className="ops-matrix__section-drop-edge ops-matrix__section-drop-edge--top"
                      onDragOver={(event) => {
                        const sourceId = getDraggedPersonId(event);
                        if (!sourceId) return;
                        event.preventDefault();
                        const firstInSection = sectionPeople[0];
                        if (firstInSection) {
                          setDragOverMarker({ personId: firstInSection.id, pos: 'before' });
                        }
                      }}
                      onDrop={(event) => {
                        const sourceId = getDraggedPersonId(event);
                        if (!sourceId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const firstInSection = sectionPeople[0];
                        if (!firstInSection) {
                          setPeopleStateForCurrentMonth((prev) =>
                            prev.map((person) =>
                              person.id === sourceId ? { ...person, department: section } : person
                            )
                          );
                          endRowDrag();
                          return;
                        }
                        reorderPersonByDrop(sourceId, firstInSection.id, 'before');
                        setDragOverMarker({ personId: firstInSection.id, pos: 'before' });
                        window.setTimeout(() => setDragOverMarker(null), 120);
                        endRowDrag();
                      }}
                    />
                  )}

                  {sectionPeople.map((person) => {
                    const workCount = monthDays.reduce((acc, day) => {
                      const code = getCellCode(person.rowIndex, day, person.id, person.department, '1');
                      return acc + getShiftValueForCount(person.department, code);
                    }, 0);
                    const workCountSecond = person.secondName
                      ? monthDays.reduce((acc, day) => {
                        const code = getCellCode(person.rowIndex + 50, day, person.id, person.department, '2');
                        return acc + getShiftValueForCount(person.department, code);
                      }, 0)
                      : 0;

                    const Row = ({ lane }: { lane: '1' | '2' }) => {
                      const isSecond = lane === '2';
                      const name = isSecond ? person.secondName : person.name;
                      const rowIndex = isSecond ? person.rowIndex + 50 : person.rowIndex;
                      const workCountValue = isSecond ? workCountSecond : workCount;
                      return (
                        <div
                          className={`ops-matrix__row ops-matrix__row--draggable${person.secondName ? ' ops-matrix__row--split' : ''}`}
                          onDragOver={(event) => {
                            const sourceId = getDraggedPersonId(event);
                            if (!sourceId || sourceId === person.id) return;
                            event.preventDefault();
                            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const pos = resolveDropPos(event.clientY, rect);
                            setDragOverMarker({ personId: person.id, pos });
                          }}
                          onDrop={(event) => {
                            const sourceId = getDraggedPersonId(event);
                            if (!sourceId || sourceId === person.id) return;
                            event.stopPropagation();
                            event.preventDefault();
                            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const pos = resolveDropPos(event.clientY, rect);
                            reorderPersonByDrop(sourceId, person.id, pos);
                            setDragOverMarker(null);
                            endRowDrag();
                          }}
                          onDragLeave={() => setDragOverMarker(null)}
                        >
                          <div className={`ops-matrix__cell ops-matrix__cell--sticky ops-matrix__cell--name${selectedCellInCurrentView && selectedCell?.personId === person.id && selectedCell?.lane === lane ? ' ops-matrix__cell--name-selected' : ''}`}>
                            <div className="ops-matrix__name">
                              <span
                                onDoubleClick={() => { if (canEditRows) setEditPerson(person); }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  if (!canEditRows) return;
                                  setContextMenu({
                                    x: event.clientX,
                                    y: event.clientY,
                                    person,
                                    target: 'name',
                                    lane,
                                  });
                                }}
                                title="Двойной щелчок для редактирования"
                              >
                                {name ?? ''}
                              </span>
                            </div>
                          </div>
                          {!isPersonnelSection && (
                            <div
                              className={`ops-matrix__cell ops-matrix__cell--sticky-second${isSecond ? ' ops-matrix__cell--placeholder' : ''}`}
                            >
                              {!isSecond && (
                                <div className="ops-matrix__plate">
                                  <span
                                    onDoubleClick={() => { if (canEditRows) setEditPerson(person); }}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      if (!canEditRows) return;
                                  setContextMenu({
                                    x: event.clientX,
                                        y: event.clientY,
                                        person,
                                        target: 'plate',
                                      });
                                    }}
                                    title="Двойной щелчок для редактирования"
                                  >
                                    {person.plate}
                                  </span>
                                  <button
                                    type="button"
                                    className="ops-matrix__drag-hint-btn"
                                    draggable
                                    onDragStart={(event) => startRowDrag(event, person.id, `${name ?? ''} • ${person.plate}`)}
                                    onDragEnd={endRowDrag}
                                    title="Перетащите вверх или вниз"
                                    aria-label="Переместить строку"
                                  >
                                    ↕
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {!isPersonnelSection && (
                            <div
                              className="ops-matrix__cell ops-matrix__cell--sticky-third ops-matrix__note-cell"
                              onDoubleClick={() => startNoteEdit(person, isSecond ? '2' : '1')}
                              title="Двойной щелчок для редактирования"
                            >
                              <div className="ops-matrix__note">
                                {noteEdit?.personId === person.id && noteEdit.lane === (isSecond ? '2' : '1') ? (
                                  <input
                                    className="ops-matrix__note-input"
                                    value={noteEdit.value}
                                    autoFocus
                                    onChange={(event) =>
                                      setNoteEdit((current) =>
                                        current ? { ...current, value: event.target.value } : current
                                      )
                                    }
                                    onBlur={commitNoteEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitNoteEdit();
                                      if (event.key === 'Escape') setNoteEdit(null);
                                    }}
                                  />
                                ) : (
                                  <span title={isSecond ? person.secondNote ?? '' : person.note ?? ''}>
                                    {isSecond ? person.secondNote ?? '' : person.note ?? ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {monthDays.map((day, dayIndex) => {
                            const cell = getCellCode(rowIndex, day, person.id, person.department, lane);
                            const meta = CELL_META[cell];
                            return (
                              <div
                                key={`${person.id}-${lane}-${day}`}
                                className={`ops-matrix__cell ops-matrix__cell--${meta.css}${canEditCurrentSchedule ? ' ops-matrix__cell--editable' : ''}${getCrosshairClass(person.id, lane, day)}${(selectedCell?.key === `${person.id}-${lane}-${day}` || isKeyInSelection(person.id, lane, day)) ? ' ops-matrix__cell--selected' : ''}`}
                                style={{ gridColumn: dayColumnStart + dayIndex }}
                                title={`${name}: ${meta.label}`}
                                role="button"
                                tabIndex={0}
                                onMouseDown={(event) => {
                                  if (event.button !== 0) return;
                                  event.preventDefault();
                                  const key = `${person.id}-${lane}-${day}`;
                                  const anchor = selectionAnchor ?? {
                                    personId: selectedCell?.personId ?? person.id,
                                    lane: selectedCell?.lane ?? lane,
                                    day: selectedCell?.day ?? day,
                                  };
                                  if (event.shiftKey) {
                                    const rect = buildRangeRect(anchor, { personId: person.id, lane, day });
                                    setSelectionRect(rect);
                                    setSelectionAnchor(anchor);
                                    setSelectedCell({
                                      key,
                                      personName: name ?? '',
                                      day,
                                      value: cell,
                                      personId: person.id,
                                      lane,
                                      rowIndex,
                                      department: person.department,
                                    });
                                    setIsPainting(false);
                                    setPaintRow(null);
                                    return;
                                  }
                                  const now = Date.now();
                                  if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                    setPaintCode(cell);
                                  }
                                  setSelectionRect(null);
                                  setSelectionAnchor({ personId: person.id, lane, day });
                                  setSelectedCell({
                                    key,
                                    personName: name ?? '',
                                    day,
                                    value: cell,
                                    personId: person.id,
                                    lane,
                                    rowIndex,
                                    department: person.department,
                                  });
                                  if (canEditCurrentSchedule) {
                                    setIsPainting(true);
                                    setPaintRow({ personId: person.id, lane });
                                  }
                                }}
                                onMouseEnter={() => {
                                  if (!canEditCurrentSchedule) return;
                                  if (!isPainting) return;
                                  if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== lane) return;
                                  const key = `${person.id}-${lane}-${day}`;
                                  setCellCode({
                                    key,
                                    rowIndex,
                                    day,
                                    code: paintCode,
                                    department: person.department,
                                  });
                                  setSelectedCell({
                                    key,
                                    personName: name ?? '',
                                    day,
                                    value: paintCode,
                                    personId: person.id,
                                    lane,
                                    rowIndex,
                                    department: person.department,
                                  });
                                }}
                                onClick={() =>
                                  setSelectedCell({
                                    key: `${person.id}-${lane}-${day}`,
                                    personName: name ?? '',
                                    day,
                                    value: cell,
                                    personId: person.id,
                                    lane,
                                    rowIndex,
                                    department: person.department,
                                  })
                                }
                              >
                                {meta.code}
                              </div>
                            );
                          })}
                          <div className="ops-matrix__cell ops-matrix__cell--count" style={{ gridColumn: totalColumnIndex }}>
                            {workCountValue}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div
                        key={person.id}
                        className={`ops-matrix__person${
                          dragOverMarker?.personId === person.id ? ` is-drop-${dragOverMarker.pos}` : ''
                        }`}
                      >
                        {!person.secondName && <Row lane="1" />}
                        {person.secondName && (
                          <div
                            className="ops-matrix__person-grid"
                            onDragOver={(event) => {
                              const sourceId = getDraggedPersonId(event);
                              if (!sourceId || sourceId === person.id) return;
                              event.preventDefault();
                              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                              const pos = resolveDropPos(event.clientY, rect);
                              setDragOverMarker({ personId: person.id, pos });
                            }}
                            onDrop={(event) => {
                              const sourceId = getDraggedPersonId(event);
                              if (!sourceId || sourceId === person.id) return;
                              event.stopPropagation();
                              event.preventDefault();
                              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                              const pos = resolveDropPos(event.clientY, rect);
                              reorderPersonByDrop(sourceId, person.id, pos);
                              setDragOverMarker(null);
                              endRowDrag();
                            }}
                            onDragLeave={() => setDragOverMarker(null)}
                          >
                            <div
                              className={`ops-matrix__cell ops-matrix__cell--name ops-matrix__cell--sticky${selectedCellInCurrentView && selectedCell?.personId === person.id && selectedCell?.lane === '1' ? ' ops-matrix__cell--name-selected' : ''}`}
                              style={{ gridColumn: 1, gridRow: 1 }}
                            >
                              <div className="ops-matrix__name">
                                <span
                                  onDoubleClick={() => { if (canEditRows) setEditPerson(person); }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    if (!canEditRows) return;
                                    setContextMenu({ x: event.clientX, y: event.clientY, person, target: 'name', lane: '1' });
                                  }}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.name}
                                </span>
                              </div>
                            </div>
                            <div
                              className={`ops-matrix__cell ops-matrix__cell--name ops-matrix__cell--row2 ops-matrix__cell--name-left ops-matrix__cell--sticky${selectedCellInCurrentView && selectedCell?.personId === person.id && selectedCell?.lane === '2' ? ' ops-matrix__cell--name-selected' : ''}`}
                              style={{ gridColumn: 1, gridRow: 2 }}
                            >
                              <div className="ops-matrix__name">
                                <span
                                  onDoubleClick={() => { if (canEditRows) setEditPerson(person); }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    if (!canEditRows) return;
                                    setContextMenu({ x: event.clientX, y: event.clientY, person, target: 'name', lane: '2' });
                                  }}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.secondName}
                                </span>
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__cell--merged ops-matrix__cell--sticky-second"
                              style={{ gridColumn: 2, gridRow: '1 / span 2' }}
                            >
                              <div className="ops-matrix__plate">
                                <span
                                  onDoubleClick={() => { if (canEditRows) setEditPerson(person); }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    if (!canEditRows) return;
                                    setContextMenu({ x: event.clientX, y: event.clientY, person, target: 'plate' });
                                  }}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.plate}
                                </span>
                                <button
                                  type="button"
                                  className="ops-matrix__drag-hint-btn"
                                  draggable
                                  onDragStart={(event) => startRowDrag(event, person.id, `${person.name} / ${person.secondName ?? ''} • ${person.plate}`)}
                                  onDragEnd={endRowDrag}
                                  title="Перетащите вверх или вниз"
                                  aria-label="Переместить строку"
                                >
                                  ↕
                                </button>
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__note-cell ops-matrix__cell--sticky-third"
                              style={{ gridColumn: 3, gridRow: 1 }}
                              onDoubleClick={() => startNoteEdit(person, '1')}
                            >
                              <div className="ops-matrix__note">
                                {noteEdit?.personId === person.id && noteEdit.lane === '1' ? (
                                  <input
                                    className="ops-matrix__note-input"
                                    value={noteEdit.value}
                                    autoFocus
                                    onChange={(event) =>
                                      setNoteEdit((current) =>
                                        current ? { ...current, value: event.target.value } : current
                                      )
                                    }
                                    onBlur={commitNoteEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitNoteEdit();
                                      if (event.key === 'Escape') setNoteEdit(null);
                                    }}
                                  />
                                ) : (
                                  <span title={person.note ?? ''}>{person.note ?? ''}</span>
                                )}
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__cell--row2 ops-matrix__note-cell ops-matrix__cell--sticky-third"
                              style={{ gridColumn: 3, gridRow: 2 }}
                              onDoubleClick={() => startNoteEdit(person, '2')}
                            >
                              <div className="ops-matrix__note">
                                {noteEdit?.personId === person.id && noteEdit.lane === '2' ? (
                                  <input
                                    className="ops-matrix__note-input"
                                    value={noteEdit.value}
                                    autoFocus
                                    onChange={(event) =>
                                      setNoteEdit((current) =>
                                        current ? { ...current, value: event.target.value } : current
                                      )
                                    }
                                    onBlur={commitNoteEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitNoteEdit();
                                      if (event.key === 'Escape') setNoteEdit(null);
                                    }}
                                  />
                                ) : (
                                  <span title={person.secondNote ?? ''}>{person.secondNote ?? ''}</span>
                                )}
                              </div>
                            </div>
                            {monthDays.map((day, idx) => {
                              const col = dayColumnStart + idx;
                              const cell1 = getCellCode(person.rowIndex, day, person.id, person.department, '1');
                              const meta1 = CELL_META[cell1];
                              const cell2 = getCellCode(person.rowIndex + 50, day, person.id, person.department, '2');
                              const meta2 = CELL_META[cell2];
                              return (
                                <Fragment key={`grid-${person.id}-${day}`}>
                                  <div
                                    className={`ops-matrix__cell ops-matrix__cell--${meta1.css}${canEditCurrentSchedule ? ' ops-matrix__cell--editable' : ''}${getCrosshairClass(person.id, '1', day)}${(selectedCell?.key === `${person.id}-1-${day}` || isKeyInSelection(person.id, '1', day)) ? ' ops-matrix__cell--selected' : ''}`}
                                    style={{ gridColumn: col, gridRow: 1 }}
                                    title={`${person.name}: ${meta1.label}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={(event) => {
                                      if (event.button !== 0) return;
                                      event.preventDefault();
                                      const key = `${person.id}-1-${day}`;
                                      const anchor = selectionAnchor ?? {
                                        personId: selectedCell?.personId ?? person.id,
                                        lane: selectedCell?.lane ?? '1',
                                        day: selectedCell?.day ?? day,
                                      };
                                      if (event.shiftKey) {
                                        const rect = buildRangeRect(anchor, { personId: person.id, lane: '1', day });
                                        setSelectionRect(rect);
                                        setSelectionAnchor(anchor);
                                        setSelectedCell({
                                          key,
                                          personName: person.name,
                                          day,
                                          value: cell1,
                                          personId: person.id,
                                          lane: '1',
                                          rowIndex: person.rowIndex,
                                          department: person.department,
                                        });
                                        setIsPainting(false);
                                        setPaintRow(null);
                                        return;
                                      }
                                      const now = Date.now();
                                      if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                        setPaintCode(cell1);
                                      }
                                      setSelectionRect(null);
                                      setSelectionAnchor({ personId: person.id, lane: '1', day });
                                      setSelectedCell({
                                        key,
                                        personName: person.name,
                                        day,
                                        value: cell1,
                                        personId: person.id,
                                        lane: '1',
                                        rowIndex: person.rowIndex,
                                        department: person.department,
                                      });
                                      if (canEditCurrentSchedule) {
                                        setIsPainting(true);
                                        setPaintRow({ personId: person.id, lane: '1' });
                                      }
                                    }}
                                  onMouseEnter={() => {
                                    if (!canEditCurrentSchedule) return;
                                    if (!isPainting) return;
                                    if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== '1') return;
                                    const key = `${person.id}-1-${day}`;
                                    setCellCode({
                                      key,
                                      rowIndex: person.rowIndex,
                                      day,
                                      code: paintCode,
                                      department: person.department,
                                    });
                                      setSelectedCell({
                                        key,
                                        personName: person.name,
                                        day,
                                        value: paintCode,
                                        personId: person.id,
                                        lane: '1',
                                        rowIndex: person.rowIndex,
                                        department: person.department,
                                      });
                                    }}
                                    onClick={() =>
                                      setSelectedCell({
                                        key: `${person.id}-1-${day}`,
                                        personName: person.name,
                                        day,
                                        value: cell1,
                                        personId: person.id,
                                        lane: '1',
                                        rowIndex: person.rowIndex,
                                        department: person.department,
                                      })
                                    }
                                  >
                                    {meta1.code}
                                  </div>
                                  <div
                                    className={`ops-matrix__cell ops-matrix__cell--${meta2.css}${canEditCurrentSchedule ? ' ops-matrix__cell--editable' : ''} ops-matrix__cell--row2${getCrosshairClass(person.id, '2', day)}${(selectedCell?.key === `${person.id}-2-${day}` || isKeyInSelection(person.id, '2', day)) ? ' ops-matrix__cell--selected' : ''}`}
                                    style={{ gridColumn: col, gridRow: 2 }}
                                    title={`${person.secondName}: ${meta2.label}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={(event) => {
                                      if (event.button !== 0) return;
                                      event.preventDefault();
                                      const key = `${person.id}-2-${day}`;
                                      const anchor = selectionAnchor ?? {
                                        personId: selectedCell?.personId ?? person.id,
                                        lane: selectedCell?.lane ?? '2',
                                        day: selectedCell?.day ?? day,
                                      };
                                      if (event.shiftKey) {
                                        const rect = buildRangeRect(anchor, { personId: person.id, lane: '2', day });
                                        setSelectionRect(rect);
                                        setSelectionAnchor(anchor);
                                        setSelectedCell({
                                          key,
                                          personName: person.secondName ?? '',
                                          day,
                                          value: cell2,
                                          personId: person.id,
                                          lane: '2',
                                          rowIndex: person.rowIndex + 50,
                                          department: person.department,
                                        });
                                        setIsPainting(false);
                                        setPaintRow(null);
                                        return;
                                      }
                                      const now = Date.now();
                                      if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                        setPaintCode(cell2);
                                      }
                                      setSelectionRect(null);
                                      setSelectionAnchor({ personId: person.id, lane: '2', day });
                                      setSelectedCell({
                                        key,
                                        personName: person.secondName ?? '',
                                        day,
                                        value: cell2,
                                        personId: person.id,
                                        lane: '2',
                                        rowIndex: person.rowIndex + 50,
                                        department: person.department,
                                      });
                                      if (canEditCurrentSchedule) {
                                        setIsPainting(true);
                                        setPaintRow({ personId: person.id, lane: '2' });
                                      }
                                    }}
                                  onMouseEnter={() => {
                                    if (!canEditCurrentSchedule) return;
                                    if (!isPainting) return;
                                    if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== '2') return;
                                    const key = `${person.id}-2-${day}`;
                                    setCellCode({
                                      key,
                                      rowIndex: person.rowIndex + 50,
                                      day,
                                      code: paintCode,
                                      department: person.department,
                                    });
                                      setSelectedCell({
                                        key,
                                        personName: person.secondName ?? '',
                                        day,
                                        value: paintCode,
                                        personId: person.id,
                                        lane: '2',
                                        rowIndex: person.rowIndex + 50,
                                        department: person.department,
                                      });
                                    }}
                                    onClick={() =>
                                      setSelectedCell({
                                        key: `${person.id}-2-${day}`,
                                        personName: person.secondName ?? '',
                                        day,
                                        value: cell2,
                                        personId: person.id,
                                        lane: '2',
                                        rowIndex: person.rowIndex + 50,
                                        department: person.department,
                                      })
                                    }
                                  >
                                    {meta2.code}
                                  </div>
                                </Fragment>
                              );
                            })}
                            <div className="ops-matrix__cell ops-matrix__cell--count" style={{ gridColumn: totalColumnIndex, gridRow: 1 }}>{workCount}</div>
                            <div className="ops-matrix__cell ops-matrix__cell--count ops-matrix__cell--row2" style={{ gridColumn: totalColumnIndex, gridRow: 2 }}>{workCountSecond}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div
                    className="ops-matrix__row ops-matrix__footer"
                    onDragOver={(event) => {
                      const sourceId = getDraggedPersonId(event);
                      if (!sourceId) return;
                      event.preventDefault();
                      const lastInSection = sectionPeople[sectionPeople.length - 1];
                      if (lastInSection) {
                        setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                      }
                    }}
                    onDrop={(event) => {
                      const sourceId = getDraggedPersonId(event);
                      if (!sourceId) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const lastInSection = sectionPeople[sectionPeople.length - 1];
                      if (!lastInSection) {
                        setPeopleStateForCurrentMonth((prev) =>
                          prev.map((person) =>
                            person.id === sourceId ? { ...person, department: section } : person
                          )
                        );
                        endRowDrag();
                        return;
                      }
                      reorderPersonByDrop(sourceId, lastInSection.id, 'after');
                      setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                      window.setTimeout(() => setDragOverMarker(null), 120);
                      endRowDrag();
                    }}
                  >
                    {/** Количество уникальных госномеров в текущем блоке */ }
                    {(() => {
                      const platesCount = isPersonnelSection
                        ? 0
                        : new Set(
                            sectionPeople
                              .map((person) => person.plate.trim().toUpperCase())
                              .filter((plate) => plate.length > 0)
                          ).size;
                      return (
                        <>
                    <div className="ops-matrix__cell ops-matrix__cell--sticky">
                      {isPersonnelSection ? 'На смене:' : 'Итого'}
                    </div>
                    {!isPersonnelSection && (
                      <div className="ops-matrix__cell ops-matrix__cell--sticky-second ops-matrix__cell--total">
                        {platesCount}
                      </div>
                    )}
                    {!isPersonnelSection && <div className="ops-matrix__cell ops-matrix__cell--sticky-third"> </div>}
                    {(() => {
                      const dayTotals = monthDays.map((day) =>
                        sectionPeople.reduce((acc, person) => {
                          const code = getCellCode(person.rowIndex, day, person.id, person.department, '1');
                          if (section === 'Контейнеры' || section === 'Авто') {
                            const primaryWorked = code === 'W' || code === 'H' || (section === 'Авто' && code === 'S');
                            const secondaryWorked = person.secondName
                              ? (() => {
                                  const code2 = getCellCode(person.rowIndex + 50, day, person.id, person.department, '2');
                                  return code2 === 'W' || code2 === 'H' || (section === 'Авто' && code2 === 'S');
                                })()
                              : false;
                            return acc + (primaryWorked || secondaryWorked ? 1 : 0);
                          }
                          const next = code === 'W' ? acc + 1 : acc;
                          if (person.secondName) {
                            const code2 = getCellCode(person.rowIndex + 50, day, person.id, person.department, '2');
                            return code2 === 'W' ? next + 1 : next;
                          }
                          return next;
                        }, 0)
                      );
                      const sectionTotal = dayTotals.reduce((acc, value) => acc + value, 0);
                      return dayTotals.map((total, dayIndex) => (
                        <div
                          key={`total-${section}-${monthDays[dayIndex]}`}
                          className="ops-matrix__cell ops-matrix__cell--total"
                          style={{ gridColumn: dayColumnStart + dayIndex }}
                        >
                          {total}
                        </div>
                      )).concat(
                        <div className="ops-matrix__cell ops-matrix__cell--count" style={{ gridColumn: totalColumnIndex }} key={`total-sum-${section}`}>
                          {section === 'Контейнеры' || section === 'Авто' ? sectionTotal : ' '}
                        </div>
                      );
                    })()}
                        </>
                      );
                    })()}
                  </div>
                  {draggingId && (
                    <div
                      className="ops-matrix__section-drop-edge ops-matrix__section-drop-edge--bottom"
                      onDragOver={(event) => {
                        const sourceId = getDraggedPersonId(event);
                        if (!sourceId) return;
                        event.preventDefault();
                        const lastInSection = sectionPeople[sectionPeople.length - 1];
                        if (lastInSection) {
                          setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                        }
                      }}
                      onDrop={(event) => {
                        const sourceId = getDraggedPersonId(event);
                        if (!sourceId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const lastInSection = sectionPeople[sectionPeople.length - 1];
                        if (!lastInSection) {
                          setPeopleStateForCurrentMonth((prev) =>
                            prev.map((person) =>
                              person.id === sourceId ? { ...person, department: section } : person
                            )
                          );
                          endRowDrag();
                          return;
                        }
                        reorderPersonByDrop(sourceId, lastInSection.id, 'after');
                        setDragOverMarker({ personId: lastInSection.id, pos: 'after' });
                        window.setTimeout(() => setDragOverMarker(null), 120);
                        endRowDrag();
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
      </section>
      )}
      {isEfficiencySection && (
        <section className="ops-preview__efficiency">
          <Paper className="ops-efficiency-card">
            <div className="ops-efficiency-block">
              <div className="ops-efficiency-block__title">
                Расчет показателей использования контейнеровозов {parsedMonth.year} г. — {activeLocation === 'ktk_mow' ? 'КТК Москва' : 'КТК Владивосток'}
              </div>
              <table className="ops-efficiency-table">
                <thead>
                  <tr>
                    <th>Показатели</th>
                    {MONTH_LABELS_SHORT.map((label) => (
                      <th key={`containers-h-${label}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Количество контейнеровозов</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-cnt-${item.month}`}>{item.uniquePlatesCount}</td>)}
                  </tr>
                  <tr>
                    <td>Дней в месяце</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-days-${item.month}`}>{item.daysInMonth}</td>)}
                  </tr>
                  <tr>
                    <td>Всего автодней в месяц</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-total-${item.month}`}>{item.totalAutoDays}</td>)}
                  </tr>
                  <tr>
                    <td>Рабочие автодни, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-work-${item.month}`}>{item.workAutoDays}</td>)}
                  </tr>
                  <tr className="eff-row--coef-load">
                    <td>Коэффициент загрузки</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-load-${item.month}`}>{item.loadFactor == null ? '—' : item.loadFactor.toFixed(2).replace('.', ',')}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Выходные, отпуск, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-off-${item.month}`}>{item.offOrVacationDays}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Ремонт, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-repair-${item.month}`}>{item.repairDays}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Нет водителя, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-no-driver-${item.month}`}>{item.noDriverDays}</td>)}
                  </tr>
                  <tr>
                    <td>Неофициальный больничный, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-sick-${item.month}`}>{item.sickDays}</td>)}
                  </tr>
                  <tr className="eff-row--idle-total">
                    <td>Итого дни простоя</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-idle-${item.month}`}>{item.totalIdleDays}</td>)}
                  </tr>
                  <tr>
                    <td>Технически готовы, автодни</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-ready-${item.month}`}>{item.technicalReadyDays}</td>)}
                  </tr>
                  <tr className="eff-row--coef-ready">
                    <td>Коэффициент технической готовности</td>
                    {efficiencyBySection.containers.map((item) => <td key={`containers-ready-k-${item.month}`}>{item.technicalReadyFactor == null ? '—' : item.technicalReadyFactor.toFixed(2).replace('.', ',')}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {activeLocation !== 'ktk_mow' && (
            <div className="ops-efficiency-block">
              <div className="ops-efficiency-block__title">
                Расчет показателей использования автовозов {parsedMonth.year} г. — КТК Владивосток
              </div>
              <table className="ops-efficiency-table">
                <thead>
                  <tr>
                    <th>Показатели</th>
                    {MONTH_LABELS_SHORT.map((label) => (
                      <th key={`auto-h-${label}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Количество автовозов</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-cnt-${item.month}`}>{item.uniquePlatesCount}</td>)}
                  </tr>
                  <tr>
                    <td>Дней в месяце</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-days-${item.month}`}>{item.daysInMonth}</td>)}
                  </tr>
                  <tr>
                    <td>Всего автодней в месяц</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-total-${item.month}`}>{item.totalAutoDays}</td>)}
                  </tr>
                  <tr>
                    <td>Рабочие автодни, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-work-${item.month}`}>{item.workAutoDays}</td>)}
                  </tr>
                  <tr className="eff-row--coef-load">
                    <td>Коэффициент загрузки</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-load-${item.month}`}>{item.loadFactor == null ? '—' : item.loadFactor.toFixed(2).replace('.', ',')}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Выходные, отпуск, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-off-${item.month}`}>{item.offOrVacationDays}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Ремонт, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-repair-${item.month}`}>{item.repairDays}</td>)}
                  </tr>
                  <tr className="eff-row--peach">
                    <td>Нет водителя, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-no-driver-${item.month}`}>{item.noDriverDays}</td>)}
                  </tr>
                  <tr>
                    <td>Неофициальный больничный, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-sick-${item.month}`}>{item.sickDays}</td>)}
                  </tr>
                  <tr className="eff-row--idle-total">
                    <td>Итого дни простоя</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-idle-${item.month}`}>{item.totalIdleDays}</td>)}
                  </tr>
                  <tr>
                    <td>Технически готовы, автодни</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-ready-${item.month}`}>{item.technicalReadyDays}</td>)}
                  </tr>
                  <tr className="eff-row--coef-ready">
                    <td>Коэффициент технической готовности</td>
                    {efficiencyBySection.auto.map((item) => <td key={`auto-ready-k-${item.month}`}>{item.technicalReadyFactor == null ? '—' : item.technicalReadyFactor.toFixed(2).replace('.', ',')}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </Paper>
        </section>
      )}
      {!isEfficiencySection && (
      <section className="ops-preview__legend">
        <div className="ops-matrix__legend">
          {visibleCellCodes.map((code) => (
            <span key={CELL_META[code].css} className={`legend-item ${CELL_META[code].css}`}>
              {CELL_META[code].code} — {isPersonnelSection
                ? CELL_META[code].code === '1'
                  ? 'рабочий день'
                  : CELL_META[code].code === 'О'
                    ? 'отпуск'
                    : CELL_META[code].code === 'Б'
                      ? 'больничный'
                      : 'выходной'
                : code === 'H' && filter === 'Авто'
                  ? 'Погрузка'
                  : code === 'S' && filter === 'Авто'
                    ? 'Снятие груза'
                  : CELL_META[code].label}
            </span>
          ))}
        </div>
      </section>
      )}
      {addOpen && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Добавить</div>
            <label className="ops-control">
              <span>ФИО</span>
              <input
                type="text"
                value={newPerson.name}
                onChange={(event) => {
                  setNewPerson((prev) => ({ ...prev, name: event.target.value }));
                  if (addError) setAddError(null);
                }}
                placeholder="Иванов Иван"
              />
            </label>
            {!isPersonnelSection && (
              <label className="ops-control">
                <span>Второй водитель (опц.)</span>
                <input
                  type="text"
                  value={newPerson.secondName}
                  onChange={(event) => setNewPerson((prev) => ({ ...prev, secondName: event.target.value }))}
                  placeholder="Петров Петр"
                />
              </label>
            )}
            {!isPersonnelSection && (
              <label className="ops-control">
                <span>Г/Н ТС</span>
                <input
                  type="text"
                  value={newPerson.plate}
                  onChange={(event) => {
                    setNewPerson((prev) => ({ ...prev, plate: event.target.value }));
                    if (addError) setAddError(null);
                  }}
                  placeholder="А123ВС"
                />
              </label>
            )}
            {addError && <div className="ops-modal__error">{addError}</div>}
            <div className="ops-modal__actions ops-modal__actions--split">
              <button
                type="button"
                className="ops-btn ops-modal__btn-left"
                onClick={() => {
                  if (!canAddRows) return;
                  const name = newPerson.name.trim();
                  const plate = newPerson.plate.trim();
                  const secondName = newPerson.secondName.trim();
                  if (!name) {
                    setAddError('Заполните ФИО.');
                    return;
                  }
                  setPeopleStateForCurrentMonth((prev) => [
                    ...prev,
                    {
                      id: `p-${Date.now()}`,
                      name,
                      secondName: isPersonnelSection ? undefined : secondName || undefined,
                      plate: isPersonnelSection ? '' : plate || '',
                      department: addDepartment,
                    },
                  ]);
                  setNewPerson({ name: '', secondName: '', plate: '' });
                  setAddError(null);
                  setAddOpen(false);
                }}
              >
                Добавить
              </button>
              <button type="button" className="ops-btn ghost ops-modal__btn-right" onClick={() => setAddOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      {copyConfirmOpen && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Подтверждение</div>
            <div className="ops-modal__subtitle">В Факте есть ручные правки за этот месяц.</div>
            <div className="ops-modal__subtitle">Заменить Факт значениями из Плана?</div>
            <div className="ops-modal__actions ops-modal__actions--split">
              <button
                type="button"
                className="ops-btn ops-modal__btn-left"
                onClick={() => {
                  setCopyConfirmOpen(false);
                  void copyPlanToFactAndSave();
                }}
                disabled={saving}
              >
                Заменить
              </button>
              <button
                type="button"
                className="ops-btn ghost ops-modal__btn-right"
                onClick={() => {
                  setCopyConfirmOpen(false);
                  setCopyStatus(null);
                }}
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}
      {fillPrevConfirmOpen && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Подтверждение</div>
            <div className="ops-modal__subtitle">План текущего месяца будет заменен данными прошлого месяца.</div>
            <div className="ops-modal__subtitle">Продолжить?</div>
            <div className="ops-modal__actions ops-modal__actions--split">
              <button
                type="button"
                className="ops-btn ops-modal__btn-left"
                onClick={() => {
                  handleFillPlanFromPreviousMonth();
                  setFillPrevConfirmOpen(false);
                }}
              >
                Заполнить
              </button>
              <button
                type="button"
                className="ops-btn ghost ops-modal__btn-right"
                onClick={() => {
                  setFillPrevConfirmOpen(false);
                  setCopyStatus(null);
                }}
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}
      {editPerson && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Редактировать строку</div>
            <label className="ops-control">
              <span>
                {editPerson.department === 'Диспетчера'
                  ? 'Диспетчер'
                  : editPerson.department === 'Курьеры'
                    ? 'Оперативник'
                    : editPerson.department === 'Автослесари'
                      ? 'Автослесарь'
                    : 'Первый водитель'}
              </span>
              <input
                type="text"
                value={editPerson.name}
                onChange={(event) => setEditPerson((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              />
            </label>
            {!isPersonnelDepartment(editPerson.department) && (
              <>
                <label className="ops-control">
                  <span>Второй водитель</span>
                  <input
                    type="text"
                    value={editPerson.secondName ?? ''}
                    onChange={(event) =>
                      setEditPerson((prev) => (prev ? { ...prev, secondName: event.target.value || undefined } : prev))
                    }
                  />
                </label>
                <label className="ops-control">
                  <span>Г/Н ТС</span>
                  <input
                    type="text"
                    value={editPerson.plate}
                    onChange={(event) => setEditPerson((prev) => (prev ? { ...prev, plate: event.target.value } : prev))}
                  />
                </label>
              </>
            )}
            <div className="ops-modal__actions ops-modal__actions--split">
              <button
                type="button"
                className="ops-btn ops-modal__btn-left"
                onClick={() => {
                  setPeopleStateForCurrentMonth((prev) =>
                    prev.map((item) => (item.id === editPerson.id ? editPerson : item))
                  );
                  setEditPerson(null);
                }}
              >
                Сохранить
              </button>
              <button type="button" className="ops-btn ghost ops-modal__btn-right" onClick={() => setEditPerson(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="ops-context-overlay"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="ops-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ops-context-item"
              onClick={() => {
                setClipboardPerson(contextMenu.person);
                setContextMenu(null);
              }}
            >
              Копировать
            </button>
            <button
              type="button"
              className={`ops-context-item${clipboardPerson ? '' : ' disabled'}`}
              disabled={!clipboardPerson}
              onClick={() => {
                if (!clipboardPerson) return;
                handlePastePerson(contextMenu.person.department);
                setContextMenu(null);
              }}
            >
              Вставить
            </button>
            <button
              type="button"
              className="ops-context-item"
              onClick={() => {
                if (!canEditRows) return;
                setEditPerson(contextMenu.person);
                setContextMenu(null);
              }}
            >
              Редактировать
            </button>
            <button
              type="button"
              className="ops-context-item danger"
              onClick={() => {
                handleDeleteFromContext();
                setContextMenu(null);
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
