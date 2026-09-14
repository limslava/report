import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  ListItemIcon,
  ListItemText,
  Menu,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import {
  DragIndicator,
  FilterList,
  KeyboardArrowDown,
  KeyboardArrowUp,
  MenuBook,
  PushPin,
  Settings,
  ViewColumn,
} from '@mui/icons-material';
import {
  createDispatcherOrder,
  deleteDispatcherOrder,
  getDispatcherCrew,
  getDispatcherDictionaryOptions,
  getDispatcherOrders,
  getDispatcherStatuses,
  updateDispatcherOrder,
  type DispatcherCrewEntry,
  type DispatcherDictionaryOptions,
  type DispatcherOrderPatch,
  type DispatcherOrderRow,
  type DispatcherStatusOption,
} from '../services/dispatcher-journal.api';
import { getDirectoryOptions } from '../services/directories.api';
import { subscribePlansRealtime } from '../services/plans-realtime';
import { useAuthStore } from '../store/auth-store';
import {
  cycleSort,
  loadSortState,
  saveSortState,
  sortIndicator,
  sortRows as applySort,
  type TableSortState,
} from '../utils/tableSort';
import {
  applyColumnPrefs,
  isHidden,
  moveColumnTo,
  orderedKeys,
  toggleHidden,
  type ColumnPrefs,
} from '../utils/tableColumns';
import ListCell from '../components/dispatcher/ListCell';
import TimeCell from '../components/dispatcher/TimeCell';
import ColumnFilterPopover, { EMPTY_FILTER_VALUE } from '../components/dispatcher/ColumnFilterPopover';
import DispatcherDictionariesDialog from '../components/dispatcher/DispatcherDictionariesDialog';
import {
  amountWithoutVat,
  buildOrderText,
  formatMoney,
  isCompletedStatus,
  personKey,
  plateKey,
  shortPersonName,
} from '../components/dispatcher/dispatcherJournalUtils';
import '../styles/dispatcher-journal.css';

const pad2 = (value: number): string => String(value).padStart(2, '0');

const todayYmd = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const currentMonth = (): string => todayYmd().slice(0, 7);

const formatDateShort = (ymd: string): string => {
  const [, month, day] = ymd.split('-');
  return `${day}.${month}`;
};

const formatDateFull = (ymd: string): string => `${formatDateShort(ymd)}.${ymd.slice(0, 4)}`;

/** Парсинг даты из буфера обмена: 01.09.2026 / 01.09 / 2026-09-01. */
const parseClipboardDate = (raw: string, fallbackMonth: string): string | null => {
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  let match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (match) return `${match[3]}-${pad2(Number(match[2]))}-${pad2(Number(match[1]))}`;
  match = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(text);
  if (match) return `20${match[3]}-${pad2(Number(match[2]))}-${pad2(Number(match[1]))}`;
  match = /^(\d{1,2})\.(\d{1,2})$/.exec(text);
  if (match) return `${fallbackMonth.slice(0, 4)}-${pad2(Number(match[2]))}-${pad2(Number(match[1]))}`;
  return null;
};

const TRUE_WORDS = new Set(['да', 'true', '1', 'истина', 'yes', '+']);

/** Тёмный или светлый текст поверх цвета статуса. */
const textColorFor = (hex: string): string => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#1f2733';
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? '#1f2733' : '#ffffff';
};

type TextFieldName =
  | 'info' | 'client' | 'driverName' | 'vehiclePlate' | 'ktkNumber' | 'ktkType'
  | 'grossWeight' | 'comments' | 'operation' | 'terminalFrom' | 'slotFrom' | 'pinFrom'
  | 'deliveryAddress' | 'terminalTo' | 'slotTo' | 'pinTo'
  | 'driverRate' | 'vat' | 'clientRate' | 'passes' | 'extraAddress' | 'demurrage'
  | 'extraTon' | 'seal' | 'driverRemarks';

type BooleanFieldName = 'orderOnVehicle' | 'invoiceSent' | 'recoupling';

/** Источник подсказок ячейки: справочники реестра или справочники водителей/техники. */
type ListSource = keyof DispatcherDictionaryOptions | 'drivers' | 'vehicles';

type ColumnDef =
  | { kind: 'status'; field: 'status'; title: string; width: number }
  | { kind: 'text'; field: TextFieldName; title: string; width: number; multiline?: boolean; list?: ListSource }
  | { kind: 'time'; field: 'submitTime'; title: string; width: number }
  | { kind: 'checkbox'; field: BooleanFieldName; title: string; width: number }
  | { kind: 'computed'; field: 'amountWithoutVat'; title: string; width: number };

/**
 * Все колонки журнала (порядок — как в google-таблице отдела). Видимость,
 * порядок и ширина настраиваются пользователем; фиксированы только номер
 * строки, дата и кнопка удаления.
 */
const ALL_COLUMNS: ColumnDef[] = [
  { kind: 'status', field: 'status', title: 'Статус', width: 130 },
  { kind: 'text', field: 'info', title: 'Инфо', width: 70 },
  { kind: 'text', field: 'client', title: 'Клиент', width: 120 },
  { kind: 'text', field: 'driverName', title: 'ФИО водителя', width: 115, list: 'drivers' },
  { kind: 'text', field: 'vehiclePlate', title: 'Гос номер', width: 90, list: 'vehicles' },
  { kind: 'text', field: 'ktkNumber', title: '№ КТК', width: 105 },
  { kind: 'text', field: 'ktkType', title: 'Тип', width: 58, list: 'ktk_type' },
  { kind: 'text', field: 'grossWeight', title: 'Вес (брутто)', width: 80 },
  { kind: 'text', field: 'comments', title: 'Комментарии', width: 140, multiline: true },
  { kind: 'text', field: 'operation', title: 'Операция', width: 90, list: 'operation' },
  { kind: 'text', field: 'terminalFrom', title: 'Терминал постановки', width: 150, multiline: true },
  { kind: 'text', field: 'slotFrom', title: 'Слот', width: 60 },
  { kind: 'text', field: 'pinFrom', title: 'Пин', width: 58 },
  { kind: 'time', field: 'submitTime', title: 'Время подачи', width: 74 },
  { kind: 'text', field: 'deliveryAddress', title: 'Адрес доставки', width: 170, multiline: true },
  { kind: 'text', field: 'terminalTo', title: 'Терминал снятия', width: 150, multiline: true },
  { kind: 'text', field: 'slotTo', title: 'Слот снятия', width: 60 },
  { kind: 'text', field: 'pinTo', title: 'Пин снятия', width: 58 },
  { kind: 'text', field: 'driverRate', title: 'Ставка водителя', width: 70 },
  { kind: 'text', field: 'vat', title: 'НДС', width: 74, list: 'vat' },
  { kind: 'text', field: 'clientRate', title: 'Ставка', width: 70 },
  { kind: 'text', field: 'passes', title: 'Пропуска', width: 70 },
  { kind: 'computed', field: 'amountWithoutVat', title: 'Без НДС', width: 76 },
  { kind: 'text', field: 'extraAddress', title: 'Доп адрес', width: 120, multiline: true },
  { kind: 'text', field: 'demurrage', title: 'Простой/руб', width: 75 },
  { kind: 'checkbox', field: 'orderOnVehicle', title: 'Заказ на ТС', width: 52 },
  { kind: 'checkbox', field: 'invoiceSent', title: 'Отправка счета', width: 52 },
  { kind: 'text', field: 'extraTon', title: 'Доп тонна', width: 70 },
  { kind: 'text', field: 'seal', title: 'Пломба', width: 70 },
  { kind: 'checkbox', field: 'recoupling', title: 'Перецеп', width: 50 },
  { kind: 'text', field: 'driverRemarks', title: 'Замечания к водителю', width: 140, multiline: true },
];

const ALL_COLUMN_KEYS = ALL_COLUMNS.map((column) => column.field);
const COLUMN_BY_KEY = new Map<string, ColumnDef>(ALL_COLUMNS.map((column) => [column.field, column]));
const NO_DEFAULT_HIDDEN: string[] = [];

/** Ширины служебных колонок: номер строки, дата, удаление. */
const ROWNUM_WIDTH = 32;
const DATE_WIDTH = 96;
const DELETE_WIDTH = 28;
const MIN_COLUMN_WIDTH = 40;
/** Псевдо-ключ колонки даты (фильтр, сортировка, закрепление). */
const DATE_KEY = 'orderDate';

/**
 * Колонки, появившиеся после того, как пользователь сохранил свой порядок,
 * встают на место по умолчанию (а не в конец): «Без НДС» — сразу после «Пропуска».
 */
const withNewColumnDefaults = (prefs: ColumnPrefs | undefined): ColumnPrefs | undefined => {
  if (!prefs || prefs.order.includes('amountWithoutVat')) return prefs;
  const order = [...prefs.order];
  const passesIndex = order.indexOf('passes');
  order.splice(passesIndex >= 0 ? passesIndex + 1 : order.length, 0, 'amountWithoutVat');
  return { ...prefs, order };
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

const EMPTY_DICTIONARY_OPTIONS: DispatcherDictionaryOptions = { ktk_type: [], vat: [], operation: [] };

/** Кто ведёт справочники реестра (проверка дублируется на сервере). */
const DICTIONARY_EDIT_ROLES = new Set(['admin', 'head_ktk_vvo']);

type EditableCellProps = {
  value: string | null;
  multiline?: boolean;
  onSave: (value: string) => void;
};

function EditableCell({ value, multiline, onSave }: EditableCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
  }, [value]);

  const commit = () => {
    focusedRef.current = false;
    if (draft !== (value ?? '')) onSave(draft);
  };

  if (multiline) {
    return (
      <textarea
        className="dj-cell-textarea"
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className="dj-cell-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

type StatusCellProps = {
  value: string | null;
  statuses: DispatcherStatusOption[];
  statusByName: Map<string, DispatcherStatusOption>;
  onSave: (value: string | null) => void;
};

/** Статус: выпадающий список с подбором по вводу (печатаешь — фильтруются ближайшие). */
function StatusCell({ value, statuses, statusByName, onSave }: StatusCellProps) {
  const status = value ? statusByName.get(value) : undefined;
  return (
    <Autocomplete
      size="small"
      options={statuses.map((item) => item.name)}
      value={value ?? null}
      onChange={(_event, next) => onSave(next)}
      autoHighlight
      clearOnEscape
      noOptionsText="нет похожих статусов"
      slotProps={{ popper: { sx: { width: 'auto !important', minWidth: 200 }, placement: 'bottom-start' } }}
      renderOption={(props, option) => {
        const optionStatus = statusByName.get(option);
        return (
          <li {...props} key={option} style={{ ...(props as { style?: React.CSSProperties }).style, paddingTop: 3, paddingBottom: 3 }}>
            <span
              className="dj-status-chip"
              style={optionStatus ? { background: optionStatus.color, color: textColorFor(optionStatus.color) } : undefined}
            >
              {option}
            </span>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="статус…"
          InputProps={{
            ...params.InputProps,
            disableUnderline: true,
            className: 'dj-status-input',
            style: status
              ? { background: status.color, color: textColorFor(status.color) }
              : undefined,
          }}
        />
      )}
    />
  );
}

type Message = { severity: 'error' | 'success'; text: string } | null;

/** Текст ячейки для фильтра, копирования и сортировки. */
const columnText = (row: DispatcherOrderRow, column: ColumnDef): string => {
  if (column.kind === 'checkbox') return row[column.field] ? 'да' : '';
  if (column.kind === 'computed') return formatMoney(amountWithoutVat(row.clientRate, row.passes, row.vat));
  if (column.field === 'driverName') return shortPersonName(row.driverName);
  return row[column.field] ?? '';
};

export default function DispatcherJournalPage() {
  const { user } = useAuthStore();
  const canEditDictionaries = DICTIONARY_EDIT_ROLES.has(user?.role ?? '');
  const [viewMonth, setViewMonth] = useState<string>(currentMonth());
  const [rows, setRows] = useState<DispatcherOrderRow[]>([]);
  const [statuses, setStatuses] = useState<DispatcherStatusOption[]>([]);
  const [dictionaryOptions, setDictionaryOptions] = useState<DispatcherDictionaryOptions>(EMPTY_DICTIONARY_OPTIONS);
  const [driverOptions, setDriverOptions] = useState<string[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [ghostKey, setGhostKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: DispatcherOrderRow } | null>(null);
  const [orderText, setOrderText] = useState<{ title: string; text: string } | null>(null);
  const [dictionariesOpen, setDictionariesOpen] = useState(false);
  const reloadTimerRef = useRef<number | null>(null);
  // Текущий месяц показывается вместе с ближайшим будущим (до 60 дней):
  // заявка от 29.09 на вывоз 01.10 видна, не дожидаясь октября. Прошлые
  // и будущие месяцы — строго архив месяца.
  const range = useMemo(() => {
    const [year, monthNo] = viewMonth.split('-').map(Number);
    if (viewMonth === currentMonth()) {
      const now = new Date();
      const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);
      const to = `${toDate.getFullYear()}-${pad2(toDate.getMonth() + 1)}-${pad2(toDate.getDate())}`;
      return { from: `${viewMonth}-01`, to };
    }
    return { from: `${viewMonth}-01`, to: `${viewMonth}-${pad2(new Date(year, monthNo, 0).getDate())}` };
  }, [viewMonth]);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectedRowIdRef = useRef(selectedRowId);
  selectedRowIdRef.current = selectedRowId;

  // дата новых строк: сегодня в текущем месяце, иначе 1-е число месяца
  const defaultNewDate = viewMonth === currentMonth() ? todayYmd() : `${viewMonth}-01`;

  const userKey = user?.id ?? 'anonymous';

  // настройка колонок (видимость + порядок), на пользователя — как в справочниках
  const columnsStorageKey = `dj-columns-v1:${userKey}`;
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs | undefined>(() =>
    withNewColumnDefaults(loadSortState<ColumnPrefs | undefined>(columnsStorageKey, undefined))
  );
  useEffect(() => saveSortState(columnsStorageKey, columnPrefs), [columnsStorageKey, columnPrefs]);
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const dragColumnKey = useRef<string | null>(null);
  const visibleColumns = useMemo(
    () => applyColumnPrefs(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, columnPrefs)
      .map((key) => COLUMN_BY_KEY.get(key))
      .filter((column): column is ColumnDef => Boolean(column)),
    [columnPrefs],
  );
  const visibleColumnsRef = useRef(visibleColumns);
  visibleColumnsRef.current = visibleColumns;

  // ширина колонок — у каждого сотрудника своя (перетаскивание края заголовка)
  const widthsStorageKey = `dj-widths-v1:${userKey}`;
  const [customWidths, setCustomWidths] = useState<Record<string, number>>(() =>
    loadSortState<Record<string, number>>(widthsStorageKey, {})
  );
  useEffect(() => saveSortState(widthsStorageKey, customWidths), [widthsStorageKey, customWidths]);

  // закреплённые слева колонки: № и дата + всё до выбранной колонки включительно
  const pinStorageKey = `dj-pin-v1:${userKey}`;
  const [pinnedUntil, setPinnedUntil] = useState<string | null>(() => {
    try {
      return localStorage.getItem(pinStorageKey) || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (pinnedUntil) localStorage.setItem(pinStorageKey, pinnedUntil);
      else localStorage.removeItem(pinStorageKey);
    } catch {
      // приватный режим — закрепление живёт до перезагрузки
    }
  }, [pinStorageKey, pinnedUntil]);

  // фильтры по значениям (как в google-таблицах): храним скрытые значения
  const filtersStorageKey = `dj-filters-v1:${userKey}`;
  const [filters, setFilters] = useState<Record<string, string[]>>(() =>
    loadSortState<Record<string, string[]>>(filtersStorageKey, {})
  );
  useEffect(() => saveSortState(filtersStorageKey, filters), [filtersStorageKey, filters]);
  const activeFilterCount = Object.values(filters).filter((hidden) => hidden.length > 0).length;
  const [filterMenu, setFilterMenu] = useState<{ field: string; anchor: HTMLElement } | null>(null);
  // строки, созданные в этой сессии, не прячутся фильтром — иначе новая заявка «исчезает» при вводе
  const sessionCreatedIdsRef = useRef<Set<string>>(new Set());

  // ширина области таблицы: колонки без ручной ширины растягиваются на большом экране
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => setWrapWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columnWidths = useMemo(() => {
    const customSum = visibleColumns.reduce((sum, column) => sum + (customWidths[column.field] ?? 0), 0);
    const defaultSum = visibleColumns.reduce((sum, column) => sum + (customWidths[column.field] ? 0 : column.width), 0);
    const free = wrapWidth - ROWNUM_WIDTH - DATE_WIDTH - DELETE_WIDTH - customSum - 2;
    const scale = defaultSum > 0 ? Math.max(1, free / defaultSum) : 1;
    const widths: Record<string, number> = {};
    visibleColumns.forEach((column) => {
      widths[column.field] = customWidths[column.field] ?? Math.floor(column.width * scale);
    });
    return widths;
  }, [customWidths, visibleColumns, wrapWidth]);
  const tableWidth = ROWNUM_WIDTH + DATE_WIDTH + DELETE_WIDTH
    + visibleColumns.reduce((sum, column) => sum + columnWidths[column.field], 0);

  const pinnedOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    if (!pinnedUntil) return offsets;
    offsets.set('__rownum', 0);
    offsets.set(DATE_KEY, ROWNUM_WIDTH);
    const untilIndex = visibleColumns.findIndex((column) => column.field === pinnedUntil);
    let left = ROWNUM_WIDTH + DATE_WIDTH;
    for (let index = 0; index <= untilIndex; index += 1) {
      const field = visibleColumns[index].field;
      offsets.set(field, left);
      left += columnWidths[field];
    }
    return offsets;
  }, [columnWidths, pinnedUntil, visibleColumns]);
  const lastPinnedKey = pinnedUntil
    ? (visibleColumns.some((column) => column.field === pinnedUntil) ? pinnedUntil : DATE_KEY)
    : null;
  const pinStyle = (key: string): React.CSSProperties | undefined => {
    const left = pinnedOffsets.get(key);
    return left === undefined ? undefined : { position: 'sticky', left };
  };
  const pinClass = (key: string): string => {
    if (!pinnedOffsets.has(key)) return '';
    return key === lastPinnedKey ? ' dj-pinned dj-pinned--last' : ' dj-pinned';
  };

  const startResize = (event: React.MouseEvent, field: string) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[field] ?? MIN_COLUMN_WIDTH;
    document.body.classList.add('dj-resizing');
    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
      setCustomWidths((prev) => ({ ...prev, [field]: width }));
    };
    const onUp = () => {
      document.body.classList.remove('dj-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const statusByName = useMemo(() => {
    const map = new Map<string, DispatcherStatusOption>();
    statuses.forEach((status) => map.set(status.name, status));
    return map;
  }, [statuses]);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  // сортировка по заголовкам: asc -> desc -> исходный порядок (по датам)
  const sortStorageKey = `dj-sort-v1:${userKey}`;
  const [sort, setSort] = useState<TableSortState>(() => loadSortState<TableSortState>(sortStorageKey, null));
  useEffect(() => saveSortState(sortStorageKey, sort), [sortStorageKey, sort]);
  const sortValue = useCallback((row: DispatcherOrderRow, field: string): unknown => {
    if (field === DATE_KEY) return row.orderDate;
    const column = COLUMN_BY_KEY.get(field);
    if (!column) return '';
    if (column.kind === 'checkbox') return row[column.field] ? 1 : '';
    if (column.kind === 'computed') return amountWithoutVat(row.clientRate, row.passes, row.vat) ?? '';
    if (column.field === 'ktkType' && row.ktkType) {
      // типы КТК — в порядке справочника (20DC, 20HC … 40FR), а не по алфавиту
      const index = dictionaryOptions.ktk_type.indexOf(row.ktkType);
      return index >= 0 ? index : 1000 + row.ktkType.charCodeAt(0);
    }
    return columnText(row, column);
  }, [dictionaryOptions.ktk_type]);

  const filterText = useCallback((row: DispatcherOrderRow, field: string): string => {
    if (field === DATE_KEY) return formatDateFull(row.orderDate);
    const column = COLUMN_BY_KEY.get(field);
    const text = column ? columnText(row, column).trim() : '';
    return text || EMPTY_FILTER_VALUE;
  }, []);

  const displayRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, hidden]) => hidden.length > 0);
    const filtered = activeFilters.length
      ? rows.filter((row) => sessionCreatedIdsRef.current.has(row.id)
        || activeFilters.every(([field, hidden]) => !hidden.includes(filterText(row, field))))
      : rows;
    return applySort(filtered, sort, sortValue);
  }, [filterText, filters, rows, sort, sortValue]);

  const loadRows = useCallback(async (withSpinner = false) => {
    const target = rangeRef.current;
    if (withSpinner) setLoading(true);
    try {
      const { data } = await getDispatcherOrders(target.from, target.to);
      if (rangeRef.current.from === target.from && rangeRef.current.to === target.to) setRows(data);
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось загрузить журнал' });
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(true);
  }, [range, loadRows]);

  const loadDictionaries = useCallback(() => {
    getDispatcherStatuses()
      .then((response) => setStatuses(response.data))
      .catch(() => setMessage({ severity: 'error', text: 'Не удалось загрузить статусы' }));
    getDispatcherDictionaryOptions()
      .then((response) => setDictionaryOptions({ ...EMPTY_DICTIONARY_OPTIONS, ...response.data }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadDictionaries();
    getDirectoryOptions('vvo')
      .then((response) => {
        const drivers = response.data.employees
          .filter((employee) => employee.position === 'водитель')
          .map((employee) => shortPersonName(employee.fullName));
        setDriverOptions([...new Set(drivers)].sort((a, b) => a.localeCompare(b, 'ru')));
        setVehicleOptions(response.data.vehicles);
      })
      .catch(() => undefined);
  }, [loadDictionaries]);

  // realtime: другие диспетчера меняют журнал или справочники — подтягиваем изменения
  useEffect(() => {
    const unsubscribe = subscribePlansRealtime((payload) => {
      const event = payload as { type?: string; date?: string };
      if (event?.type === 'dispatcher-journal:dictionaries-updated') {
        loadDictionaries();
        return;
      }
      if (event?.type !== 'dispatcher-journal:updated') return;
      if (!event.date || event.date < rangeRef.current.from || event.date > rangeRef.current.to) return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        void loadRows();
      }, 250);
    });
    return () => {
      unsubscribe();
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
  }, [loadDictionaries, loadRows]);

  // ── экипажи из графика контейнеровозов (кэш на дату, 2 минуты) ──
  const crewCacheRef = useRef(new Map<string, { at: number; promise: Promise<DispatcherCrewEntry[]> }>());
  const getCrew = useCallback((date: string): Promise<DispatcherCrewEntry[]> => {
    const cached = crewCacheRef.current.get(date);
    if (cached && Date.now() - cached.at < 120_000) return cached.promise;
    const promise = getDispatcherCrew(date)
      .then((response) => response.data)
      .catch(() => {
        crewCacheRef.current.delete(date);
        return [] as DispatcherCrewEntry[];
      });
    crewCacheRef.current.set(date, { at: Date.now(), promise });
    return promise;
  }, []);

  /**
   * Подстановка экипажа из графика работы:
   * - выбрали водителя — госномер подтягивается, если он пуст или был машиной прежнего водителя;
   * - выбрали госномер — водитель подтягивается, только если ячейка водителя пуста
   *   (на машине двое — берём того, кто в этот день на линии).
   * Подставленное значение можно исправить вручную — повторно оно не перезапишется.
   */
  const withCrew = useCallback(async (
    date: string,
    current: DispatcherOrderRow | null,
    field: 'driverName' | 'vehiclePlate',
    value: string,
  ): Promise<DispatcherOrderPatch> => {
    const patch: DispatcherOrderPatch = { [field]: value || null };
    if (!value) return patch;
    const crew = await getCrew(date);
    if (!crew.length) return patch;
    if (field === 'driverName') {
      const plateOf = (name: string | null | undefined) =>
        crew.find((entry) => personKey(entry.driverName) === personKey(name))?.plate ?? '';
      const plate = plateOf(value);
      const currentPlate = current?.vehiclePlate?.trim() ?? '';
      const previousPairPlate = current?.driverName ? plateOf(current.driverName) : '';
      const canReplace = !currentPlate || (previousPairPlate && plateKey(previousPairPlate) === plateKey(currentPlate));
      if (plate && canReplace && plateKey(plate) !== plateKey(currentPlate)) patch.vehiclePlate = plate;
    } else if (!current?.driverName?.trim()) {
      const matches = crew.filter((entry) => entry.plate && plateKey(entry.plate) === plateKey(value));
      const onLine = matches.filter((entry) => entry.onLine);
      const pick = onLine.length === 1 ? onLine[0] : matches.length === 1 ? matches[0] : null;
      if (pick) patch.driverName = shortPersonName(pick.driverName);
    }
    return patch;
  }, [getCrew]);

  const sortByDate = (list: DispatcherOrderRow[]): DispatcherOrderRow[] =>
    [...list].sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  // ── Ctrl+Z: стек отмены последних действий (правка ячейки, создание, удаление) ──
  type UndoEntry =
    | { kind: 'patch'; id: string; before: DispatcherOrderPatch }
    | { kind: 'create'; id: string }
    | { kind: 'delete'; row: DispatcherOrderRow };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const pushUndo = (entry: UndoEntry) => {
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  };

  const patchRow = useCallback((id: string, patch: DispatcherOrderPatch, options?: { skipUndo?: boolean }) => {
    if (!options?.skipUndo) {
      const current = rowsRef.current.find((row) => row.id === id);
      if (current) {
        const before: DispatcherOrderPatch = {};
        (Object.keys(patch) as Array<keyof DispatcherOrderPatch>).forEach((key) => {
          (before as Record<string, unknown>)[key] = current[key] ?? null;
        });
        pushUndo({ kind: 'patch', id, before });
      }
    }
    setRows((prev) => sortByDate(prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
      .filter((row) => row.orderDate >= rangeRef.current.from && row.orderDate <= rangeRef.current.to)));
    updateDispatcherOrder(id, patch).catch(() => {
      setMessage({ severity: 'error', text: 'Не удалось сохранить изменение' });
      void loadRows();
    });
  }, [loadRows]);

  const createRow = useCallback(async (orderDate: string, initial?: DispatcherOrderPatch, options?: { skipUndo?: boolean }) => {
    try {
      const { data } = await createDispatcherOrder(orderDate, initial);
      sessionCreatedIdsRef.current.add(data.id);
      if (orderDate >= rangeRef.current.from && orderDate <= rangeRef.current.to) {
        setRows((prev) => sortByDate([...prev, data]));
      }
      if (!options?.skipUndo) pushUndo({ kind: 'create', id: data.id });
      setGhostKey((prev) => prev + 1);
      return data;
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось добавить строку' });
      return null;
    }
  }, []);

  const deleteRow = useCallback(async (row: DispatcherOrderRow, options?: { silent?: boolean; skipUndo?: boolean }) => {
    if (!options?.silent) {
      const label = [row.ktkNumber, row.client].filter(Boolean).join(', ');
      if (!window.confirm(`Удалить строку${label ? ` (${label})` : ''}?`)) return;
    }
    try {
      await deleteDispatcherOrder(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (selectedRowIdRef.current === row.id) setSelectedRowId(null);
      if (!options?.skipUndo) pushUndo({ kind: 'delete', row });
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось удалить строку' });
    }
  }, []);

  const undoLast = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) {
      setMessage({ severity: 'success', text: 'Отменять нечего' });
      return;
    }
    if (entry.kind === 'patch') {
      patchRow(entry.id, entry.before, { skipUndo: true });
      setMessage({ severity: 'success', text: 'Правка отменена' });
    } else if (entry.kind === 'create') {
      const row = rowsRef.current.find((item) => item.id === entry.id);
      if (row) void deleteRow(row, { silent: true, skipUndo: true });
      setMessage({ severity: 'success', text: 'Создание строки отменено' });
    } else {
      const { id: _id, orderDate, updatedAt: _updatedAt, ...fields } = entry.row;
      void createRow(orderDate, fields, { skipUndo: true });
      setMessage({ severity: 'success', text: 'Строка восстановлена' });
    }
  }, [createRow, deleteRow, patchRow]);

  const saveCrewField = useCallback(async (row: DispatcherOrderRow, field: 'driverName' | 'vehiclePlate', value: string) => {
    const current = rowsRef.current.find((item) => item.id === row.id) ?? row;
    const patch = await withCrew(current.orderDate, current, field, value);
    patchRow(row.id, patch);
    if (field === 'driverName' && patch.vehiclePlate) {
      setMessage({ severity: 'success', text: `Госномер из графика: ${patch.vehiclePlate}` });
    } else if (field === 'vehiclePlate' && patch.driverName) {
      setMessage({ severity: 'success', text: `Водитель из графика: ${patch.driverName}` });
    }
  }, [patchRow, withCrew]);

  // ── Excel-обмен: выделение строки, Ctrl+C / Ctrl+X / Ctrl+V ──
  const rowToTsv = useCallback((row: DispatcherOrderRow): string => {
    const cells: string[] = [formatDateFull(row.orderDate)];
    visibleColumnsRef.current.forEach((column) => {
      cells.push(columnText(row, column).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
    });
    return cells.join('\t');
  }, []);

  const applyTsvLine = useCallback((line: string): { date: string; patch: DispatcherOrderPatch } => {
    const cells = line.split('\t');
    const parsedDate = parseClipboardDate(cells[0] ?? '', rangeRef.current.from.slice(0, 7));
    const patch: DispatcherOrderPatch = {};
    visibleColumnsRef.current.forEach((column, index) => {
      const raw = cells[index + 1];
      if (raw == null) return;
      if (column.kind === 'computed') return;
      if (column.kind === 'checkbox') {
        patch[column.field] = TRUE_WORDS.has(raw.trim().toLowerCase());
      } else if (column.kind === 'status') {
        const trimmed = raw.trim();
        const exact = statusesRef.current.find((status) => status.name.toLowerCase() === trimmed.toLowerCase());
        patch.status = exact?.name ?? (trimmed || null);
      } else if (column.field === 'driverName') {
        patch.driverName = shortPersonName(raw) || null;
      } else {
        patch[column.field] = raw.trim() || null;
      }
    });
    return { date: parsedDate ?? todayYmd(), patch };
  }, []);

  const copyRowToClipboard = useCallback(async (row: DispatcherOrderRow) => {
    try {
      await navigator.clipboard.writeText(rowToTsv(row));
      setMessage({ severity: 'success', text: 'Строка скопирована в буфер' });
    } catch {
      setMessage({ severity: 'error', text: 'Браузер не дал доступ к буферу — выделите строку и нажмите Ctrl+C' });
    }
  }, [rowToTsv]);

  // Копирование/вставка через нативные события copy/cut/paste — работают
  // без запроса разрешения на буфер (readText в ряде браузеров блокируется).
  useEffect(() => {
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedRowId(null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'я') return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        undoLast();
      }
    };
    const inField = (target: EventTarget | null): boolean =>
      Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]'));

    const copyHandler = (event: ClipboardEvent) => {
      if (inField(event.target)) return;
      const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current);
      if (!selected || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', rowToTsv(selected));
      setMessage({ severity: 'success', text: 'Строка скопирована в буфер' });
    };

    const cutHandler = (event: ClipboardEvent) => {
      if (inField(event.target)) return;
      const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current);
      if (!selected || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', rowToTsv(selected));
      void deleteRow(selected, { silent: true });
      setMessage({ severity: 'success', text: 'Строка вырезана в буфер' });
    };

    const pasteHandler = (event: ClipboardEvent) => {
      if (inField(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (!lines.length) return;
      event.preventDefault();
      void (async () => {
        const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current);
        let rest = lines;
        if (selected) {
          const { date, patch } = applyTsvLine(lines[0]);
          patchRow(selected.id, { ...patch, orderDate: date });
          rest = lines.slice(1);
        }
        for (const line of rest) {
          const { date, patch } = applyTsvLine(line);
          // последовательное создание сохраняет порядок строк из буфера
          // eslint-disable-next-line no-await-in-loop
          await createRow(date, patch);
        }
        setMessage({ severity: 'success', text: `Вставлено строк: ${lines.length}` });
      })();
    };

    window.addEventListener('keydown', escHandler);
    document.addEventListener('copy', copyHandler);
    document.addEventListener('cut', cutHandler);
    document.addEventListener('paste', pasteHandler);
    return () => {
      window.removeEventListener('keydown', escHandler);
      document.removeEventListener('copy', copyHandler);
      document.removeEventListener('cut', cutHandler);
      document.removeEventListener('paste', pasteHandler);
    };
  }, [applyTsvLine, createRow, deleteRow, patchRow, rowToTsv, undoLast]);

  const listOptions = (source: ListSource): string[] => {
    if (source === 'drivers') return driverOptions;
    if (source === 'vehicles') return vehicleOptions;
    return dictionaryOptions[source] ?? [];
  };

  const renderColumnCell = (row: DispatcherOrderRow, column: ColumnDef) => {
    const key = column.field;
    const pin = pinStyle(key);
    const pinCls = pinClass(key);
    if (column.kind === 'status') {
      return (
        <td key={key} className={`dj-status-cell${pinCls}`} style={pin}>
          <StatusCell
            value={row.status}
            statuses={statuses}
            statusByName={statusByName}
            onSave={(value) => patchRow(row.id, { status: value })}
          />
        </td>
      );
    }
    if (column.kind === 'checkbox') {
      return (
        <td key={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <Checkbox
            size="small"
            sx={{ p: 0.25 }}
            checked={row[column.field]}
            onChange={(event) => patchRow(row.id, { [column.field]: event.target.checked })}
          />
        </td>
      );
    }
    if (column.kind === 'computed') {
      const amount = amountWithoutVat(row.clientRate, row.passes, row.vat);
      return (
        <td key={key} className={`dj-computed-cell${pinCls}`} style={pin} title="(Ставка + Пропуска) без НДС">
          {formatMoney(amount)}
        </td>
      );
    }
    if (column.kind === 'time') {
      return (
        <td key={key} className={pinCls.trim()} style={pin}>
          <TimeCell value={row.submitTime} onSave={(value) => patchRow(row.id, { submitTime: value || null })} />
        </td>
      );
    }
    if (column.list) {
      const isCrewField = column.field === 'driverName' || column.field === 'vehiclePlate';
      return (
        <td key={key} className={pinCls.trim()} style={pin}>
          <ListCell
            value={column.field === 'driverName' ? shortPersonName(row.driverName) : row[column.field]}
            options={listOptions(column.list)}
            normalize={column.field === 'driverName' ? shortPersonName : undefined}
            onSave={(value) => {
              if (isCrewField) void saveCrewField(row, column.field as 'driverName' | 'vehiclePlate', value);
              else patchRow(row.id, { [column.field]: value || null });
            }}
          />
        </td>
      );
    }
    return (
      <td key={key} className={pinCls.trim()} style={pin}>
        <EditableCell
          value={row[column.field]}
          multiline={column.multiline}
          onSave={(value) => patchRow(row.id, { [column.field]: value || null })}
        />
      </td>
    );
  };

  // «призрачная» строка: начал заполнять — заявка создаётся сама
  const renderGhostCell = (column: ColumnDef) => {
    const key = column.field;
    const pin = pinStyle(key);
    const pinCls = pinClass(key);
    if (column.kind === 'status') {
      return (
        <td key={key} className={`dj-status-cell${pinCls}`} style={pin}>
          <StatusCell
            value={null}
            statuses={statuses}
            statusByName={statusByName}
            onSave={(value) => { if (value) void createRow(defaultNewDate, { status: value }); }}
          />
        </td>
      );
    }
    if (column.kind === 'checkbox') {
      return (
        <td key={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <Checkbox
            size="small"
            sx={{ p: 0.25 }}
            checked={false}
            onChange={(event) => { if (event.target.checked) void createRow(defaultNewDate, { [column.field]: true }); }}
          />
        </td>
      );
    }
    if (column.kind === 'computed') {
      return <td key={key} className={`dj-computed-cell${pinCls}`} style={pin} />;
    }
    if (column.kind === 'time') {
      return (
        <td key={key} className={pinCls.trim()} style={pin}>
          <TimeCell value="" onSave={(value) => { if (value) void createRow(defaultNewDate, { submitTime: value }); }} />
        </td>
      );
    }
    if (column.list) {
      const isCrewField = column.field === 'driverName' || column.field === 'vehiclePlate';
      return (
        <td key={key} className={pinCls.trim()} style={pin}>
          <ListCell
            value=""
            options={listOptions(column.list)}
            normalize={column.field === 'driverName' ? shortPersonName : undefined}
            onSave={(value) => {
              if (!value) return;
              if (isCrewField) {
                void withCrew(defaultNewDate, null, column.field as 'driverName' | 'vehiclePlate', value)
                  .then((patch) => createRow(defaultNewDate, patch));
              } else {
                void createRow(defaultNewDate, { [column.field]: value });
              }
            }}
          />
        </td>
      );
    }
    return (
      <td key={key} className={pinCls.trim()} style={pin}>
        <EditableCell
          value=""
          multiline={column.multiline}
          onSave={(value) => { if (value) void createRow(defaultNewDate, { [column.field]: value }); }}
        />
      </td>
    );
  };

  const headerCell = (key: string, title: string, width: number, resizable: boolean) => {
    const filtered = (filters[key]?.length ?? 0) > 0;
    return (
      <th
        key={key}
        className={`${pinClass(key).trim()}${filtered ? ' dj-th--filtered' : ''}`}
        style={{ width, ...pinStyle(key) }}
      >
        <div className="dj-th">
          <button type="button" className="dj-sort-btn" onClick={() => setSort((prev) => cycleSort(prev, key))}>
            <span>{title}</span>
            <span className={`dj-sort-ind is-${sortIndicator(sort, key)}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`dj-filter-btn${filtered ? ' is-active' : ''}`}
            title={filtered ? 'Фильтр включён' : 'Сортировка, фильтр, закрепление'}
            onClick={(event) => setFilterMenu({ field: key, anchor: event.currentTarget })}
          >
            <FilterList sx={{ fontSize: 13 }} />
          </button>
        </div>
        {resizable && (
          <span
            className="dj-resize"
            title="Потяните, чтобы изменить ширину; двойной клик — ширина по умолчанию"
            onMouseDown={(event) => startResize(event, key)}
            onDoubleClick={() => setCustomWidths((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            })}
          />
        )}
      </th>
    );
  };

  const filterMenuTitle = filterMenu
    ? (filterMenu.field === DATE_KEY ? 'Дата' : COLUMN_BY_KEY.get(filterMenu.field)?.title ?? '')
    : '';

  let previousDate: string | null = null;

  return (
    <Box className="dj-page">
      <Paper sx={{ p: 1.5 }}>
        <Box className="dj-toolbar">
          <TextField
            label="Год"
            type="number"
            size="small"
            value={Number(viewMonth.slice(0, 4))}
            onChange={(event) => {
              const year = Number(event.target.value);
              if (!Number.isInteger(year) || year < 2020 || year > 2100) return;
              setViewMonth(`${year}-${viewMonth.slice(5, 7)}`);
            }}
            sx={{ width: 100 }}
          />
          <TextField
            label="Месяц"
            select
            size="small"
            value={Number(viewMonth.slice(5, 7))}
            onChange={(event) => {
              const monthNo = Number(event.target.value);
              setViewMonth(`${viewMonth.slice(0, 4)}-${pad2(monthNo)}`);
            }}
            sx={{ width: 140 }}
          >
            {MONTH_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          {activeFilterCount > 0 && (
            <button type="button" className="dj-filter-chip" onClick={() => setFilters({})}>
              <FilterList sx={{ fontSize: 14 }} />
              Фильтры: {activeFilterCount} · показано {displayRows.length} из {rows.length} · сбросить
            </button>
          )}
          {pinnedUntil && (
            <button type="button" className="dj-filter-chip dj-filter-chip--pin" onClick={() => setPinnedUntil(null)}>
              <PushPin sx={{ fontSize: 14 }} />
              Закреплены столбцы · открепить
            </button>
          )}
          <span className="dj-toolbar__spacer" />
          {loading && <span className="dj-toolbar__hint">Загрузка…</span>}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<Settings sx={{ fontSize: 18 }} />}
            endIcon={<KeyboardArrowDown sx={{ fontSize: 18 }} />}
            onClick={(event) => setSettingsAnchor(event.currentTarget)}
            sx={{ textTransform: 'none', color: '#3d4757', borderColor: '#d8dde5', fontSize: 13 }}
          >
            Настройки
          </Button>
        </Box>
      </Paper>

      <div className="dj-table-wrap" ref={wrapRef}>
        <table className="dj-table" style={{ width: tableWidth }}>
          <colgroup>
            <col style={{ width: ROWNUM_WIDTH }} />
            <col style={{ width: DATE_WIDTH }} />
            {visibleColumns.map((column) => <col key={column.field} style={{ width: columnWidths[column.field] }} />)}
            <col style={{ width: DELETE_WIDTH }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`dj-rownum-head${pinClass('__rownum')}`} style={pinStyle('__rownum')} aria-label="Номер строки">№</th>
              {headerCell(DATE_KEY, 'Дата', DATE_WIDTH, false)}
              {visibleColumns.map((column) => headerCell(column.field, column.title, columnWidths[column.field], true))}
              <th aria-label="Удаление" />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const dayStart = !sort && row.orderDate !== previousDate;
              previousDate = row.orderDate;
              const classes = [
                dayStart ? 'dj-row--day-start' : '',
                isCompletedStatus(row.status) ? 'dj-row--done' : '',
                selectedRowId === row.id ? 'dj-row--selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <tr
                  key={row.id}
                  className={classes || undefined}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedRowId(row.id);
                    setContextMenu({ x: event.clientX, y: event.clientY, row });
                  }}
                >
                  <td
                    className={`dj-rownum${pinClass('__rownum')}`}
                    style={pinStyle('__rownum')}
                    title="Клик — выделить строку (Ctrl+C — копировать, Ctrl+X — вырезать, Ctrl+V — вставить)"
                    onClick={() => setSelectedRowId((prev) => (prev === row.id ? null : row.id))}
                  >
                    {index + 1}
                  </td>
                  <td className={`dj-date-cell${pinClass(DATE_KEY)}`} style={pinStyle(DATE_KEY)}>
                    <input
                      type="date"
                      className="dj-date-input"
                      value={row.orderDate}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (!next) return;
                        patchRow(row.id, { orderDate: next });
                        if (next < rangeRef.current.from || next > rangeRef.current.to) {
                          setMessage({ severity: 'success', text: `Заявка перенесена на ${formatDateShort(next)}` });
                        }
                      }}
                    />
                  </td>
                  {visibleColumns.map((column) => renderColumnCell(row, column))}
                  <td className="dj-checkbox-cell">
                    <button
                      type="button"
                      className="dj-delete-btn"
                      title="Удалить строку"
                      onClick={() => void deleteRow(row)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr key={`ghost-${ghostKey}`} className="dj-row--ghost dj-row--day-start">
              <td className={`dj-rownum${pinClass('__rownum')}`} style={pinStyle('__rownum')}>＋</td>
              <td className={`dj-date-cell${pinClass(DATE_KEY)}`} style={pinStyle(DATE_KEY)}>
                <input
                  type="date"
                  className="dj-date-input"
                  value={defaultNewDate}
                  title="Выберите дату — заявка создастся сразу"
                  onChange={(event) => {
                    if (event.target.value) void createRow(event.target.value);
                  }}
                />
              </td>
              {visibleColumns.map((column) => renderGhostCell(column))}
              <td />
            </tr>
          </tbody>
        </table>
        {!rows.length && !loading && (
          <div className="dj-empty">В этом месяце заявок нет — начните заполнять нижнюю строку, она создастся сама</div>
        )}
        {rows.length > 0 && !displayRows.length && (
          <div className="dj-empty">Все заявки скрыты фильтрами — сбросьте фильтры в панели сверху</div>
        )}
      </div>

      {/* меню строки по правому клику */}
      {contextMenu && (
        <div
          className="dj-context-overlay"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="dj-context-menu"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 140),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setOrderText({
                  title: `Заказ${current.ktkNumber ? ` — ${current.ktkNumber}` : ''}`,
                  text: buildOrderText(current),
                });
                setContextMenu(null);
              }}
            >
              Заказ
            </button>
            <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                void copyRowToClipboard(current);
                setContextMenu(null);
              }}
            >
              Копировать строку
            </button>
            <button
              type="button"
              className="dj-context-item danger"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void deleteRow(current);
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      {/* «Заказ»: текст для мессенджера, можно поправить перед копированием */}
      <Dialog open={Boolean(orderText)} onClose={() => setOrderText(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>{orderText?.title}</DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <TextField
            multiline
            fullWidth
            minRows={14}
            value={orderText?.text ?? ''}
            onChange={(event) => setOrderText((prev) => (prev ? { ...prev, text: event.target.value } : prev))}
            sx={{ '& textarea': { fontSize: 13, lineHeight: 1.45 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderText(null)}>Закрыть</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!orderText) return;
              navigator.clipboard.writeText(orderText.text)
                .then(() => setMessage({ severity: 'success', text: 'Заказ скопирован — вставьте в мессенджер' }))
                .catch(() => setMessage({ severity: 'error', text: 'Не удалось скопировать — выделите текст и нажмите Ctrl+C' }));
            }}
          >
            Скопировать
          </Button>
        </DialogActions>
      </Dialog>

      {filterMenu && (
        <ColumnFilterPopover
          anchorEl={filterMenu.anchor}
          title={filterMenuTitle}
          values={rows.map((row) => filterText(row, filterMenu.field))}
          hidden={filters[filterMenu.field] ?? []}
          isPinnedUntilHere={pinnedUntil === filterMenu.field}
          onSort={(direction) => setSort({ field: filterMenu.field, direction })}
          onApply={(hidden) => setFilters((prev) => {
            const next = { ...prev };
            if (hidden.length) next[filterMenu.field] = hidden;
            else delete next[filterMenu.field];
            return next;
          })}
          onTogglePin={() => setPinnedUntil((prev) => (prev === filterMenu.field ? null : filterMenu.field))}
          onClose={() => setFilterMenu(null)}
        />
      )}

      {/* одна кнопка «Настройки»: колонки таблицы (у каждого свои) и общие справочники реестра */}
      <Menu
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setColumnsAnchor(settingsAnchor);
            setSettingsAnchor(null);
          }}
        >
          <ListItemIcon><ViewColumn fontSize="small" /></ListItemIcon>
          <ListItemText primary="Колонки" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDictionariesOpen(true);
            setSettingsAnchor(null);
          }}
        >
          <ListItemIcon><MenuBook fontSize="small" /></ListItemIcon>
          <ListItemText primary="Справочники" />
        </MenuItem>
      </Menu>

      <DispatcherDictionariesDialog
        open={dictionariesOpen}
        canEdit={canEditDictionaries}
        onClose={() => setDictionariesOpen(false)}
        onChanged={loadDictionaries}
      />

      {/* настройка колонок: видимость чекбоксами, порядок перетаскиванием (как в справочниках) */}
      <Popover
        open={Boolean(columnsAnchor)}
        anchorEl={columnsAnchor}
        onClose={() => setColumnsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 300, maxHeight: 480, overflowY: 'auto' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 15 }}>Колонки</Typography>
          <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 1 }}>
            Отметьте нужные и перетащите для порядка. Ширина — перетаскиванием края заголовка.
          </Typography>
          {orderedKeys(ALL_COLUMN_KEYS, columnPrefs).map((key, index) => {
            const column = COLUMN_BY_KEY.get(key);
            if (!column) return null;
            return (
              <Box
                key={key}
                draggable
                onDragStart={() => { dragColumnKey.current = key; }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged = dragColumnKey.current;
                  dragColumnKey.current = null;
                  if (!dragged || dragged === key) return;
                  setColumnPrefs((prev) => moveColumnTo(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, prev, dragged, index));
                }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  border: '1px solid #e5e7eb', borderRadius: '8px',
                  px: 0.75, py: 0.25, mb: 0.5, cursor: 'grab', bgcolor: '#fafafa',
                }}
              >
                <DragIndicator sx={{ fontSize: 16, color: '#9ca3af' }} />
                <Checkbox
                  size="small"
                  sx={{ p: 0.5 }}
                  checked={!isHidden(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, columnPrefs, key)}
                  onChange={() => setColumnPrefs((prev) => toggleHidden(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, prev, key))}
                />
                <Typography sx={{ fontSize: 13, flex: 1 }}>{column.title}</Typography>
                <IconButton
                  size="small" sx={{ p: 0.25 }}
                  disabled={index === 0}
                  onClick={() => setColumnPrefs((prev) => moveColumnTo(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, prev, key, index - 1))}
                >
                  <KeyboardArrowUp sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton
                  size="small" sx={{ p: 0.25 }}
                  disabled={index === ALL_COLUMN_KEYS.length - 1}
                  onClick={() => setColumnPrefs((prev) => moveColumnTo(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, prev, key, index + 1))}
                >
                  <KeyboardArrowDown sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            );
          })}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            <Button size="small" onClick={() => setColumnPrefs(undefined)}>
              Сбросить порядок
            </Button>
            <Button size="small" disabled={!Object.keys(customWidths).length} onClick={() => setCustomWidths({})}>
              Сбросить ширину
            </Button>
            <Button size="small" onClick={() => setColumnsAnchor(null)}>Готово</Button>
          </Box>
        </Box>
      </Popover>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={4000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={message?.severity ?? 'success'} onClose={() => setMessage(null)}>
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
