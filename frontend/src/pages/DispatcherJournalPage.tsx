import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  ListItemIcon,
  ListItemText,
  Menu,
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
  History,
  KeyboardArrowDown,
  KeyboardArrowUp,
  MenuBook,
  PushPin,
  Settings,
  UploadFile,
  ViewColumn,
} from '@mui/icons-material';
import {
  createDispatcherOrder,
  createDispatcherOrdersBatch,
  deleteDispatcherOrder,
  getDispatcherCrew,
  getDispatcherDictionaryOptions,
  getDispatcherOrders,
  getDispatcherStatuses,
  updateDispatcherOrder,
  type DispatcherCrewEntry,
  type DispatcherDictionaryColors,
  type DispatcherDictionaryOptions,
  type DispatcherOrderPatch,
  type DispatcherOrderRow,
  type DispatcherStatusOption,
} from '../services/dispatcher-journal.api';
import { findEmployeeCardByName, getDirectoryOptions } from '../services/directories.api';
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
import DispatcherImportDialog from '../components/dispatcher/DispatcherImportDialog';
import DispatcherHistoryDialog from '../components/dispatcher/DispatcherHistoryDialog';
import {
  amountWithoutVat,
  buildOrderText,
  formatMoney,
  isCompletedStatus,
  personKey,
  plateKey,
  shortPersonName,
  textColorFor,
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
  { kind: 'text', field: 'terminalFrom', title: 'Терминал постановки', width: 150, list: 'terminal_from' },
  { kind: 'text', field: 'slotFrom', title: 'Слот', width: 60 },
  { kind: 'text', field: 'pinFrom', title: 'Пин', width: 58 },
  { kind: 'time', field: 'submitTime', title: 'Время подачи', width: 74 },
  { kind: 'text', field: 'deliveryAddress', title: 'Адрес доставки', width: 170, multiline: true },
  { kind: 'text', field: 'terminalTo', title: 'Терминал снятия', width: 150, list: 'terminal_to' },
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
/** Виртуализация строк: стартовая высота строки (уточняется замером) и запас строк за краем окна. */
const DEFAULT_ROW_HEIGHT = 37;
/** Высота жёлтой полосы дня (уточняется замером) и запас отрисовки за краем окна, px. */
const DEFAULT_BAND_HEIGHT = 28;
const OVERSCAN_PX = 720;
/** Масштаб таблицы: варианты в списке и допустимые границы ручного ввода. */
const ZOOM_OPTIONS = ['50%', '60%', '70%', '80%', '90%', '100%', '110%', '125%'];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const pluralOrders = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заявка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'заявки';
  return 'заявок';
};

/** Элемент виртуального списка: полоса дня или строка заявки. */
type DisplayItem =
  | { kind: 'band'; date: string; key: string }
  | { kind: 'row'; row: DispatcherOrderRow; index: number };

/** Индекс последнего элемента, начало которого ≤ px (offsets — префиксные суммы высот). */
const itemAtOffset = (offsets: number[], px: number): number => {
  let low = 0;
  let high = offsets.length - 2;
  if (high < 0) return 0;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= px) low = mid;
    else high = mid - 1;
  }
  return Math.max(0, low);
};
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

const EMPTY_DICTIONARY_OPTIONS: DispatcherDictionaryOptions = {
  ktk_type: [], vat: [], operation: [], terminal_from: [], terminal_to: [],
};
const EMPTY_DICTIONARY_COLORS: DispatcherDictionaryColors = {
  ktk_type: {}, vat: {}, operation: {}, terminal_from: {}, terminal_to: {},
};

/** Кто ведёт справочники реестра (проверка дублируется на сервере). */
const DICTIONARY_EDIT_ROLES = new Set(['admin', 'head_ktk_vvo']);
/** История изменений реестра видна администратору и руководителю КТК (проверка и на сервере). */
const HISTORY_ROLES = new Set(['admin', 'head_ktk_vvo']);

/** Названия полей реестра для окна истории. */
const FIELD_TITLES: Record<string, string> = {
  orderDate: 'Дата',
  ...Object.fromEntries(ALL_COLUMNS.map((column) => [column.field, column.title])),
};

const formatEditedAt = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

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
  const canViewHistory = HISTORY_ROLES.has(user?.role ?? '');
  const [viewMonth, setViewMonth] = useState<string>(currentMonth());
  const [rows, setRows] = useState<DispatcherOrderRow[]>([]);
  const [statuses, setStatuses] = useState<DispatcherStatusOption[]>([]);
  const [dictionaryOptions, setDictionaryOptions] = useState<DispatcherDictionaryOptions>(EMPTY_DICTIONARY_OPTIONS);
  const [dictionaryColors, setDictionaryColors] = useState<DispatcherDictionaryColors>(EMPTY_DICTIONARY_COLORS);
  const [driverOptions, setDriverOptions] = useState<string[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [ghostKey, setGhostKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: DispatcherOrderRow } | null>(null);
  const [dictionariesOpen, setDictionariesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // история: весь реестр (orderId = null) или одна строка
  const [history, setHistory] = useState<{ orderId: string | null; label?: string } | null>(null);
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
  // фильтр, применённый пользователем, действует на ВСЕ строки: исключение для
  // только что созданных живёт лишь до следующего изменения фильтров
  // (иначе строка, добавленная раньше, «торчала» среди отфильтрованных — 14.09)
  const applyFilters = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    sessionCreatedIdsRef.current = new Set();
    setFilters(updater);
  }, []);

  // масштаб таблицы (как в операционном отчёте) — у каждого сотрудника свой
  const zoomStorageKey = `dj-zoom-v1:${userKey}`;
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(zoomStorageKey));
      return Number.isFinite(stored) && stored >= MIN_ZOOM && stored <= MAX_ZOOM ? stored : 1;
    } catch {
      return 1;
    }
  });
  const [zoomInput, setZoomInput] = useState(`${Math.round(zoom * 100)}%`);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    setZoomInput(`${Math.round(zoom * 100)}%`);
    try {
      localStorage.setItem(zoomStorageKey, String(zoom));
    } catch {
      // приватный режим — масштаб живёт до перезагрузки
    }
  }, [zoom, zoomStorageKey]);
  const applyZoomFromInput = (raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return;
    const numeric = Number(normalized.replace('%', ''));
    if (!Number.isFinite(numeric)) {
      setZoomInput(`${Math.round(zoom * 100)}%`);
      return;
    }
    const scale = normalized.includes('%') || numeric > 2 ? numeric / 100 : numeric;
    if (scale < MIN_ZOOM || scale > MAX_ZOOM) {
      setZoomInput(`${Math.round(zoom * 100)}%`);
      return;
    }
    setZoom(Math.round(scale * 100) / 100);
    setZoomInput(`${Math.round(scale * 100)}%`);
  };

  // ширина области таблицы: колонки без ручной ширины растягиваются на большом экране
  const wrapRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  // окно прокрутки для виртуализации строк (месяц — это 1–1,5 тыс. заявок)
  const [scrollWindow, setScrollWindow] = useState({ top: 0, height: 900 });
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const [bandHeight, setBandHeight] = useState(DEFAULT_BAND_HEIGHT);
  const [headerHeight, setHeaderHeight] = useState(40);
  // день, чья полоса «прилипла» под шапкой при прокрутке
  const [stickyDate, setStickyDate] = useState<string | null>(null);
  const layoutRef = useRef<{ items: DisplayItem[]; offsets: number[]; itemByRowIndex: Map<number, number> }>({
    items: [],
    offsets: [0],
    itemByRowIndex: new Map(),
  });
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => setWrapWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleWrapScroll = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { items, offsets, itemByRowIndex } = layoutRef.current;
    // окно пересчитывается шагами по 5 строк: при прокрутке страница перерисовывается
    // не на каждый пиксель, а запаса отрисовки хватает, чтобы края не мелькали
    // (requestAnimationFrame не используем — во фоновых вкладках он засыпает)
    // все расчёты окна — в «несжатых» px таблицы: при масштабе 50% прокрутка на 100 px = 200 px таблицы
    const scale = zoomRef.current;
    const scrollTop = wrap.scrollTop / scale;
    const step = rowHeight * 5;
    const next = { top: Math.floor(scrollTop / step) * step, height: wrap.clientHeight / scale };
    // строка с незаконченной правкой уходит из окна — сначала сохраняем её (blur),
    // иначе при размонтировании черновик потерялся бы
    const active = document.activeElement as HTMLElement | null;
    const activeRow = active?.closest?.('tr[data-row-index]') as HTMLElement | null;
    if (activeRow && wrap.contains(activeRow)) {
      const itemIndex = itemByRowIndex.get(Number(activeRow.dataset.rowIndex)) ?? 0;
      const from = itemAtOffset(offsets, next.top - headerHeight - OVERSCAN_PX);
      const to = itemAtOffset(offsets, next.top - headerHeight + next.height + OVERSCAN_PX) + 1;
      if (itemIndex < from || itemIndex >= to) active?.blur();
    }
    setScrollWindow((prev) => (prev.top === next.top && prev.height === next.height ? prev : next));
    // прилипшая полоса: день первой строки под шапкой, если его собственная полоса уже ушла вверх
    const topItemIndex = itemAtOffset(offsets, scrollTop);
    const topItem = items[topItemIndex];
    let date: string | null = null;
    if (topItem && scrollTop > 1) {
      const bandAtTop = topItem.kind === 'band' && scrollTop - offsets[topItemIndex] < 2;
      if (!bandAtTop) date = topItem.kind === 'band' ? topItem.date : topItem.row.orderDate;
    }
    setStickyDate((prev) => (prev === date ? prev : date));
  }, [headerHeight, rowHeight]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const update = () => setScrollWindow({ top: wrap.scrollTop / zoomRef.current, height: wrap.clientHeight / zoomRef.current });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // фактическая высота строки и шапки (зависят от набора колонок) — для расчёта окна
  useLayoutEffect(() => {
    const firstRow = tbodyRef.current?.querySelector('tr[data-row-index]') as HTMLElement | null;
    if (firstRow) {
      const height = firstRow.getBoundingClientRect().height / zoom;
      if (height > 10 && Math.abs(height - rowHeight) > 0.5) setRowHeight(height);
    }
    const firstBand = tbodyRef.current?.querySelector('tr.dj-band') as HTMLElement | null;
    if (firstBand) {
      const height = firstBand.getBoundingClientRect().height / zoom;
      if (height > 10 && Math.abs(height - bandHeight) > 0.5) setBandHeight(height);
    }
    const head = wrapRef.current?.querySelector('thead') as HTMLElement | null;
    if (head) {
      const height = head.getBoundingClientRect().height / zoom;
      if (Math.abs(height - headerHeight) > 0.5) setHeaderHeight(height);
    }
  });

  const columnWidths = useMemo(() => {
    const customSum = visibleColumns.reduce((sum, column) => sum + (customWidths[column.field] ?? 0), 0);
    const defaultSum = visibleColumns.reduce((sum, column) => sum + (customWidths[column.field] ? 0 : column.width), 0);
    const free = wrapWidth / zoom - ROWNUM_WIDTH - DATE_WIDTH - DELETE_WIDTH - customSum - 2;
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
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX) / zoomRef.current));
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
  const [sort, setSort] = useState<TableSortState>(() => {
    // loadSortState склеивает объект с fallback: сохранённый null читается как {} —
    // такую «пустую» сортировку считаем выключенной (иначе гаснут перетаскивание и разделители дней)
    const saved = loadSortState<TableSortState>(sortStorageKey, null);
    return saved?.field && saved.direction ? saved : null;
  });
  // ручной порядок меняется только на «чистой» таблице: при сортировке или фильтре позиция неоднозначна
  const canDragRows = !sort && activeFilterCount === 0;
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

  // итоги дня для жёлтых полос: сколько заявок и сколько выполнено (по видимым строкам)
  const dayStats = useMemo(() => {
    const stats = new Map<string, { count: number; done: number }>();
    displayRows.forEach((row) => {
      const entry = stats.get(row.orderDate) ?? { count: 0, done: 0 };
      entry.count += 1;
      if (isCompletedStatus(row.status)) entry.done += 1;
      stats.set(row.orderDate, entry);
    });
    return stats;
  }, [displayRows]);

  // полоса дня перед каждой сменой даты. При сортировке по дате (↑/↓) дни идут подряд —
  // полосы остаются; при сортировке по другой колонке дни перемешаны — полос нет
  const showDayBands = !sort || sort.field === DATE_KEY;
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    displayRows.forEach((row, index) => {
      if (showDayBands && (index === 0 || row.orderDate !== displayRows[index - 1].orderDate)) {
        items.push({ kind: 'band', date: row.orderDate, key: `band-${index}-${row.orderDate}` });
      }
      items.push({ kind: 'row', row, index });
    });
    return items;
  }, [displayRows, showDayBands]);

  const itemOffsets = useMemo(() => {
    const offsets = new Array<number>(displayItems.length + 1);
    offsets[0] = 0;
    displayItems.forEach((item, index) => {
      offsets[index + 1] = offsets[index] + (item.kind === 'band' ? bandHeight : rowHeight);
    });
    return offsets;
  }, [bandHeight, displayItems, rowHeight]);

  const itemByRowIndex = useMemo(() => {
    const map = new Map<number, number>();
    displayItems.forEach((item, itemIndex) => {
      if (item.kind === 'row') map.set(item.index, itemIndex);
    });
    return map;
  }, [displayItems]);
  layoutRef.current = { items: displayItems, offsets: itemOffsets, itemByRowIndex };

  // список или масштаб поменялись — пересчитать окно и прилипшую полосу
  useEffect(() => {
    handleWrapScroll();
  }, [displayItems, handleWrapScroll, zoom]);

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
      .then((response) => {
        setDictionaryOptions({ ...EMPTY_DICTIONARY_OPTIONS, ...response.data.lists });
        setDictionaryColors({ ...EMPTY_DICTIONARY_COLORS, ...response.data.colors });
      })
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

  /** Порядок строк — ручной (перетаскивание), дата на него не влияет. */
  const sortByDate = (list: DispatcherOrderRow[]): DispatcherOrderRow[] =>
    [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

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

  /** «+»: одна пустая строка (без статуса) на дату нижней строки. */
  const addBlankRow = useCallback(async (orderDate: string) => {
    try {
      const { data } = await createDispatcherOrdersBatch(orderDate, 1);
      data.forEach((row) => {
        sessionCreatedIdsRef.current.add(row.id);
        pushUndo({ kind: 'create', id: row.id });
      });
      if (orderDate >= rangeRef.current.from && orderDate <= rangeRef.current.to) {
        setRows((prev) => sortByDate([...prev, ...data]));
      } else {
        setMessage({ severity: 'success', text: `Строка добавлена на ${formatDateShort(orderDate)} — она в другом месяце` });
      }
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось добавить строку' });
    }
  }, []);

  // ── перетаскивание строки за номер: куда угодно, дата не меняется (как в google-таблице) ──
  const dragRowRef = useRef<{ id: string; date: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);

  const moveRow = useCallback((draggedId: string, targetId: string, after: boolean) => {
    if (draggedId === targetId) return;
    const ordered = sortByDate(rowsRef.current);
    const dragged = ordered.find((row) => row.id === draggedId);
    const target = ordered.find((row) => row.id === targetId);
    if (!dragged || !target) return;
    const rest = ordered.filter((row) => row.id !== draggedId);
    const insertAt = rest.findIndex((row) => row.id === targetId) + (after ? 1 : 0);
    const prev = rest[insertAt - 1];
    const next = rest[insertAt];
    let position: number;
    if (prev && next) position = (prev.position + next.position) / 2;
    else if (prev) position = prev.position + 1000;
    else if (next) position = next.position - 1000;
    else position = Date.now();
    patchRow(draggedId, { position });
  }, [patchRow]);

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

  /** «Скопировать данные» — карточка водителя из справочника, как в графике контейнеровозов. */
  const copyDriverData = useCallback(async (row: DispatcherOrderRow) => {
    const name = row.driverName?.trim();
    if (!name) {
      setMessage({ severity: 'error', text: 'В строке не указан водитель' });
      return;
    }
    try {
      // текст запрашивается до записи в буфер: writeText должен идти сразу за ответом
      const { data } = await findEmployeeCardByName('vvo', name);
      await navigator.clipboard.writeText(data.text);
      setMessage({ severity: 'success', text: `Данные водителя «${name}» скопированы в буфер обмена` });
    } catch (error) {
      const status = (error as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
      const serverText = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage({
        severity: 'error',
        text: status === 404
          ? `«${name}» не найден в справочнике сотрудников — заведите карточку в разделе «Справочники»`
          : status === 409 && serverText
            ? serverText
            : 'Не удалось скопировать данные водителя',
      });
    }
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

  /** Цвет значения из справочника реестра (водители и техника — без цвета). */
  const listColorOf = (
    source: ListSource,
  ): ((value: string) => { background?: string; color: string } | undefined) | undefined => {
    if (source === 'drivers' || source === 'vehicles') return undefined;
    const colors = dictionaryColors[source] ?? {};
    return (value: string) => {
      const entry = colors[value];
      if (!entry) return undefined;
      return {
        background: entry.color ?? undefined,
        color: entry.textColor ?? (entry.color ? textColorFor(entry.color) : '#1f2733'),
      };
    };
  };

  const statusNames = useMemo(() => statuses.map((status) => status.name), [statuses]);
  const statusColorOf = useCallback((name: string) => {
    const status = statusByName.get(name);
    return status ? { background: status.color, color: status.textColor ?? textColorFor(status.color) } : undefined;
  }, [statusByName]);

  const renderColumnCell = (row: DispatcherOrderRow, column: ColumnDef) => {
    const key = column.field;
    const pin = pinStyle(key);
    const pinCls = pinClass(key);
    if (column.kind === 'status') {
      return (
        <td key={key} className={`dj-status-cell${pinCls}`} style={pin}>
          <ListCell
            value={row.status}
            options={statusNames}
            colorOf={statusColorOf}
            placeholder="статус…"
            strict
            onSave={(value) => patchRow(row.id, { status: value || null })}
          />
        </td>
      );
    }
    if (column.kind === 'checkbox') {
      return (
        <td key={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <input
            type="checkbox"
            className="dj-check"
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
            colorOf={listColorOf(column.list)}
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
          <ListCell
            value=""
            options={statusNames}
            colorOf={statusColorOf}
            placeholder="статус…"
            strict
            onSave={(value) => { if (value) void createRow(defaultNewDate, { status: value }); }}
          />
        </td>
      );
    }
    if (column.kind === 'checkbox') {
      return (
        <td key={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <input
            type="checkbox"
            className="dj-check"
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
            colorOf={listColorOf(column.list)}
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

  // ── виртуализация: рисуются только элементы в окне прокрутки (+ запас) ──
  const windowStart = Math.min(
    itemAtOffset(itemOffsets, scrollWindow.top - headerHeight - OVERSCAN_PX),
    Math.max(0, displayItems.length - 1),
  );
  const windowEnd = Math.min(
    displayItems.length,
    itemAtOffset(itemOffsets, scrollWindow.top - headerHeight + scrollWindow.height + OVERSCAN_PX) + 1,
  );
  const windowItems = displayItems.slice(windowStart, Math.max(windowStart, windowEnd));
  const totalItemsHeight = itemOffsets[itemOffsets.length - 1] ?? 0;

  const todayDate = todayYmd();
  const renderBandLabel = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
    const stats = dayStats.get(date) ?? { count: 0, done: 0 };
    return (
      <>
        <b>{weekday}, {pad2(day)}.{pad2(month)}.{year}</b>
        <span className="dj-band__count">· {stats.count} {pluralOrders(stats.count)}</span>
        {date === todayDate && <span className="dj-band__today">сегодня</span>}
        <span className="dj-band__stat">выполнено {stats.done} из {stats.count}</span>
      </>
    );
  };

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
          <Autocomplete
            freeSolo
            disableClearable
            options={ZOOM_OPTIONS}
            inputValue={zoomInput}
            onInputChange={(_event, value) => setZoomInput(value)}
            onChange={(_event, value) => {
              if (typeof value === 'string') applyZoomFromInput(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Масштаб"
                size="small"
                placeholder="например 80%"
                onBlur={() => applyZoomFromInput(zoomInput)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyZoomFromInput(zoomInput);
                }}
              />
            )}
            sx={{ width: 140 }}
          />
          {activeFilterCount > 0 && (
            <button type="button" className="dj-filter-chip" onClick={() => applyFilters(() => ({}))}>
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
            className="dj-settings-btn"
            startIcon={<Settings sx={{ fontSize: 18, color: '#6b7280' }} />}
            endIcon={<KeyboardArrowDown sx={{ fontSize: 22, color: 'rgba(0, 0, 0, 0.54)' }} />}
            onClick={(event) => setSettingsAnchor(event.currentTarget)}
          >
            <span className="dj-settings-btn__label">Настройки</span>
          </Button>
        </Box>
      </Paper>

      <div className="dj-table-wrap" ref={wrapRef} onScroll={handleWrapScroll}>
        {stickyDate && showDayBands && (
          <div className="dj-sticky-band" style={{ top: headerHeight * zoom }} aria-hidden="true">
            <div className="dj-band__label dj-sticky-band__inner" style={{ width: wrapWidth / zoom, zoom }}>
              {renderBandLabel(stickyDate)}
            </div>
          </div>
        )}
        <table className="dj-table" style={{ width: tableWidth, zoom }}>
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
          <tbody ref={tbodyRef}>
            {windowStart > 0 && (
              <tr className="dj-spacer" aria-hidden="true"><td colSpan={visibleColumns.length + 3} style={{ height: itemOffsets[windowStart] }} /></tr>
            )}
            {windowItems.map((item) => {
              if (item.kind === 'band') {
                return (
                  <tr key={item.key} className="dj-band">
                    <td colSpan={visibleColumns.length + 3}>
                      <div className="dj-band__label">{renderBandLabel(item.date)}</div>
                    </td>
                  </tr>
                );
              }
              const { row, index } = item;
              const classes = [
                dropTarget?.id === row.id ? (dropTarget.after ? 'dj-row--drop-after' : 'dj-row--drop-before') : '',
                isCompletedStatus(row.status) ? 'dj-row--done' : '',
                selectedRowId === row.id ? 'dj-row--selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <tr
                  key={row.id}
                  data-row-index={index}
                  className={classes || undefined}
                  onFocus={() => {
                    // перешли работать в другую строку — выделение прежней снимается
                    if (selectedRowIdRef.current && selectedRowIdRef.current !== row.id) setSelectedRowId(null);
                  }}
                  onMouseDown={(event) => {
                    if (!selectedRowIdRef.current || selectedRowIdRef.current === row.id) return;
                    if ((event.target as HTMLElement).closest('.dj-rownum')) return;
                    setSelectedRowId(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedRowId(row.id);
                    setContextMenu({ x: event.clientX, y: event.clientY, row });
                  }}
                  onDragOver={(event) => {
                    if (!dragRowRef.current) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientY > rect.top + rect.height / 2;
                    setDropTarget((prev) => (prev?.id === row.id && prev.after === after ? prev : { id: row.id, after }));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = dragRowRef.current?.id;
                    const target = dropTarget;
                    dragRowRef.current = null;
                    setDropTarget(null);
                    if (draggedId && target) moveRow(draggedId, target.id, target.after);
                  }}
                >
                  <td
                    className={`dj-rownum${pinClass('__rownum')}`}
                    style={pinStyle('__rownum')}
                    title={[
                      canDragRows
                        ? 'Зажмите и тяните вверх/вниз — переместить строку. Клик — выделить строку'
                        : 'Клик — выделить строку. Чтобы перетаскивать строки, выключите сортировку и фильтры',
                      row.lastEditorName ? `Изменено: ${row.lastEditorName}, ${formatEditedAt(row.updatedAt)}` : '',
                    ].filter(Boolean).join('\n')}
                    draggable={canDragRows}
                    onDragStart={(event) => {
                      dragRowRef.current = { id: row.id, date: row.orderDate };
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', row.id);
                      const tr = event.currentTarget.parentElement;
                      if (tr) event.dataTransfer.setDragImage(tr, 16, 12);
                    }}
                    onDragEnd={() => {
                      dragRowRef.current = null;
                      setDropTarget(null);
                    }}
                    onClick={() => setSelectedRowId((prev) => (prev === row.id ? null : row.id))}
                  >
                    <span className="dj-rownum__num">{index + 1}</span>
                    {canDragRows && <DragIndicator className="dj-rownum__grip" sx={{ fontSize: 16 }} />}
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
            {windowEnd < displayItems.length && (
              <tr className="dj-spacer" aria-hidden="true">
                <td colSpan={visibleColumns.length + 3} style={{ height: totalItemsHeight - itemOffsets[windowEnd] }} />
              </tr>
            )}
            <tr key={`ghost-${ghostKey}`} className="dj-row--ghost dj-row--day-start">
              <td
                className={`dj-rownum dj-rownum--add${pinClass('__rownum')}`}
                style={pinStyle('__rownum')}
                title="Добавить пустую строку"
                onClick={() => void addBlankRow(defaultNewDate)}
              >
                ＋
              </td>
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
                setContextMenu(null);
                // сразу в буфер, как «Скопировать данные» — вставляется в мессенджер
                navigator.clipboard.writeText(buildOrderText(current))
                  .then(() => setMessage({ severity: 'success', text: `Заказ${current.ktkNumber ? ` ${current.ktkNumber}` : ''} скопирован в буфер обмена` }))
                  .catch(() => setMessage({ severity: 'error', text: 'Браузер не дал доступ к буферу обмена' }));
              }}
            >
              Заказ
            </button>
            <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void copyDriverData(current);
              }}
            >
              Скопировать данные
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
            {canViewHistory && (
              <button
                type="button"
                className="dj-context-item"
                onClick={() => {
                  const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                  setHistory({
                    orderId: current.id,
                    label: [formatDateShort(current.orderDate), current.ktkNumber, current.client].filter(Boolean).join(' · '),
                  });
                  setContextMenu(null);
                }}
              >
                История строки
              </button>
            )}
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

      {filterMenu && (
        <ColumnFilterPopover
          anchorEl={filterMenu.anchor}
          title={filterMenuTitle}
          values={rows.map((row) => filterText(row, filterMenu.field))}
          hidden={filters[filterMenu.field] ?? []}
          isPinnedUntilHere={pinnedUntil === filterMenu.field}
          onSort={(direction) => setSort({ field: filterMenu.field, direction })}
          onApply={(hidden) => applyFilters((prev) => {
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
        {canViewHistory && (
          <MenuItem
            onClick={() => {
              setHistory({ orderId: null });
              setSettingsAnchor(null);
            }}
          >
            <ListItemIcon><History fontSize="small" /></ListItemIcon>
            <ListItemText primary="История изменений" />
          </MenuItem>
        )}
        {user?.role === 'admin' && (
          <MenuItem
            onClick={() => {
              setImportOpen(true);
              setSettingsAnchor(null);
            }}
          >
            <ListItemIcon><UploadFile fontSize="small" /></ListItemIcon>
            <ListItemText primary="Импорт из Google-таблицы" />
          </MenuItem>
        )}
      </Menu>

      {history && (
        <DispatcherHistoryDialog
          open
          onClose={() => setHistory(null)}
          orderId={history.orderId}
          orderLabel={history.label}
          fieldTitles={FIELD_TITLES}
        />
      )}

      <DispatcherImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void loadRows(true);
          loadDictionaries();
        }}
      />

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
