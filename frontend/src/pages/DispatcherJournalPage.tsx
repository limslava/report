import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  FileDownload,
  FilterList,
  History,
  KeyboardArrowDown,
  KeyboardArrowUp,
  MenuBook,
  FilterListOff,
  SwapVert,
  Search,
  Settings,
  UploadFile,
  ViewColumn,
} from '@mui/icons-material';
import {
  createDispatcherOrder,
  createDispatcherOrdersBatch,
  deleteDispatcherOrder,
  getDispatcherCrew,
  getDispatcherOwnFleet,
  getDispatcherDictionaryOptions,
  getDispatcherOrders,
  getDispatcherStatuses,
  updateDispatcherOrder,
  downloadDispatcherJournalExcel,
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
import { useAccountPreference } from '../hooks/useAccountPreference';
import {
  DISPATCHER_FINANCE_COLUMNS,
  canEditDispatcherField,
  dispatcherJournalAccess,
} from '../utils/dispatcherJournalAccess';
import { sortRows } from '../utils/tableSort';
import { downloadBlob } from '../utils/download';
import {
  applyColumnPrefs,
  isHidden,
  moveColumnTo,
  orderedKeys,
  toggleHidden,
  type ColumnPrefs,
} from '../utils/tableColumns';
import ListCell from '../components/dispatcher/ListCell';
import ConfirmDialog, { type ConfirmRequest } from '../components/dispatcher/ConfirmDialog';
import type { ColumnAlign } from '../components/dispatcher/ColumnFilterPopover';
import EditableCell from '../components/dispatcher/EditableCell';
import {
  CELL_NAV_EVENT,
  isPrintableKey,
  navDirectionOf,
  requestCellNav,
  type CellNavDetail,
  type CellNavDirection,
} from '../components/dispatcher/cellKeys';
import TimeCell from '../components/dispatcher/TimeCell';
import ColumnFilterPopover, {
  EMPTY_FILTER_VALUE,
  type ColumnColorOption,
  type ColumnFilterValue,
} from '../components/dispatcher/ColumnFilterPopover';
import DispatcherDictionariesDialog from '../components/dispatcher/DispatcherDictionariesDialog';
import DispatcherImportDialog from '../components/dispatcher/DispatcherImportDialog';
import DispatcherHistoryDialog from '../components/dispatcher/DispatcherHistoryDialog';
import {
  addDaysYmd,
  amountWithoutVat,
  buildOrderText,
  cellKey,
  colorKeyOf,
  datesAreGrouped,
  formatFinance,
  formatMoney,
  isCompletedStatus,
  isConditionActive,
  matchesCondition,
  NO_COLOR_KEY,
  normalizeTimeInput,
  parseClipboardGrid,
  clipboardTextForCell,
  looksLikeClipboardGrid,
  surnameKey,
  OWN_DRIVER_COLORS,
  OWN_PLATE_COLORS,
  FOREIGN_FLEET_COLORS,
  planBlockFill,
  planPasteIntoSelection,
  rangeCellKeys,
  seriesValue,
  personKey,
  plateKey,
  shortPersonName,
  sortWithinSlots,
  applyPersonalOrder,
  orderNumberSortKey,
  summarizeSelection,
  textColorFor,
  type ColumnCondition,
  type GridRect,
} from '../components/dispatcher/dispatcherJournalUtils';
import '../styles/dispatcher-journal.css';

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** sessionStorage переживает перезагрузку вкладки (Chrome выгружает фоновые) и уход в другой раздел. */
const readSession = <T,>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: unknown): void => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим — позиция живёт до перезагрузки
  }
};

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

type BooleanFieldName = 'orderOnVehicle' | 'invoiceSent' | 'ezzPe' | 'etrn' | 'recoupling';

/** Источник подсказок ячейки: справочники реестра или справочники водителей/техники. */
type ListSource = keyof DispatcherDictionaryOptions | 'drivers' | 'vehicles';

type ColumnDef =
  | { kind: 'status'; field: 'status'; title: string; width: number }
  | { kind: 'text'; field: TextFieldName; title: string; width: number; multiline?: boolean; list?: ListSource }
  | { kind: 'time'; field: 'submitTime'; title: string; width: number }
  /** accent — цвет галочки и заголовка, как «свой цвет» флажка в google-таблице */
  | { kind: 'checkbox'; field: BooleanFieldName; title: string; width: number; accent?: string }
  /** только чтение: «Без НДС» считается, «№ заказа» выдаётся системой */
  | { kind: 'computed'; field: 'amountWithoutVat' | 'orderNumber' | 'responsible'; title: string; width: number };

/** Своя сортировка сотрудника: порядок id строк и по какой колонке сортировали последний раз. */
type PersonalOrder = { ids: string[]; by: { field: string; direction: 'asc' | 'desc' } | null };

/**
 * Все колонки журнала (порядок — как в google-таблице отдела). Видимость,
 * порядок и ширина настраиваются пользователем; фиксированы только номер
 * строки, дата и кнопка удаления.
 */
const ALL_COLUMNS: ColumnDef[] = [
  { kind: 'computed', field: 'orderNumber', title: '№ заказа', width: 76 },
  { kind: 'status', field: 'status', title: 'Статус', width: 130 },
  { kind: 'text', field: 'info', title: 'Инфо', width: 70 },
  { kind: 'text', field: 'client', title: 'Клиент', width: 120, list: 'client' },
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
  { kind: 'text', field: 'driverRate', title: 'Ставка водителя', width: 86 },
  { kind: 'text', field: 'vat', title: 'НДС', width: 74, list: 'vat' },
  { kind: 'text', field: 'clientRate', title: 'Ставка', width: 86 },
  { kind: 'text', field: 'passes', title: 'Пропуска', width: 80 },
  { kind: 'computed', field: 'amountWithoutVat', title: 'Без НДС', width: 90 },
  { kind: 'text', field: 'extraAddress', title: 'Доп адрес', width: 120, multiline: true },
  { kind: 'text', field: 'demurrage', title: 'Простой/руб', width: 84 },
  { kind: 'checkbox', field: 'orderOnVehicle', title: 'Заказ на ТС', width: 52, accent: '#1a73e8' },
  { kind: 'checkbox', field: 'invoiceSent', title: 'Отправка счета', width: 52, accent: '#d93025' },
  { kind: 'checkbox', field: 'ezzPe', title: 'ЭЗЗ/ПЭ', width: 52, accent: '#e8710a' },
  { kind: 'checkbox', field: 'etrn', title: 'ЭТРН', width: 52, accent: '#00838f' },
  { kind: 'text', field: 'extraTon', title: 'Доп тонна', width: 70 },
  { kind: 'text', field: 'seal', title: 'Пломба', width: 70 },
  { kind: 'checkbox', field: 'recoupling', title: 'Перецеп', width: 50 },
  { kind: 'text', field: 'driverRemarks', title: 'Замечания к водителю', width: 140, multiline: true },
  { kind: 'computed', field: 'responsible', title: 'Ответственный', width: 104 },
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
const DEFAULT_ROW_HEIGHT = 26;
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
  /** count / done — заявки этого блока дня (до следующей полосы), а не всего дня: день может встречаться дважды */
  | { kind: 'band'; date: string; key: string; count: number; done: number }
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
  if (!prefs) return prefs;
  const order = [...prefs.order];
  if (!order.includes('amountWithoutVat')) {
    const passesIndex = order.indexOf('passes');
    order.splice(passesIndex >= 0 ? passesIndex + 1 : order.length, 0, 'amountWithoutVat');
  }
  // «№ заказа» (15.09.2026) — первым столбцом у тех, кто уже настраивал колонки
  if (!order.includes('orderNumber')) order.unshift('orderNumber');
  // «ЭЗЗ/ПЭ» и «ЭТРН» (23.09.2026) — сразу за «Отправкой счета»
  ['ezzPe', 'etrn'].forEach((key, index) => {
    if (order.includes(key)) return;
    const invoiceIndex = order.indexOf('invoiceSent');
    order.splice(invoiceIndex >= 0 ? invoiceIndex + 1 + index : order.length, 0, key);
  });
  // «Ответственный» (16.09.2026) — по умолчанию после «Замечаний к водителю», дальше переносится как любой столбец
  if (!order.includes('responsible')) {
    const remarksIndex = order.indexOf('driverRemarks');
    order.splice(remarksIndex >= 0 ? remarksIndex + 1 : order.length, 0, 'responsible');
  }
  return order.length === prefs.order.length ? prefs : { ...prefs, order };
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
  client: [], ktk_type: [], vat: [], operation: [], terminal_from: [], terminal_to: [],
};
const EMPTY_DICTIONARY_COLORS: DispatcherDictionaryColors = {
  client: {}, ktk_type: {}, vat: {}, operation: {}, terminal_from: {}, terminal_to: {},
};

/** Кто ведёт справочники реестра (проверка дублируется на сервере). */
const DICTIONARY_EDIT_ROLES = new Set(['admin', 'head_ktk_vvo']);
/** Цвета значений справочников выбирают и диспетчеры (проверка дублируется на сервере). */
const DICTIONARY_COLOR_ROLES = new Set(['admin', 'head_ktk_vvo', 'manager_ktk_vvo']);
/** История изменений реестра видна администратору и руководителю КТК (проверка и на сервере). */
const HISTORY_ROLES = new Set(['admin', 'head_ktk_vvo', 'manager_ktk_vvo']);

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

/** Фокус в поле, которое сейчас правится (не выделенная ячейка только для чтения и не галочка). */
const editingField = (target: EventTarget | null): boolean => {
  const element = (target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]') as HTMLInputElement | null;
  if (!element) return false;
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.readOnly)) return false;
  if (element instanceof HTMLTextAreaElement && element.readOnly) return false;
  return true;
};

/** Денежные колонки в формате «Финансы» (41 000,00 ₽) — как в google-таблице. */
const FINANCE_FIELDS = new Set<string>(['driverRate', 'clientRate', 'passes', 'demurrage']);

/** Дата строки: как и остальные ячейки — клик выделяет, двойной клик / Enter открывают календарь. */
function DateCell({ value, title, onPick, readOnly }: { value: string; title?: string; onPick: (next: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    try {
      inputRef.current?.showPicker?.();
    } catch {
      // браузер без showPicker — дату можно набрать с клавиатуры
    }
  }, [editing]);
  return (
    <input
      ref={inputRef}
      type="date"
      className={`dj-date-input${editing ? ' is-editing' : ''}`}
      value={value}
      readOnly={!editing}
      title={title}
      onDoubleClick={() => { if (!readOnly) setEditing(true); }}
      onChange={(event) => {
        if (editing && event.target.value) onPick(event.target.value);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        const element = event.currentTarget;
        if (!editing) {
          if (!readOnly && (event.key === 'Enter' || event.key === 'F2' || /^\d$/.test(event.key))) {
            event.preventDefault();
            setEditing(true);
            return;
          }
          const direction = navDirectionOf(event);
          if (direction) {
            event.preventDefault();
            requestCellNav(element, direction, event.shiftKey);
          }
          return;
        }
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault();
          setEditing(false);
          if (event.key === 'Enter') requestCellNav(element, 'down');
        }
      }}
    />
  );
}

/** Своя сортировка: порядок id строк и по какой колонке сортировали последний раз (значок в заголовке). */

type CellRef = { rowId: string; field: string };
type CellSelection = { anchor: CellRef | null; focus: CellRef | null; extra: string[] };
const EMPTY_SELECTION: CellSelection = { anchor: null, focus: null, extra: [] };

type Message = { severity: 'error' | 'success'; text: string } | null;

/** Скопированные ячейки — ещё и таблицей: так их узнают Excel, google-таблицы и сам реестр. */
const tsvAsHtmlTable = (tsv: string): string => {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = tsv.split('\n')
    .map((line) => `<tr>${line.split('\t').map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${body}</table>`;
};

/** Текст ячейки для фильтра, копирования и сортировки. */
const columnText = (row: DispatcherOrderRow, column: ColumnDef): string => {
  if (column.kind === 'checkbox') return row[column.field] ? 'да' : '';
  if (column.kind === 'computed') {
    if (column.field === 'orderNumber') return row.orderNumber ?? '';
    if (column.field === 'responsible') return row.responsible ?? '';
    return formatMoney(amountWithoutVat(row.clientRate, row.passes, row.vat));
  }
  if (column.field === 'driverName') return shortPersonName(row.driverName);
  return row[column.field] ?? '';
};

export default function DispatcherJournalPage() {
  const { user } = useAuthStore();
  // полный доступ — диспетчеры КТК; менеджер док. отдела правит свои поля; офис-менеджер и отдел кадров смотрят без денег
  const journalAccess = dispatcherJournalAccess(user?.role);
  const canManageRows = journalAccess === 'full';
  const canEditField = (field: string) => canEditDispatcherField(journalAccess, field);
  const accessRef = useRef(journalAccess);
  accessRef.current = journalAccess;
  const canManageRowsRef = useRef(canManageRows);
  canManageRowsRef.current = canManageRows;
  const canEditDictionaries = DICTIONARY_EDIT_ROLES.has(user?.role ?? '');
  const canEditDictionaryColors = DICTIONARY_COLOR_ROLES.has(user?.role ?? '');
  const canViewHistory = HISTORY_ROLES.has(user?.role ?? '');
  // выбранный месяц помнится в пределах вкладки: вернулись в реестр — тот же месяц
  const monthSessionKey = `dj-month-v1:${user?.id ?? 'anonymous'}`;
  const [viewMonth, setViewMonth] = useState<string>(() => {
    const saved = readSession<string>(monthSessionKey);
    return saved && /^\d{4}-\d{2}$/.test(saved) ? saved : currentMonth();
  });
  useEffect(() => writeSession(monthSessionKey, viewMonth), [monthSessionKey, viewMonth]);
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
  // свои водители и машины «Нашей организации» — для подсветки чужих красным
  const [ownFleet, setOwnFleet] = useState<{ driverSurnames: Set<string>; plates: Set<string> } | null>(null);
  // вставка списка в середину реестра, когда ниже уже есть заявки или другой день
  // подтверждения (удаление строки, большая вставка) — своим окном: браузерное можно отключить
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  type PasteTargetCell = { td: HTMLElement; tr: HTMLElement; field: string; rowId: string | null };
  const pasteIntoCellRef = useRef<(cell: PasteTargetCell, text: string, html: string) => void>(() => undefined);
  const [pastePrompt, setPastePrompt] = useState<{ count: number; replace: () => void; insert: () => void } | null>(null);
  const [exporting, setExporting] = useState(false);
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
  const defaultNewDateRef = useRef(defaultNewDate);
  defaultNewDateRef.current = defaultNewDate;

  // активная ячейка (последняя, где был курсор): строка значения сверху и «ручка» протягивания.
  // rowId = null — нижняя строка новой заявки
  const [activeCell, setActiveCell] = useState<{ rowId: string | null; field: string } | null>(null);
  const [fillRange, setFillRange] = useState<{ fields: Set<string>; ids: Set<string> } | null>(null);
  // выделение нескольких ячеек, как в google: Shift+клик / Shift+стрелки — диапазон от активной
  // ячейки (anchor) до focus, Ctrl/⌘+клик — отдельные ячейки (extra)
  const [cellSelection, setCellSelection] = useState<CellSelection>(EMPTY_SELECTION);
  const cellSelectionRef = useRef(cellSelection);
  cellSelectionRef.current = cellSelection;

  // настройка колонок (видимость + порядок), на пользователя — как в справочниках
  // личные настройки — в учётной записи (одинаковы на любом компьютере и телефоне)
  const [columnPrefs, setColumnPrefs] = useAccountPreference<ColumnPrefs | undefined>(
    'dj-columns-v1', user?.id, undefined,
    (value) => withNewColumnDefaults(value && typeof value === 'object' ? value as ColumnPrefs : undefined),
  );
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const dragColumnKey = useRef<string | null>(null);
  const hideFinance = journalAccess === 'view';
  const visibleColumns = useMemo(
    () => applyColumnPrefs(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, columnPrefs)
      .map((key) => COLUMN_BY_KEY.get(key))
      .filter((column): column is ColumnDef => Boolean(column) && !(hideFinance && DISPATCHER_FINANCE_COLUMNS.has(column!.field))),
    [columnPrefs, hideFinance],
  );
  const visibleColumnsRef = useRef(visibleColumns);
  visibleColumnsRef.current = visibleColumns;

  // ширина колонок — у каждого сотрудника своя (перетаскивание края заголовка)
  const [customWidths, setCustomWidths] = useAccountPreference<Record<string, number>>(
    'dj-widths-v1', user?.id, {}, (value) => (value && typeof value === 'object' ? value as Record<string, number> : {}),
  );

  // закреплённые слева колонки: № и дата + всё до выбранной колонки включительно
  const [pinnedUntil, setPinnedUntil] = useAccountPreference<string | null>(
    'dj-pin-v1', user?.id, null, (value) => (typeof value === 'string' && value ? value : null),
  );

  // фильтры по значениям (как в google-таблицах): храним скрытые значения
  const [filters, setFilters] = useAccountPreference<Record<string, string[]>>(
    'dj-filters-v1', user?.id, {}, (value) => (value && typeof value === 'object' ? value as Record<string, string[]> : {}),
  );
  // фильтры по условию (пусто / содержит / дата с … по …) и по цвету — тоже у каждого свои
  const [conditions, setConditions] = useAccountPreference<Record<string, ColumnCondition>>(
    'dj-conditions-v1', user?.id, {}, (value) => (value && typeof value === 'object' ? value as Record<string, ColumnCondition> : {}),
  );
  const [colorFilters, setColorFilters] = useAccountPreference<Record<string, string>>(
    'dj-color-filters-v1', user?.id, {}, (value) => (value && typeof value === 'object' ? value as Record<string, string> : {}),
  );
  /** Колонки, где стоит хоть какой-то фильтр (воронка в заголовке подсвечена). */
  const filteredFields = useMemo(() => new Set<string>([
    ...Object.entries(filters).filter(([, hidden]) => hidden.length > 0).map(([field]) => field),
    ...Object.entries(conditions).filter(([, condition]) => isConditionActive(condition)).map(([field]) => field),
    ...Object.entries(colorFilters).filter(([, color]) => Boolean(color)).map(([field]) => field),
  ]), [colorFilters, conditions, filters]);
  const activeFilterCount = filteredFields.size;
  const [filterMenu, setFilterMenu] = useState<{ field: string; anchor: HTMLElement } | null>(null);
  // строки, созданные в этой сессии, не прячутся фильтром — иначе новая заявка «исчезает» при вводе
  const sessionCreatedIdsRef = useRef<Set<string>>(new Set());
  // фильтр, применённый пользователем, действует на ВСЕ строки: исключение для
  // только что созданных живёт лишь до следующего изменения фильтров
  // (иначе строка, добавленная раньше, «торчала» среди отфильтрованных — 14.09)
  // смена фильтра / поиска / сортировки: строка, в которой работали (или верхняя на экране),
  // остаётся на том же месте экрана — таблицу не отбрасывает в начало
  const restoreAnchorRef = useRef<{ rowId: string | null; delta: number; top: number; left: number; until: number } | null>(null);
  const rememberViewAnchor = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { items, offsets } = layoutRef.current;
    const scrollTop = wrap.scrollTop / zoomRef.current;
    const activeRowId = activeCellRef.current?.rowId ?? null;
    let itemIndex = activeRowId ? items.findIndex((item) => item.kind === 'row' && item.row.id === activeRowId) : -1;
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + wrap.clientHeight / zoomRef.current;
    if (itemIndex < 0 || offsets[itemIndex] < visibleTop || offsets[itemIndex] > visibleBottom) {
      itemIndex = itemAtOffset(offsets, scrollTop);
      while (items[itemIndex] && items[itemIndex].kind !== 'row') itemIndex += 1;
    }
    const item = items[itemIndex];
    if (!item || item.kind !== 'row') return;
    restoreAnchorRef.current = {
      rowId: item.row.id,
      delta: scrollTop - offsets[itemIndex],
      top: wrap.scrollTop,
      left: wrap.scrollLeft,
      until: Date.now() + 800,
    };
  }, []);

  /** Фильтр одной колонки из её меню: значения, условие и цвет разом. */
  const applyColumnFilter = useCallback((field: string, value: ColumnFilterValue) => {
    rememberViewAnchor();
    sessionCreatedIdsRef.current = new Set();
    const without = <T,>(prev: Record<string, T>): Record<string, T> => {
      const next = { ...prev };
      delete next[field];
      return next;
    };
    setFilters((prev) => (value.hidden.length ? { ...prev, [field]: value.hidden } : without(prev)));
    setConditions((prev) => (isConditionActive(value.condition) ? { ...prev, [field]: value.condition } : without(prev)));
    setColorFilters((prev) => (value.color ? { ...prev, [field]: value.color } : without(prev)));
  }, [rememberViewAnchor]);

  const resetAllFilters = useCallback(() => {
    rememberViewAnchor();
    sessionCreatedIdsRef.current = new Set();
    setFilters({});
    setConditions({});
    setColorFilters({});
  }, [rememberViewAnchor]);
  // поиск по всем колонкам текущего месяца: прячет строки без совпадения
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = search.trim().toLocaleLowerCase('ru');
  const changeSearch = (value: string) => {
    rememberViewAnchor();
    sessionCreatedIdsRef.current = new Set();
    setSearch(value);
  };

  // масштаб таблицы (как в операционном отчёте) — у каждого сотрудника свой
  // выравнивание текста по столбцам — у каждого своё, в учётной записи
  const [columnAligns, setColumnAligns] = useAccountPreference<Record<string, ColumnAlign>>(
    'dj-align-v1', user?.id, {}, (value) => (value && typeof value === 'object' ? value as Record<string, ColumnAlign> : {}),
  );
  const alignOf = (field: string): ColumnAlign => {
    const saved = columnAligns[field];
    if (saved === 'left' || saved === 'center' || saved === 'right') return saved;
    const column = COLUMN_BY_KEY.get(field);
    if (FINANCE_FIELDS.has(field) || field === 'amountWithoutVat') return 'right';
    if (field === 'orderNumber' || column?.kind === 'checkbox') return 'center';
    return 'left';
  };
  const alignCss = useMemo(() => Object.entries(columnAligns)
    .filter(([field, value]) => /^[A-Za-z]+$/.test(field) && (value === 'left' || value === 'center' || value === 'right'))
    .map(([field, value]) => `.dj-table td[data-field="${field}"], .dj-table td[data-field="${field}"] .dj-cell-input, .dj-table td[data-field="${field}"] textarea { text-align: ${value} !important; }`)
    .join('\n'), [columnAligns]);
  const [zoom, setZoom] = useAccountPreference<number>('dj-zoom-v1', user?.id, 1, (value) => {
    const stored = Number(value);
    return Number.isFinite(stored) && stored >= MIN_ZOOM && stored <= MAX_ZOOM ? stored : 1;
  });
  const [zoomInput, setZoomInput] = useState(`${Math.round(zoom * 100)}%`);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    setZoomInput(`${Math.round(zoom * 100)}%`);
  }, [zoom]);
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
  const [stickyBandKey, setStickyBandKey] = useState<string | null>(null);
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

  // позиция в таблице переживает уход в другой раздел и перезагрузку вкладки (sessionStorage)
  const scrollSessionKey = `dj-scroll-v1:${user?.id ?? 'anonymous'}:${viewMonth}`;
  const scrollSessionKeyRef = useRef(scrollSessionKey);
  scrollSessionKeyRef.current = scrollSessionKey;
  const scrollSaveTimerRef = useRef<number | null>(null);
  // пока месяц не загружен и позиция не восстановлена — не перезаписываем сохранённое место
  const restorePendingRef = useRef(true);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  useEffect(() => {
    restorePendingRef.current = true;
  }, [viewMonth]);

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
    let bandKey: string | null = null;
    if (topItem && scrollTop > 1) {
      const bandAtTop = topItem.kind === 'band' && scrollTop - offsets[topItemIndex] < 2;
      if (!bandAtTop) {
        // полоса блока, в котором сейчас верхняя строка
        for (let index = topItemIndex; index >= 0; index -= 1) {
          const item = items[index];
          if (item.kind === 'band') {
            bandKey = item.key;
            break;
          }
        }
      }
    }
    setStickyBandKey((prev) => (prev === bandKey ? prev : bandKey));
    // запоминаем место в таблице: первая строка на экране + сдвиг (и горизонтальная прокрутка)
    if (restorePendingRef.current) return;
    if (scrollSaveTimerRef.current) window.clearTimeout(scrollSaveTimerRef.current);
    const key = scrollSessionKeyRef.current;
    scrollSaveTimerRef.current = window.setTimeout(() => {
      let anchorIndex = topItemIndex;
      while (items[anchorIndex] && items[anchorIndex].kind !== 'row') anchorIndex += 1;
      const anchor = items[anchorIndex];
      writeSession(key, {
        rowId: anchor && anchor.kind === 'row' ? anchor.row.id : null,
        delta: anchor ? scrollTop - offsets[anchorIndex] : 0,
        top: wrap.scrollTop,
        left: wrap.scrollLeft,
      });
    }, 200);
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
    // высота строки — самая частая среди нарисованных строк и с порогом в 1 px: если какая-то
    // строка на пиксель выше, замер не «прыгает» при прокрутке (иначе окно пересчитывается
    // по кругу — React #185 «Maximum update depth», 15.09)
    const renderedRows = tbodyRef.current?.querySelectorAll('tr[data-row-index]');
    if (renderedRows?.length) {
      const counts = new Map<number, number>();
      renderedRows.forEach((row) => {
        const height = Math.round((row as HTMLElement).getBoundingClientRect().height / zoom);
        counts.set(height, (counts.get(height) ?? 0) + 1);
      });
      const [height] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (height > 10 && Math.abs(height - rowHeight) >= 1) setRowHeight(height);
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

  // перетаскивание — без фильтров и поиска (при фильтре место строки среди скрытых неоднозначно)
  // своя сортировка (у каждого своя, хранится в учётной записи): сортировка из меню столбца
  // один раз переставляет строки только у этого сотрудника; общий порядок коллег не меняется
  const [personalSort, setPersonalSortValue] = useAccountPreference<PersonalOrder | null>(
    `dj-order-v1:${viewMonth}`, user?.id, null,
    (value) => {
      const saved = value as { ids?: unknown; by?: PersonalOrder['by'] } | null;
      const ids = Array.isArray(saved?.ids) ? saved!.ids.filter((id): id is string => typeof id === 'string') : [];
      return ids.length ? { ids, by: saved?.by?.field ? saved.by : null } : null;
    },
  );
  const personalSortRef = useRef(personalSort);
  personalSortRef.current = personalSort;
  const setPersonalSort = useCallback((value: PersonalOrder | null) => {
    personalSortRef.current = value;
    setPersonalSortValue(value);
  }, [setPersonalSortValue]);
  const orderedRows = useMemo(() => applyPersonalOrder(rows, personalSort?.ids), [rows, personalSort]);
  const orderedRowsRef = useRef(orderedRows);
  orderedRowsRef.current = orderedRows;
  // перетаскивание — без фильтров и поиска; при своей сортировке строка переезжает только в своём порядке
  const canDragRows = canManageRows && activeFilterCount === 0 && !searchQuery;
  const sortValue = useCallback((row: DispatcherOrderRow, field: string): unknown => {
    if (field === DATE_KEY) return row.orderDate;
    const column = COLUMN_BY_KEY.get(field);
    if (!column) return '';
    if (column.kind === 'checkbox') return row[column.field] ? 1 : '';
    if (column.kind === 'computed') {
      if (column.field === 'orderNumber') return orderNumberSortKey(row.orderNumber);
      if (column.field === 'responsible') return (row.responsible ?? '').toLocaleLowerCase('ru');
      return amountWithoutVat(row.clientRate, row.passes, row.vat) ?? '';
    }
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

  /** «№» строки — место в порядке месяца (своём или общем); при фильтре и поиске не пересчитывается. */
  const rowNumberById = useMemo(() => new Map(orderedRows.map((row, index) => [row.id, index + 1])), [orderedRows]);
  /** Фильтры и поиск — одинаково для своего и общего порядка строк. */
  /** Цвет ячейки для фильтра по цвету: заливка статуса / значения справочника или «без цвета». */
  const cellColorKey = useCallback((row: DispatcherOrderRow, field: string): string => {
    if (field === 'status') return colorKeyOf(statusByName.get(row.status ?? '')?.color);
    const column = COLUMN_BY_KEY.get(field);
    if (column?.kind !== 'text' || !column.list) return NO_COLOR_KEY;
    if (column.list === 'drivers' || column.list === 'vehicles') {
      const value = row[column.field] ?? '';
      if (!ownFleet || !value.trim()) return NO_COLOR_KEY;
      const own = column.list === 'drivers' ? ownFleet.driverSurnames.has(surnameKey(value)) : ownFleet.plates.has(plateKey(value));
      return colorKeyOf(own ? (column.list === 'drivers' ? OWN_DRIVER_COLORS : OWN_PLATE_COLORS).background : FOREIGN_FLEET_COLORS.background);
    }
    return colorKeyOf(dictionaryColors[column.list]?.[row[column.field] ?? '']?.color);
  }, [dictionaryColors, ownFleet, statusByName]);

  /** Текст ячейки для условия: у даты — YYYY-MM-DD. */
  const conditionText = useCallback((row: DispatcherOrderRow, field: string): string => {
    if (field === DATE_KEY) return row.orderDate;
    const column = COLUMN_BY_KEY.get(field);
    return column ? columnText(row, column) : '';
  }, []);

  const visibleRowsOf = useCallback((list: DispatcherOrderRow[]): DispatcherOrderRow[] => {
    const fields = [...filteredFields];
    const filtered = fields.length
      ? list.filter((row) => sessionCreatedIdsRef.current.has(row.id)
        || fields.every((field) => {
          const hidden = filters[field];
          if (hidden?.length && hidden.includes(filterText(row, field))) return false;
          if (!matchesCondition(conditionText(row, field), conditions[field])) return false;
          const color = colorFilters[field];
          return !color || cellColorKey(row, field) === color;
        }))
      : list;
    return searchQuery
      ? filtered.filter((row) => sessionCreatedIdsRef.current.has(row.id)
        || formatDateFull(row.orderDate).includes(searchQuery)
        || ALL_COLUMNS.some((column) => columnText(row, column).toLocaleLowerCase('ru').includes(searchQuery)))
      : filtered;
  }, [cellColorKey, colorFilters, conditionText, conditions, filterText, filteredFields, filters, searchQuery]);
  const displayRows = useMemo(() => visibleRowsOf(orderedRows), [orderedRows, visibleRowsOf]);

  // полоса дня перед каждой сменой даты. Прячем полосы только когда своя сортировка
  // по другой колонке перемешала дни (например, по статусу на весь месяц); в общем
  // порядке полосы есть всегда — даже если строке поменяли дату и день встречается дважды
  const showDayBands = useMemo(() => {
    if (!personalSort || personalSort.by?.field === DATE_KEY || datesAreGrouped(displayRows)) return true;
    // сортировали внутри одного дня (фильтр по дате → сортировка → фильтр снят): дни перемешаны
    // не больше, чем в общем порядке — полосы остаются
    const dayBreaks = (list: DispatcherOrderRow[]) => list.filter((row, index) => index > 0 && row.orderDate !== list[index - 1].orderDate).length;
    return dayBreaks(displayRows) <= dayBreaks(visibleRowsOf(rows));
  }, [displayRows, personalSort, rows, visibleRowsOf]);
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    let band: Extract<DisplayItem, { kind: 'band' }> | null = null;
    displayRows.forEach((row, index) => {
      if (showDayBands && (index === 0 || row.orderDate !== displayRows[index - 1].orderDate)) {
        band = { kind: 'band', date: row.orderDate, key: `band-${index}-${row.orderDate}`, count: 0, done: 0 };
        items.push(band);
      }
      // итоги полосы — по видимым строкам её блока
      if (band) {
        band.count += 1;
        if (isCompletedStatus(row.status)) band.done += 1;
      }
      items.push({ kind: 'row', row, index });
    });
    return items;
  }, [displayRows, showDayBands]);
  const stickyBand = useMemo(
    () => (stickyBandKey ? displayItems.find((item) => item.kind === 'band' && item.key === stickyBandKey) ?? null : null),
    [displayItems, stickyBandKey],
  ) as Extract<DisplayItem, { kind: 'band' }> | null;

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
  // новая строка из меню «Добавить строку выше/ниже» — курсор в её первую ячейку
  const pendingFocusRef = useRef<{ rowId: string } | null>(null);
  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  const selectedKeys = useMemo(() => {
    const { anchor, focus, extra } = cellSelection;
    const keys = new Set(extra);
    if (anchor && focus) {
      rangeCellKeys(anchor, focus, displayRows.map((row) => row.id), [DATE_KEY, ...visibleColumns.map((column) => column.field)])
        .forEach((key) => keys.add(key));
    }
    return keys;
  }, [cellSelection, displayRows, visibleColumns]);
  const selectedKeysRef = useRef(selectedKeys);
  selectedKeysRef.current = selectedKeys;
  const multiSelected = selectedKeys.size > 1;

  /** Текст ячейки как в таблице (для копирования и итогов выделения). */
  const cellText = useCallback((rowId: string | null, field: string): string => {
    const row = rowId ? rowsRef.current.find((item) => item.id === rowId) : null;
    if (!row) return '';
    if (field === DATE_KEY) return formatDateFull(row.orderDate);
    const column = COLUMN_BY_KEY.get(field);
    return column ? columnText(row, column) : '';
  }, []);

  // итоги выделения в углу таблицы: сколько ячеек, сколько заполнено, сумма и среднее чисел
  const selectionSummary = useMemo(() => {
    if (!multiSelected) return null;
    const keys = [...selectedKeys];
    const texts = keys.map((key) => {
      const [rowId, field] = key.split('|');
      return field === DATE_KEY ? '' : cellText(rowId, field);
    });
    const summary = summarizeSelection(texts);
    const numericFields = keys
      .map((key) => key.split('|')[1])
      .filter((field, index) => field !== DATE_KEY && summarizeSelection([texts[index]]).numbers > 0);
    const money = numericFields.length > 0
      && numericFields.every((field) => FINANCE_FIELDS.has(field) || field === 'amountWithoutVat');
    const format = (value: number) => (money
      ? formatFinance(value.toFixed(2))
      : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
    return {
      count: keys.length,
      filled: summary.filled,
      sum: summary.numbers ? format(summary.sum) : null,
      average: summary.average !== null ? format(summary.average) : null,
    };
    // rows: пересчёт итогов после правок значений
  }, [cellText, multiSelected, rows, selectedKeys]);

  /** Прямоугольник выделенных ячеек текстом для Excel/google (невыделенные внутри — пустые). */
  const selectionAsTsv = useCallback((): string => {
    const rowIds = displayRowsRef.current.map((row) => row.id);
    const fields = [DATE_KEY, ...visibleColumnsRef.current.map((column) => column.field as string)];
    const cells = [...selectedKeysRef.current].map((key) => {
      const [rowId, field] = key.split('|');
      return { rowId, field, row: rowIds.indexOf(rowId), col: fields.indexOf(field) };
    }).filter((cell) => cell.row >= 0 && cell.col >= 0);
    if (!cells.length) return '';
    const rowNumbers = [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b);
    const minCol = Math.min(...cells.map((cell) => cell.col));
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    return rowNumbers.map((rowNumber) => {
      const line: string[] = [];
      for (let col = minCol; col <= maxCol; col += 1) {
        const selected = selectedKeysRef.current.has(cellKey(rowIds[rowNumber], fields[col]));
        line.push(selected ? cellText(rowIds[rowNumber], fields[col]).replace(/\t/g, ' ').replace(/\r?\n/g, ' ') : '');
      }
      return line.join('\t');
    }).join('\n');
  }, [cellText]);

  // возврат в реестр: прокручиваем к строке, на которой остановились (один раз после загрузки месяца)
  // высота строк уточняется замером уже после первой прокрутки — поэтому ещё ~1,5 с
  // подправляем прокрутку к той же строке, пока раскладка не устоится
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || loadedMonth !== viewMonth) return;
    if (restorePendingRef.current) {
      restorePendingRef.current = false;
      const saved = readSession<{ rowId: string | null; delta: number; top: number; left: number }>(scrollSessionKey);
      restoreAnchorRef.current = saved ? { ...saved, until: Date.now() + 1500 } : null;
      if (saved) wrap.scrollLeft = saved.left ?? 0;
    }
    const anchor = restoreAnchorRef.current;
    if (!anchor) return;
    if (Date.now() > anchor.until) {
      restoreAnchorRef.current = null;
      return;
    }
    const rowIndex = anchor.rowId ? displayRows.findIndex((row) => row.id === anchor.rowId) : -1;
    const itemIndex = rowIndex >= 0 ? itemByRowIndex.get(rowIndex) : undefined;
    const target = itemIndex !== undefined ? Math.round((itemOffsets[itemIndex] + anchor.delta) * zoom) : anchor.top;
    if (Math.abs(wrap.scrollTop - target) > 1) wrap.scrollTop = target;
  }, [displayRows, itemByRowIndex, itemOffsets, loadedMonth, scrollSessionKey, viewMonth, zoom]);

  // список или масштаб поменялись — пересчитать окно и прилипшую полосу
  useEffect(() => {
    handleWrapScroll();
  }, [displayItems, handleWrapScroll, zoom]);

  // ── переходы по ячейкам стрелками / Tab / Enter (как в google-таблицах) ──
  const navLayoutRef = useRef({ headerHeight, bandHeight, rowHeight, sticky: false });
  navLayoutRef.current = { headerHeight, bandHeight, rowHeight, sticky: Boolean(stickyBand && showDayBands) };

  const keepCellVisible = useCallback((td: HTMLElement) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const layout = navLayoutRef.current;
    const scale = zoomRef.current;
    const wrapRect = wrap.getBoundingClientRect();
    const rect = td.getBoundingClientRect();
    const topLimit = wrapRect.top + (layout.headerHeight + (layout.sticky ? layout.bandHeight : 0)) * scale;
    if (rect.top < topLimit) wrap.scrollTop -= topLimit - rect.top;
    else if (rect.bottom > wrapRect.bottom - 4) wrap.scrollTop += rect.bottom - wrapRect.bottom + 4;
    if (!td.classList.contains('dj-pinned')) {
      const lastPinned = td.parentElement?.querySelector('.dj-pinned--last') as HTMLElement | null;
      const leftLimit = lastPinned ? lastPinned.getBoundingClientRect().right : wrapRect.left;
      if (rect.left < leftLimit) wrap.scrollLeft -= leftLimit - rect.left;
      else if (rect.right > wrapRect.right - 4) wrap.scrollLeft += rect.right - wrapRect.right + 4;
    }
  }, []);

  const focusCell = useCallback((td: HTMLElement) => {
    const target = (td.querySelector('input, textarea') as HTMLElement | null) ?? td;
    target.focus({ preventScroll: true });
    keepCellVisible(td);
  }, [keepCellVisible]);

  const moveSelection = useCallback((tr: HTMLElement, field: string, direction: CellNavDirection, attempt = 0) => {
    if (direction !== 'up' && direction !== 'down') {
      const cells = Array.from(tr.querySelectorAll(':scope > td[data-field]')) as HTMLElement[];
      const index = cells.findIndex((cell) => cell.dataset.field === field);
      const next = cells[index + (direction === 'left' || direction === 'prev' ? -1 : 1)];
      if (next) focusCell(next);
      return;
    }
    const isDataRow = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement && (element.dataset.rowId !== undefined || element.classList.contains('dj-row--ghost'));
    let sibling = direction === 'up' ? tr.previousElementSibling : tr.nextElementSibling;
    while (sibling && !isDataRow(sibling) && !sibling.classList.contains('dj-spacer')) {
      sibling = direction === 'up' ? sibling.previousElementSibling : sibling.nextElementSibling;
    }
    if (isDataRow(sibling)) {
      const td = sibling.querySelector(`td[data-field="${field}"]`) as HTMLElement | null;
      if (td) focusCell(td);
      return;
    }
    // соседняя строка ещё не нарисована (виртуализация) — прокручиваем и пробуем снова
    const wrap = wrapRef.current;
    if (!sibling || !wrap || attempt >= 6) return;
    wrap.scrollTop += (direction === 'up' ? -3 : 3) * navLayoutRef.current.rowHeight * zoomRef.current;
    const rowId = tr.dataset.rowId;
    window.setTimeout(() => {
      const fresh = rowId ? wrap.querySelector(`tr[data-row-id="${rowId}"]`) as HTMLElement | null : tr;
      if (fresh) moveSelection(fresh, field, direction, attempt + 1);
    }, 80);
  }, [focusCell]);

  /** Shift+стрелка: край диапазона сдвигается на ячейку, активная ячейка остаётся на месте. */
  const extendSelection = useCallback((origin: CellRef, direction: CellNavDirection) => {
    const rowIds = displayRowsRef.current.map((row) => row.id);
    const fields = [DATE_KEY, ...visibleColumnsRef.current.map((column) => column.field as string)];
    const current = cellSelectionRef.current;
    const anchor = current.anchor ?? origin;
    const from = current.focus ?? anchor;
    let row = rowIds.indexOf(from.rowId);
    let col = fields.indexOf(from.field);
    if (row < 0 || col < 0) return;
    if (direction === 'up') row = Math.max(0, row - 1);
    if (direction === 'down') row = Math.min(rowIds.length - 1, row + 1);
    if (direction === 'left') col = Math.max(0, col - 1);
    if (direction === 'right') col = Math.min(fields.length - 1, col + 1);
    const focus = { rowId: rowIds[row], field: fields[col] };
    setCellSelection({ anchor, focus, extra: [] });
    const wrap = wrapRef.current;
    const target = wrap?.querySelector(`tr[data-row-id="${focus.rowId}"] td[data-field="${focus.field}"]`) as HTMLElement | null;
    if (target) keepCellVisible(target);
    else if (wrap) wrap.scrollTop += (direction === 'up' ? -1 : 1) * navLayoutRef.current.rowHeight * zoomRef.current;
  }, [keepCellVisible]);

  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return undefined;
    const onNav = (event: Event) => {
      const { direction, extend } = (event as CustomEvent<CellNavDetail>).detail;
      const td = (event.target as HTMLElement).closest('td[data-field]') as HTMLElement | null;
      const tr = td?.closest('tr') as HTMLElement | null;
      if (!td || !tr) return;
      if (extend && tr.dataset.rowId) {
        extendSelection({ rowId: tr.dataset.rowId, field: td.dataset.field ?? '' }, direction);
        return;
      }
      moveSelection(tr, td.dataset.field ?? '', direction);
    };
    tbody.addEventListener(CELL_NAV_EVENT, onNav);
    return () => tbody.removeEventListener(CELL_NAV_EVENT, onNav);
  }, [extendSelection, moveSelection]);

  // новая строка из меню появилась в таблице — курсор в её первую ячейку
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const tr = wrapRef.current?.querySelector(`tr[data-row-id="${pending.rowId}"]`) as HTMLElement | null;
    if (!tr) return;
    pendingFocusRef.current = null;
    const target = tr.querySelector('td[data-field]:not([data-field="orderDate"]) input, td[data-field]:not([data-field="orderDate"]) textarea') as HTMLElement | null;
    target?.focus({ preventScroll: true });
    tr.scrollIntoView({ block: 'nearest' });
  }, [displayItems, scrollWindow]);

  const loadRows = useCallback(async (withSpinner = false) => {
    const target = rangeRef.current;
    if (withSpinner) setLoading(true);
    try {
      const { data } = await getDispatcherOrders(target.from, target.to);
      if (rangeRef.current.from === target.from && rangeRef.current.to === target.to) {
        setRows(data);
        setLoadedMonth(target.from.slice(0, 7));
      }
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
    getDispatcherOwnFleet()
      .then(({ data }) => setOwnFleet({ driverSurnames: new Set(data.driverSurnames), plates: new Set(data.plates) }))
      .catch(() => undefined);
    // подсказки водителей и техники нужны только тем, кто их вводит (справочники остальным закрыты)
    if (accessRef.current !== 'full') return;
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
    | { kind: 'delete'; row: DispatcherOrderRow }
    /** массовое действие (вставка столбиком, протягивание) — отменяется целиком */
    | { kind: 'multi'; patches: Array<{ id: string; before: DispatcherOrderPatch }>; created: string[] }
    /** своя сортировка — возвращается прежний порядок */
    | { kind: 'order'; before: PersonalOrder | null };
  const undoStackRef = useRef<UndoEntry[]>([]);
  /** Только поля, которые роли можно менять (дата и порядок строк — у тех, кто ведёт реестр целиком). */
  const allowedPatch = (patch: DispatcherOrderPatch): DispatcherOrderPatch => {
    if (accessRef.current === 'full') return patch;
    return Object.fromEntries(
      Object.entries(patch).filter(([field]) => canEditDispatcherField(accessRef.current, field)),
    ) as DispatcherOrderPatch;
  };

  const pushUndo = (entry: UndoEntry) => {
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  };

  const patchRow = useCallback((id: string, rawPatch: DispatcherOrderPatch, options?: { skipUndo?: boolean }) => {
    const patch = allowedPatch(rawPatch);
    if (!Object.keys(patch).length) {
      if (Object.keys(rawPatch).length) setMessage({ severity: 'error', text: 'Это поле доступно только для просмотра' });
      return;
    }
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
    if (accessRef.current !== 'full') return null;
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
    if (accessRef.current !== 'full') return;
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
    // своя сортировка: строка переезжает только в своём порядке — общий порядок коллег не меняется
    const personal = personalSortRef.current;
    if (personal) {
      const ids = orderedRowsRef.current.map((row) => row.id).filter((id) => id !== draggedId);
      const at = ids.indexOf(targetId);
      if (at < 0) return;
      ids.splice(at + (after ? 1 : 0), 0, draggedId);
      pushUndo({ kind: 'order', before: personal });
      setPersonalSort({ ...personal, ids });
      return;
    }
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
  }, [patchRow, setPersonalSort]);

  const deleteRow = useCallback(async (row: DispatcherOrderRow, options?: { silent?: boolean; skipUndo?: boolean }) => {
    if (accessRef.current !== 'full') return;
    if (!options?.silent) {
      const label = [row.orderNumber, row.ktkNumber, row.client].filter(Boolean).join(', ');
      setConfirmRequest({
        title: 'Удалить строку?',
        text: label ? `${label}. Вернуть можно по Ctrl+Z.` : 'Вернуть можно по Ctrl+Z.',
        confirmLabel: 'Удалить',
        danger: true,
        onConfirm: () => void deleteRow(row, { ...options, silent: true }),
      });
      return;
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
    } else if (entry.kind === 'multi') {
      entry.patches.forEach((item) => patchRow(item.id, item.before, { skipUndo: true }));
      entry.created.forEach((id) => {
        const row = rowsRef.current.find((item) => item.id === id);
        if (row) void deleteRow(row, { silent: true, skipUndo: true });
      });
      setMessage({ severity: 'success', text: 'Вставка / протягивание отменены' });
    } else if (entry.kind === 'order') {
      rememberViewAnchor();
      setPersonalSort(entry.before);
      setMessage({ severity: 'success', text: 'Порядок строк возвращён' });
    } else if (entry.kind === 'create') {
      const row = rowsRef.current.find((item) => item.id === entry.id);
      if (row) void deleteRow(row, { silent: true, skipUndo: true });
      setMessage({ severity: 'success', text: 'Создание строки отменено' });
    } else {
      const { id: _id, orderDate, updatedAt: _updatedAt, orderNumber: _orderNumber, ...fields } = entry.row;
      void createRow(orderDate, fields, { skipUndo: true });
      setMessage({ severity: 'success', text: 'Строка восстановлена' });
    }
  }, [createRow, deleteRow, patchRow, rememberViewAnchor, setPersonalSort]);

  /**
   * Сортировка из меню колонки: один раз, только у этого сотрудника, в пределах видимых
   * (отфильтрованных) строк — они сортируются между собой на своих местах. Снятие фильтра
   * порядок не сбрасывает (как в Excel); общий порядок возвращает «Настройки» → «Вернуть общий порядок».
   */
  const sortOnce = (field: string, direction: 'asc' | 'desc') => {
    rememberViewAnchor();
    const before = personalSortRef.current;
    const ids = sortWithinSlots(
      orderedRowsRef.current,
      displayRowsRef.current.map((row) => row.id),
      (list) => sortRows(list, { field, direction }, sortValue),
    );
    pushUndo({ kind: 'order', before });
    setPersonalSort({ ids, by: { field, direction } });
    const title = field === DATE_KEY ? 'Дата' : COLUMN_BY_KEY.get(field)?.title ?? field;
    setMessage({ severity: 'success', text: `Отсортировано у вас: ${title}. Коллеги видят свой порядок (Ctrl+Z — отменить)` });
  };

  /** Общий порядок строк вместо своей сортировки. */
  const resetPersonalSort = () => {
    if (!personalSortRef.current) return;
    rememberViewAnchor();
    pushUndo({ kind: 'order', before: personalSortRef.current });
    setPersonalSort(null);
    setMessage({ severity: 'success', text: 'Общий порядок строк (Ctrl+Z — вернуть свой)' });
  };

  /** Delete / вырезание при нескольких выделенных ячейках — очищаются все (одно действие для Ctrl+Z). */
  const clearSelectedCellsRef = useRef<() => void>(() => undefined);
  const clearSelectedCells = () => {
    const byRow = new Map<string, DispatcherOrderPatch>();
    selectedKeysRef.current.forEach((key) => {
      const [rowId, field] = key.split('|');
      if (field === DATE_KEY) return;
      const column = COLUMN_BY_KEY.get(field);
      if (!column || column.kind === 'computed') return;
      const patch = cellPatchFromText(field, '');
      if (patch) byRow.set(rowId, { ...(byRow.get(rowId) ?? {}), ...patch });
    });
    const total = selectedKeysRef.current.size;
    void applyBulkChanges([...byRow].map(([id, patch]) => ({ id, patch })), []).then(({ patched }) => {
      if (patched) setMessage({ severity: 'success', text: `Очищено ячеек: ${total} (Ctrl+Z — отменить)` });
    });
  };
  clearSelectedCellsRef.current = clearSelectedCells;

  /** «Добавить строку выше/ниже» из меню строки: пустая строка той же даты рядом. */
  const insertRowNear = async (row: DispatcherOrderRow, after: boolean) => {
    const ordered = sortByDate(rowsRef.current);
    const index = ordered.findIndex((item) => item.id === row.id);
    const neighbor = index < 0 ? undefined : ordered[index + (after ? 1 : -1)];
    const position = neighbor
      ? (row.position + neighbor.position) / 2
      : row.position + (after ? 1 : -1);
    const created = await createRow(row.orderDate, { position, status: null });
    if (!created) return;
    const current = personalSortRef.current;
    if (current) {
      const without = current.ids.filter((id) => id !== created.id);
      const at = without.indexOf(row.id);
      if (at >= 0) {
        without.splice(at + (after ? 1 : 0), 0, created.id);
        setPersonalSort({ ...current, ids: without });
      }
    }
    pendingFocusRef.current = { rowId: created.id };
  };

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

  /** Текст из буфера/протягивания → значение поля заявки (галочки, статус из справочника, ФИО, время). */
  const cellPatchFromText = useCallback((field: string, raw: string): DispatcherOrderPatch | null => {
    if (field === DATE_KEY) {
      const date = parseClipboardDate(raw, rangeRef.current.from.slice(0, 7));
      return date ? { orderDate: date } : null;
    }
    const column = COLUMN_BY_KEY.get(field);
    if (!column || column.kind === 'computed') return null;
    const trimmed = raw.trim();
    if (column.kind === 'checkbox') return { [column.field]: TRUE_WORDS.has(trimmed.toLowerCase()) };
    if (column.kind === 'status') {
      const exact = statusesRef.current.find((status) => status.name.toLowerCase() === trimmed.toLowerCase());
      return { status: exact?.name ?? (trimmed || null) };
    }
    if (column.kind === 'time') return { submitTime: normalizeTimeInput(trimmed) || null };
    if (column.field === 'driverName') return { driverName: shortPersonName(trimmed) || null };
    return { [column.field]: trimmed || null };
  }, []);

  /** «Копировать» из меню: выделенные ячейки, активная ячейка или вся строка. */
  const copyFromMenu = useCallback(async (row: DispatcherOrderRow) => {
    const active = activeCellRef.current;
    let text: string;
    let html: string | null = null;
    if (selectedKeysRef.current.size > 1) {
      text = selectionAsTsv();
      html = tsvAsHtmlTable(text);
    } else if (active?.rowId) {
      text = cellText(active.rowId, active.field);
    } else {
      text = rowToTsv(row);
      html = tsvAsHtmlTable(text);
    }
    try {
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setMessage({ severity: 'success', text: 'Скопировано в буфер обмена' });
    } catch {
      setMessage({ severity: 'error', text: 'Браузер не дал доступ к буферу обмена' });
    }
  }, [cellText, rowToTsv, selectionAsTsv]);

  /** «Вставить» из меню: в активную ячейку, иначе в первую ячейку выбранной строки. */
  const pasteFromMenu = useCallback(async (row: DispatcherOrderRow) => {
    const active = activeCellRef.current;
    const rowId = active?.rowId && rowsRef.current.some((item) => item.id === active.rowId) ? active.rowId : row.id;
    const field = active?.rowId === rowId && active?.field ? active.field : visibleColumnsRef.current[0]?.field ?? DATE_KEY;
    const tr = wrapRef.current?.querySelector(`tr[data-row-id="${rowId}"]`) as HTMLElement | null;
    const td = tr?.querySelector(`td[data-field="${field}"]`) as HTMLElement | null;
    if (!tr || !td) {
      setMessage({ severity: 'error', text: 'Кликните в ячейку, куда вставить значение' });
      return;
    }
    try {
      let text = '';
      let html = '';
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
          if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        }
      }
      if (!text) text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      pasteIntoCellRef.current({ td, tr, field, rowId }, text, html);
    } catch {
      setMessage({ severity: 'error', text: 'Браузер не дал доступ к буферу обмена — используйте Ctrl+V' });
    }
  }, []);

  /** Пакет правок и новых строк одним действием — одна запись в Ctrl+Z. */
  const applyBulkChanges = useCallback(async (
    patches: Array<{ id: string; patch: DispatcherOrderPatch }>,
    creations: Array<{ date: string; patch: DispatcherOrderPatch }>,
  ) => {
    const undoPatches: Array<{ id: string; before: DispatcherOrderPatch }> = [];
    patches.forEach(({ id, patch: rawPatch }) => {
      const patch = allowedPatch(rawPatch);
      const current = rowsRef.current.find((row) => row.id === id);
      if (!current || !Object.keys(patch).length) return;
      const before: DispatcherOrderPatch = {};
      (Object.keys(patch) as Array<keyof DispatcherOrderPatch>).forEach((key) => {
        (before as Record<string, unknown>)[key] = current[key] ?? null;
      });
      undoPatches.push({ id, before });
      patchRow(id, patch, { skipUndo: true });
    });
    const created: string[] = [];
    for (const { date, patch } of accessRef.current === 'full' ? creations : []) {
      // последовательно — сохраняется порядок строк из буфера
      // eslint-disable-next-line no-await-in-loop
      const row = await createRow(date, patch, { skipUndo: true });
      if (row) created.push(row.id);
    }
    if (undoPatches.length || created.length) pushUndo({ kind: 'multi', patches: undoPatches, created });
    return { patched: undoPatches.length, created: created.length, createdIds: created };
  }, [createRow, patchRow]);

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
        setCellSelection((prev) => (prev.focus || prev.extra.length ? { anchor: prev.anchor, focus: null, extra: [] } : prev));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'я') return;
        // в правке ячейки — обычная отмена ввода; в выделенной (не правящейся) ячейке — отмена действия
        if (editingField(event.target)) return;
        event.preventDefault();
        undoLast();
      }
    };
    const inField = (target: EventTarget | null): boolean => editingField(target);

    /** Выделенная ячейка таблицы (без правки): её значение копируется / заменяется вставкой, как в google. */
    const selectedCell = (target: EventTarget | null) => {
      const td = (target as HTMLElement | null)?.closest?.('td[data-field]') as HTMLElement | null;
      const tr = td?.closest('tr') as HTMLElement | null;
      if (!td || !tr || !tbodyRef.current?.contains(td)) return null;
      return { td, tr, field: td.dataset.field ?? '', rowId: tr.dataset.rowId ?? null };
    };
    const cellRawText = (rowId: string | null, field: string): string => {
      const row = rowId ? rowsRef.current.find((item) => item.id === rowId) : null;
      if (!row) return '';
      if (field === DATE_KEY) return formatDateFull(row.orderDate);
      const column = COLUMN_BY_KEY.get(field);
      return column ? columnText(row, column) : '';
    };

    const copyHandler = (event: ClipboardEvent) => {
      if (inField(event.target)) return;
      if (selectedKeysRef.current.size > 1 && event.clipboardData) {
        event.preventDefault();
        const tsv = selectionAsTsv();
        event.clipboardData.setData('text/plain', tsv);
        // html с таблицей — чтобы при вставке было видно, что это блок ячеек, а не текст
        event.clipboardData.setData('text/html', tsvAsHtmlTable(tsv));
        setMessage({ severity: 'success', text: `Скопировано ячеек: ${selectedKeysRef.current.size}` });
        return;
      }
      const cell = selectedCell(event.target);
      if (cell && event.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData('text/plain', cellRawText(cell.rowId, cell.field));
        return;
      }
      const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current);
      if (!selected || !event.clipboardData) return;
      event.preventDefault();
      const line = rowToTsv(selected);
      event.clipboardData.setData('text/plain', line);
      event.clipboardData.setData('text/html', tsvAsHtmlTable(line));
      setMessage({ severity: 'success', text: 'Строка скопирована в буфер' });
    };

    const cutHandler = (event: ClipboardEvent) => {
      if (inField(event.target)) return;
      if (selectedKeysRef.current.size > 1 && event.clipboardData) {
        event.preventDefault();
        const tsv = selectionAsTsv();
        event.clipboardData.setData('text/plain', tsv);
        event.clipboardData.setData('text/html', tsvAsHtmlTable(tsv));
        clearSelectedCellsRef.current();
        return;
      }
      const cell = selectedCell(event.target);
      if (cell && event.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData('text/plain', cellRawText(cell.rowId, cell.field));
        const patch = cell.rowId && cell.field !== DATE_KEY ? cellPatchFromText(cell.field, '') : null;
        if (patch && cell.rowId) patchRow(cell.rowId, patch);
        return;
      }
      const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current);
      if (!selected || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', rowToTsv(selected));
      void deleteRow(selected, { silent: true });
      setMessage({ severity: 'success', text: 'Строка вырезана в буфер' });
    };

    /** Вставка текста в поле, которое правят: как обычная вставка с клавиатуры. */
    const insertIntoField = (element: HTMLInputElement | HTMLTextAreaElement, text: string) => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      const next = element.value.slice(0, start) + text + element.value.slice(end);
      setValue?.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      const caret = start + text.length;
      element.setSelectionRange?.(caret, caret);
    };

    /** Вставка в ячейку — и по Ctrl+V, и через меню правой кнопки. */
    pasteIntoCellRef.current = (cell, raw, html) => {

        // вставка в ячейку: блок из Excel или google-таблицы раскладываем вниз и вправо
        // (как в таблицах), обычный текст — целиком в ячейку, даже если в нём есть переносы строк
        const cellElement = cell.td;
        const rowElement = cell.tr;
        if (!looksLikeClipboardGrid(raw, html)) {
          const column = COLUMN_BY_KEY.get(cell.field);
          const multiline = Boolean(column && column.kind === 'text' && column.multiline);
          const text = clipboardTextForCell(raw, multiline);
          if (!text || !cell.rowId) return;
          const patch = cellPatchFromText(cell.field, text);
          if (patch) patchRow(cell.rowId, patch);
          return;
        }
        const grid = parseClipboardGrid(raw);
        if (!grid.length) return;
        const fieldOrder = [DATE_KEY, ...visibleColumnsRef.current.map((column) => column.field as string)];
        const list = displayRowsRef.current;
        let startColumn = fieldOrder.indexOf(cellElement.dataset.field ?? '');
        let isGhost = !rowElement.dataset.rowId;
        let startIndex = isGhost ? list.length : Number(rowElement.dataset.rowIndex);
        // выделено несколько ячеек — вставка в выделение, как в google
        if (selectedKeysRef.current.size > 1) {
          const rowIds = list.map((item) => item.id);
          const selected = [...selectedKeysRef.current].map((key) => {
            const [rowId, field] = key.split('|');
            return { row: rowIds.indexOf(rowId), col: fieldOrder.indexOf(field) };
          }).filter((item) => item.row >= 0 && item.col >= 0);
          const plan = planPasteIntoSelection(selected, grid);
          if (plan) {
            const byRow = new Map<string, DispatcherOrderPatch>();
            plan.forEach(({ row, col, text }) => {
              const patch = cellPatchFromText(fieldOrder[col], text);
              if (patch) byRow.set(rowIds[row], { ...(byRow.get(rowIds[row]) ?? {}), ...patch });
            });
            void applyBulkChanges([...byRow].map(([id, patch]) => ({ id, patch })), []).then(({ patched }) => {
              if (patched) setMessage({ severity: 'success', text: `Вставлено в ${plan.length} яч. (Ctrl+Z — отменить)` });
            });
            return;
          }
          // размеры не укладываются в выделение — вставляем от его левого верхнего угла
          if (selected.length) {
            startIndex = Math.min(...selected.map((item) => item.row));
            startColumn = Math.min(...selected.map((item) => item.col));
            isGhost = false;
          }
        }
        let lastDate = isGhost ? defaultNewDateRef.current : list[startIndex]?.orderDate ?? defaultNewDateRef.current;
        const patches: Array<{ id: string; patch: DispatcherOrderPatch }> = [];
        const creations: Array<{ date: string; patch: DispatcherOrderPatch }> = [];
        grid.forEach((cells, rowOffset) => {
          const patch: DispatcherOrderPatch = {};
          cells.forEach((raw, cellOffset) => {
            const field = fieldOrder[startColumn + cellOffset];
            if (!field) return;
            Object.assign(patch, cellPatchFromText(field, raw) ?? {});
          });
          const target = list[startIndex + rowOffset];
          if (target) {
            patches.push({ id: target.id, patch });
            lastDate = patch.orderDate ?? target.orderDate;
          } else {
            creations.push({ date: patch.orderDate ?? lastDate, patch });
          }
        });
        const reportPaste = ({ patched, created }: { patched: number; created: number }) => setMessage({
          severity: 'success',
          text: `Вставлено: ${grid.length} стр.${patched ? ` · изменено ${patched}` : ''}${created ? ` · создано ${created}` : ''} (Ctrl+Z — отменить)`,
        });
        // список в середину: ниже уже есть заявки или начинается другой день — спрашиваем,
        // заменить значения или вставить новыми строками под выбранной (в пустые строки того же дня — сразу)
        const startRow = isGhost ? null : list[startIndex];
        if (startRow && grid.length > 1 && canManageRowsRef.current) {
          const width = Math.max(...grid.map((cells) => cells.length));
          const pastedFields = fieldOrder.slice(startColumn, startColumn + width).filter((field) => field !== DATE_KEY);
          const isEmptyForPaste = (row: DispatcherOrderRow) => pastedFields.every((field) => {
            const column = COLUMN_BY_KEY.get(field);
            return !column || column.kind === 'computed' || !columnText(row, column).trim();
          });
          const occupied = grid.slice(1).some((_cells, offset) => {
            const target = list[startIndex + 1 + offset];
            return Boolean(target) && (target.orderDate !== startRow.orderDate || !isEmptyForPaste(target));
          });
          if (occupied) {
            const insertAsNewRows = () => {
              const useClicked = isEmptyForPaste(startRow);
              const lineOf = (cells: string[]) => {
                const patch: DispatcherOrderPatch = {};
                cells.forEach((value, cellOffset) => {
                  const field = fieldOrder[startColumn + cellOffset];
                  if (field) Object.assign(patch, cellPatchFromText(field, value) ?? {});
                });
                return patch;
              };
              const newLines = useClicked ? grid.slice(1) : grid;
              const ordered = sortByDate(rowsRef.current);
              const at = ordered.findIndex((row) => row.id === startRow.id);
              const next = ordered[at + 1];
              const step = next ? (next.position - startRow.position) / (newLines.length + 1) : 1;
              const insertPatches = useClicked ? [{ id: startRow.id, patch: lineOf(grid[0]) }] : [];
              const insertCreations = newLines.map((cells, index) => {
                const patch = lineOf(cells);
                return {
                  date: patch.orderDate ?? startRow.orderDate,
                  patch: { ...patch, position: startRow.position + step * (index + 1) },
                };
              });
              void applyBulkChanges(insertPatches, insertCreations).then((result) => {
                // при своей сортировке новые строки встают сразу под выбранной и у вас
                const personal = personalSortRef.current;
                if (personal && result.createdIds.length) {
                  const ids = personal.ids.filter((id) => !result.createdIds.includes(id));
                  const anchor = ids.indexOf(startRow.id);
                  if (anchor >= 0) {
                    ids.splice(anchor + 1, 0, ...result.createdIds);
                    setPersonalSort({ ...personal, ids });
                  }
                }
                reportPaste(result);
              });
            };
            setPastePrompt({
              count: grid.length,
              insert: insertAsNewRows,
              replace: () => void applyBulkChanges(patches, creations).then(reportPaste),
            });
            return;
          }
        }
        // вставка длинного текста из мессенджера раньше молча затирала строки ниже
        if (patches.length + creations.length > 10) {
          setConfirmRequest({
            title: `Вставить ${grid.length} строк?`,
            text: `Изменится строк реестра: ${patches.length}${creations.length ? `, создастся новых: ${creations.length}` : ''}. Отменить можно по Ctrl+Z.`,
            confirmLabel: 'Вставить',
            onConfirm: () => void applyBulkChanges(patches, creations).then(reportPaste),
          });
          return;
        }
        void applyBulkChanges(patches, creations).then(reportPaste);
    };

    const pasteHandler = (event: ClipboardEvent) => {
      const editing = inField(event.target);
      const cell = selectedCell(event.target);
      // ячейку правят — вставляем текст в неё, а не разливаем по строкам ниже (как в google)
      if (editing) {
        const field = event.target as HTMLInputElement | HTMLTextAreaElement;
        const column = cell ? COLUMN_BY_KEY.get(cell.field) : undefined;
        const multiline = Boolean(column && column.kind === 'text' && column.multiline);
        const text = clipboardTextForCell(event.clipboardData?.getData('text/plain') ?? '', multiline);
        if (!text) return;
        event.preventDefault();
        insertIntoField(field, text);
        return;
      }
      if (cell) {
        event.preventDefault();
        pasteIntoCellRef.current(cell, event.clipboardData?.getData('text/plain') ?? '', event.clipboardData?.getData('text/html') ?? '');
        return;
      }
      // вставка целых строк реестра (их копируют по Ctrl+C с выделенной строкой) — только
      // если в буфере действительно строка таблицы: иначе одно значение сдвинуло бы дату заявки
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (!lines.length) return;
      if (!lines.some((line) => line.includes('\t'))) {
        setMessage({ severity: 'error', text: 'Кликните в ячейку, куда вставить значение' });
        return;
      }
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

    // Ctrl/⌘+F — в поиск реестра: поиск браузера не видит строк за пределами экрана
    const findHandler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyF') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', escHandler);
    window.addEventListener('keydown', findHandler);
    document.addEventListener('copy', copyHandler);
    document.addEventListener('cut', cutHandler);
    document.addEventListener('paste', pasteHandler);
    return () => {
      window.removeEventListener('keydown', escHandler);
      window.removeEventListener('keydown', findHandler);
      document.removeEventListener('copy', copyHandler);
      document.removeEventListener('cut', cutHandler);
      document.removeEventListener('paste', pasteHandler);
    };
  }, [applyBulkChanges, applyTsvLine, cellPatchFromText, createRow, deleteRow, patchRow, rowToTsv, selectionAsTsv, setPersonalSort, undoLast]);

  // ── «ручка» протягивания у активной ячейки (правый нижний угол) ──
  const [fillHandlePos, setFillHandlePos] = useState<{ left: number; top: number } | null>(null);
  const activeCellRef = useRef(activeCell);
  activeCellRef.current = activeCell;

  /** Что протягивается: прямоугольник выделения (Shift) или одна активная ячейка. */
  const fillSource = useCallback((): { rect: GridRect; rowIds: string[]; fields: string[] } | null => {
    const rowIds = displayRowsRef.current.map((row) => row.id);
    const fields = [DATE_KEY, ...visibleColumnsRef.current.map((column) => column.field as string)];
    const selection = cellSelectionRef.current;
    if (selection.extra.length) return null; // разрозненные ячейки (Ctrl) не протягиваются
    if (selection.anchor && selection.focus) {
      const rowA = rowIds.indexOf(selection.anchor.rowId);
      const rowB = rowIds.indexOf(selection.focus.rowId);
      const colA = fields.indexOf(selection.anchor.field);
      const colB = fields.indexOf(selection.focus.field);
      if (rowA >= 0 && rowB >= 0 && colA >= 0 && colB >= 0) {
        return {
          rect: { minRow: Math.min(rowA, rowB), maxRow: Math.max(rowA, rowB), minCol: Math.min(colA, colB), maxCol: Math.max(colA, colB) },
          rowIds,
          fields,
        };
      }
    }
    const cell = activeCellRef.current;
    if (!cell?.rowId) return null;
    const column = cell.field !== DATE_KEY ? COLUMN_BY_KEY.get(cell.field) : null;
    if (column && column.kind === 'computed') return null;
    const row = rowIds.indexOf(cell.rowId);
    const col = fields.indexOf(cell.field);
    if (row < 0 || col < 0) return null;
    return { rect: { minRow: row, maxRow: row, minCol: col, maxCol: col }, rowIds, fields };
  }, []);

  const updateFillHandle = useCallback(() => {
    const wrap = wrapRef.current;
    const source = fillSource();
    if (!wrap || !source) {
      setFillHandlePos((prev) => (prev ? null : prev));
      return;
    }
    const { rect, rowIds, fields } = source;
    // квадратик — в правом нижнем углу выделения
    const td = wrap.querySelector(`tr[data-row-id="${rowIds[rect.maxRow]}"] td[data-field="${fields[rect.maxCol]}"]`) as HTMLElement | null;
    if (!td) {
      setFillHandlePos((prev) => (prev ? null : prev));
      return;
    }
    const cellRect = td.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const next = {
      left: Math.round(cellRect.right - wrapRect.left + wrap.scrollLeft - 6),
      top: Math.round(cellRect.bottom - wrapRect.top + wrap.scrollTop - 6),
    };
    setFillHandlePos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
  }, [fillSource]);

  useLayoutEffect(() => {
    updateFillHandle();
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    wrap.addEventListener('scroll', updateFillHandle);
    window.addEventListener('resize', updateFillHandle);
    return () => {
      wrap.removeEventListener('scroll', updateFillHandle);
      window.removeEventListener('resize', updateFillHandle);
    };
  }, [updateFillHandle]);

  /**
   * Протягивание как в Excel/google: тянем квадратик вниз (или вверх) — значение
   * (или весь выделенный блок) повторяется в строках; с зажатым Ctrl — ряд
   * (число в конце +1, дата +1 день) в колонках, где ряд имеет смысл.
   */
  const startFill = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const source = fillSource();
    if (!source) return;
    const { rect, rowIds, fields } = source;
    const rowsSnapshot = displayRowsRef.current;
    const single = rect.minRow === rect.maxRow && rect.minCol === rect.maxCol;
    // одна ячейка в правке: берём ещё не сохранённый ввод прямо из поля
    let pending: string | null = null;
    if (single) {
      const td = wrapRef.current?.querySelector(`tr[data-row-id="${rowIds[rect.minRow]}"] td[data-field="${fields[rect.minCol]}"]`) as HTMLElement | null;
      const editor = td?.querySelector('input:not([type="checkbox"]), textarea') as HTMLInputElement | HTMLTextAreaElement | null;
      if (editor && !editor.readOnly && fields[rect.minCol] !== DATE_KEY) pending = editor.value;
    }
    const textAt = (rowIndex: number, col: number): string => {
      if (pending !== null) return pending;
      const item = rowsSnapshot[rowIndex];
      const field = fields[col];
      if (!item) return '';
      if (field === DATE_KEY) return item.orderDate;
      const column = COLUMN_BY_KEY.get(field);
      if (!column) return '';
      if (column.kind === 'checkbox') return item[column.field] ? 'да' : '';
      return columnText(item, column);
    };
    (document.activeElement as HTMLElement | null)?.blur();
    let endIndex = rect.maxRow;
    let ctrlHeld = event.ctrlKey || event.metaKey;
    const filledFields = new Set(fields.slice(rect.minCol, rect.maxCol + 1));
    document.body.classList.add('dj-filling');

    const onMove = (moveEvent: MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      ctrlHeld = ctrlHeld || moveEvent.ctrlKey || moveEvent.metaKey;
      const bounds = wrap.getBoundingClientRect();
      if (moveEvent.clientY > bounds.bottom - 28) wrap.scrollTop += 24;
      else if (moveEvent.clientY < bounds.top + 60) wrap.scrollTop -= 24;
      const probeY = Math.min(Math.max(moveEvent.clientY, bounds.top + 2), bounds.bottom - 2);
      // elementsFromPoint: строку находим и под всплывающим сообщением/подсказкой
      const tr = document.elementsFromPoint(moveEvent.clientX, probeY)
        .map((element) => (element as HTMLElement).closest?.('tr[data-row-index]') as HTMLElement | null)
        .find(Boolean) ?? null;
      if (!tr) return;
      endIndex = Number(tr.dataset.rowIndex);
      const from = Math.min(rect.minRow, endIndex);
      const to = Math.max(rect.maxRow, endIndex);
      setFillRange({ fields: filledFields, ids: new Set(rowsSnapshot.slice(from, to + 1).map((item) => item.id)) });
    };

    const onUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('dj-filling');
      setFillRange(null);
      if (endIndex >= rect.minRow && endIndex <= rect.maxRow) return;
      // ряд (+1) — только дата и свободные колонки (№ КТК, вес, пин…); значения из
      // справочников (тип КТК, НДС, терминал), статус, водитель и время всегда копируются
      const seriesAllowed = (col: number) => {
        const field = fields[col];
        if (field === DATE_KEY) return true;
        const column = COLUMN_BY_KEY.get(field);
        return column?.kind === 'text' && !column.list;
      };
      const series = ctrlHeld || upEvent.ctrlKey || upEvent.metaKey;
      const plan = planBlockFill(rect, endIndex, textAt, series
        ? (col, base, delta) => {
          if (!seriesAllowed(col)) return null;
          return fields[col] === DATE_KEY ? addDaysYmd(base, delta) : seriesValue(base, delta);
        }
        : null);
      const byRow = new Map<string, DispatcherOrderPatch>();
      plan.forEach(({ row, col, text }) => {
        const target = rowsSnapshot[row];
        if (!target) return;
        const patch = cellPatchFromText(fields[col], text);
        if (patch) byRow.set(target.id, { ...(byRow.get(target.id) ?? {}), ...patch });
      });
      void applyBulkChanges([...byRow].map(([id, patch]) => ({ id, patch })), []).then(({ patched }) => {
        if (patched) {
          setMessage({
            severity: 'success',
            text: `${series ? 'Заполнено рядом' : 'Скопировано'} в ${patched} стр. (Ctrl+Z — отменить)`,
          });
        }
      });
      // как в google: после протягивания выделена вся заполненная область
      const top = Math.min(rect.minRow, endIndex);
      const bottom = Math.max(rect.maxRow, endIndex);
      if (rowIds[top] && rowIds[bottom]) {
        setCellSelection({
          anchor: { rowId: rowIds[top], field: fields[rect.minCol] },
          focus: { rowId: rowIds[bottom], field: fields[rect.maxCol] },
          extra: [],
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── строка значения над таблицей (как строка формул в google): полный текст активной ячейки ──
  const activeRow = activeCell?.rowId ? rows.find((row) => row.id === activeCell.rowId) ?? null : null;
  const activeColumn = activeCell && activeCell.field !== DATE_KEY ? COLUMN_BY_KEY.get(activeCell.field) ?? null : null;
  const activeTitle = activeCell ? (activeCell.field === DATE_KEY ? 'Дата' : activeColumn?.title ?? '') : '';
  const activeValue = !activeCell
    ? ''
    : activeCell.field === DATE_KEY
      ? (activeRow ? formatDateFull(activeRow.orderDate) : '')
      : activeRow && activeColumn
        ? (activeColumn.field === 'driverName' ? (activeRow.driverName ?? '') : columnText(activeRow, activeColumn))
        : '';
  const formulaReadOnly = !activeCell
    || (activeCell.rowId ? !canEditField(activeCell.field) : !canManageRows)
    || activeCell.field === DATE_KEY
    || !activeColumn
    || activeColumn.kind === 'computed'
    || activeColumn.kind === 'checkbox';
  const [formulaDraft, setFormulaDraft] = useState('');
  const formulaFocusedRef = useRef(false);
  const formulaCancelRef = useRef(false);
  useEffect(() => {
    if (!formulaFocusedRef.current) setFormulaDraft(activeValue);
  }, [activeValue, activeCell]);

  const commitFormula = () => {
    formulaFocusedRef.current = false;
    // Escape: blur приходит с ещё старым черновиком — сохранять нечего
    if (formulaCancelRef.current) {
      formulaCancelRef.current = false;
      return;
    }
    if (formulaReadOnly || !activeCell || formulaDraft === activeValue) return;
    const patch = cellPatchFromText(activeCell.field, formulaDraft);
    if (!patch) return;
    if (!activeCell.rowId) {
      if (formulaDraft.trim()) void createRow(defaultNewDateRef.current, patch);
      return;
    }
    const current = rowsRef.current.find((row) => row.id === activeCell.rowId);
    if (!current) return;
    if (activeCell.field === 'driverName' || activeCell.field === 'vehiclePlate') {
      void saveCrewField(current, activeCell.field, String(Object.values(patch)[0] ?? ''));
    } else {
      patchRow(current.id, patch);
    }
  };

  const listOptions = (source: ListSource): string[] => {
    if (source === 'drivers') return driverOptions;
    if (source === 'vehicles') return vehicleOptions;
    return dictionaryOptions[source] ?? [];
  };

  /** Цвет значения из справочника реестра (водители и техника — без цвета). */
  const listColorOf = (
    source: ListSource,
  ): ((value: string) => { background?: string; color: string } | undefined) | undefined => {
    if (source === 'drivers' || source === 'vehicles') {
      if (!ownFleet) return undefined;
      return (value: string) => {
        if (!value.trim()) return undefined;
        const own = source === 'drivers' ? ownFleet.driverSurnames.has(surnameKey(value)) : ownFleet.plates.has(plateKey(value));
        if (!own) return FOREIGN_FLEET_COLORS;
        return source === 'drivers' ? OWN_DRIVER_COLORS : OWN_PLATE_COLORS;
      };
    }
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

  const checkboxNav = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const direction = navDirectionOf(event);
    if (!direction) return;
    event.preventDefault();
    requestCellNav(event.currentTarget, direction, event.shiftKey);
  };

  const renderColumnCell = (row: DispatcherOrderRow, column: ColumnDef) => {
    const key = column.field;
    const pin = pinStyle(key);
    const pinCls = `${pinClass(key)}${fillRange?.fields.has(key) && fillRange.ids.has(row.id) ? ' dj-fill-target' : ''}${activeCell?.rowId === row.id && activeCell.field === key ? ' dj-cell--active' : ''}${multiSelected && selectedKeys.has(cellKey(row.id, key)) ? ' dj-cell--selected' : ''}`;
    if (column.kind === 'status') {
      return (
        <td key={key} data-field={key} className={`dj-status-cell${pinCls}`} style={pin}>
          <ListCell
            value={row.status}
            options={statusNames}
            colorOf={statusColorOf}
            placeholder="статус…"
            strict
            readOnly={!canEditField('status')}
            onSave={(value) => patchRow(row.id, { status: value || null })}
          />
        </td>
      );
    }
    if (column.kind === 'checkbox') {
      return (
        <td key={key} data-field={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <input
            type="checkbox"
            className={`dj-check${column.accent ? ' dj-check--accent' : ''}${canEditField(column.field) ? '' : ' is-readonly'}`}
            style={column.accent ? { '--dj-check-accent': column.accent } as React.CSSProperties : undefined}
            checked={row[column.field]}
            aria-readonly={!canEditField(column.field) || undefined}
            onChange={(event) => {
              if (canEditField(column.field)) patchRow(row.id, { [column.field]: event.target.checked });
            }}
            onKeyDown={checkboxNav}
          />
        </td>
      );
    }
    if (column.kind === 'computed') {
      const isNumber = column.field === 'orderNumber';
      if (column.field === 'responsible') {
        return (
          <td
            key={key}
            data-field={key}
            className={`dj-computed-cell dj-responsible${pinCls}`}
            style={pin}
            title="Ответственный — кто завёл заявку"
            tabIndex={-1}
            onKeyDown={(event) => {
              const direction = navDirectionOf(event);
              if (!direction) return;
              event.preventDefault();
              requestCellNav(event.currentTarget, direction, event.shiftKey);
            }}
          >
            {row.responsible ?? ''}
          </td>
        );
      }
      const amount = amountWithoutVat(row.clientRate, row.passes, row.vat);
      return (
        <td
          key={key}
          data-field={key}
          className={`dj-computed-cell${isNumber ? ' dj-order-number' : ''}${pinCls}`}
          style={pin}
          title={isNumber ? '№ заказа — выдаётся при заведении и не меняется' : '(Ставка + Пропуска) без НДС'}
          tabIndex={-1}
          onKeyDown={(event) => {
            const direction = navDirectionOf(event);
            if (!direction) return;
            event.preventDefault();
            requestCellNav(event.currentTarget, direction, event.shiftKey);
          }}
        >
          {isNumber ? row.orderNumber ?? '' : formatFinance(amount)}
        </td>
      );
    }
    if (column.kind === 'time') {
      return (
        <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
          <TimeCell value={row.submitTime} readOnly={!canEditField('submitTime')} onSave={(value) => patchRow(row.id, { submitTime: value || null })} />
        </td>
      );
    }
    if (column.list) {
      const isCrewField = column.field === 'driverName' || column.field === 'vehiclePlate';
      return (
        <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
          <ListCell
            value={column.field === 'driverName' ? shortPersonName(row.driverName) : row[column.field]}
            options={listOptions(column.list)}
            colorOf={listColorOf(column.list)}
            normalize={column.field === 'driverName' ? shortPersonName : undefined}
            readOnly={!canEditField(column.field)}
            onSave={(value) => {
              if (isCrewField) void saveCrewField(row, column.field as 'driverName' | 'vehiclePlate', value);
              else patchRow(row.id, { [column.field]: value || null });
            }}
          />
        </td>
      );
    }
    return (
      <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
        <EditableCell
          value={row[column.field]}
          multiline={column.multiline}
          format={FINANCE_FIELDS.has(column.field) ? formatFinance : undefined}
          numeric={FINANCE_FIELDS.has(column.field)}
          readOnly={!canEditField(column.field)}
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
        <td key={key} data-field={key} className={`dj-status-cell${pinCls}`} style={pin}>
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
        <td key={key} data-field={key} className={`dj-checkbox-cell${pinCls}`} style={pin}>
          <input
            type="checkbox"
            className="dj-check"
            checked={false}
            onChange={(event) => { if (event.target.checked) void createRow(defaultNewDate, { [column.field]: true }); }}
            onKeyDown={checkboxNav}
          />
        </td>
      );
    }
    if (column.kind === 'computed') {
      return <td key={key} data-field={key} className={`dj-computed-cell${pinCls}`} style={pin} />;
    }
    if (column.kind === 'time') {
      return (
        <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
          <TimeCell value="" onSave={(value) => { if (value) void createRow(defaultNewDate, { submitTime: value }); }} />
        </td>
      );
    }
    if (column.list) {
      const isCrewField = column.field === 'driverName' || column.field === 'vehiclePlate';
      return (
        <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
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
      <td key={key} data-field={key} className={pinCls.trim()} style={pin}>
        <EditableCell
          value=""
          multiline={column.multiline}
          numeric={FINANCE_FIELDS.has(column.field)}
          onSave={(value) => { if (value) void createRow(defaultNewDate, { [column.field]: value }); }}
        />
      </td>
    );
  };

  /** Цвета, которые встречаются в колонке за месяц (для «Фильтровать по цвету»); без цветов — пусто. */
  const columnColorOptions = (field: string): ColumnColorOption[] => {
    const byKey = new Map<string, ColumnColorOption>();
    const labelsByKey = new Map<string, Set<string>>();
    rows.forEach((row) => {
      const key = cellColorKey(row, field);
      const raw = conditionText(row, field);
      if (raw) labelsByKey.set(key, (labelsByKey.get(key) ?? new Set()).add(raw));
      const entry = byKey.get(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      const colors = key === NO_COLOR_KEY
        ? null
        : field === 'status' ? statusColorOf(row.status ?? '') : listColorOf((COLUMN_BY_KEY.get(field) as { list: ListSource }).list)?.(raw);
      byKey.set(key, {
        key,
        background: colors?.background ?? null,
        color: colors?.color ?? '#5f6368',
        label: key === NO_COLOR_KEY ? 'Без цвета' : raw,
        count: 1,
      });
    });
    // одним цветом могут быть отмечены несколько значений — подписываем их вместе
    byKey.forEach((option) => {
      if (option.key === NO_COLOR_KEY) return;
      const labels = [...(labelsByKey.get(option.key) ?? [])];
      option.label = labels.slice(0, 3).join(', ') + (labels.length > 3 ? '…' : '');
    });
    const options = [...byKey.values()];
    if (!options.some((option) => option.key !== NO_COLOR_KEY)) return [];
    return options.sort((a, b) => (a.key === NO_COLOR_KEY ? 1 : 0) - (b.key === NO_COLOR_KEY ? 1 : 0) || b.count - a.count);
  };

  const accentOf = (key: string): string | undefined => {
    const column = COLUMN_BY_KEY.get(key);
    return column?.kind === 'checkbox' ? column.accent : undefined;
  };

  const headerCell = (key: string, title: string, width: number, resizable: boolean) => {
    const filtered = filteredFields.has(key);
    return (
      <th
        key={key}
        className={`${pinClass(key).trim()}${filtered ? ' dj-th--filtered' : ''}`}
        style={{ width, ...pinStyle(key) }}
      >
        <div className="dj-th">
          <button
            type="button"
            className="dj-sort-btn"
            title="Сортировка, фильтр, закрепление"
            style={accentOf(key) ? { color: accentOf(key) } : undefined}
            onClick={(event) => setFilterMenu({ field: key, anchor: event.currentTarget })}
          >
            <span>{title}</span>
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
  const renderBandLabel = (band: Extract<DisplayItem, { kind: 'band' }>) => {
    const { date } = band;
    const [year, month, day] = date.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
    const stats = { count: band.count, done: band.done };
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
      <Paper sx={{ px: 1.25, pt: 1, pb: 0.75 }}>
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
          <TextField
            size="small"
            label="Поиск"
            placeholder="КТК, клиент, водитель…"
            value={search}
            inputRef={searchInputRef}
            onChange={(event) => changeSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') changeSearch('');
            }}
            InputProps={{
              startAdornment: <Search sx={{ fontSize: 18, color: '#9aa3b0', mr: 0.5 }} />,
              endAdornment: search ? (
                <>
                  <span className="dj-search-count">{searchQuery ? displayRows.length : ''}</span>
                  <button type="button" className="dj-search-clear" aria-label="Очистить поиск" onClick={() => changeSearch('')}>×</button>
                </>
              ) : undefined,
            }}
            sx={{ width: 230 }}
          />
          <div className={`dj-formula${activeCell ? '' : ' dj-formula--idle'}`}>
            <div className="dj-formula__box">
              <span className="dj-formula__label" title={activeTitle}>
                {activeCell
                  ? `${activeTitle}${activeCell.rowId ? ` · стр. ${rowNumberById.get(activeCell.rowId) ?? '—'}` : ' · новая заявка'}`
                  : 'Значение ячейки'}
              </span>
              <textarea
                className="dj-formula__input"
                rows={1}
                value={formulaDraft}
                readOnly={formulaReadOnly}
                placeholder={activeCell ? (formulaReadOnly ? '' : 'пусто') : 'кликните в ячейку — здесь будет её полный текст'}
                onChange={(event) => setFormulaDraft(event.target.value)}
                onFocus={() => { formulaFocusedRef.current = true; }}
                onBlur={commitFormula}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    (event.target as HTMLTextAreaElement).blur();
                  } else if (event.key === 'Escape') {
                    formulaCancelRef.current = true;
                    setFormulaDraft(activeValue);
                    formulaFocusedRef.current = false;
                    (event.target as HTMLTextAreaElement).blur();
                  }
                }}
              />
            </div>
          </div>
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

      <div className="dj-table-area">
      {selectionSummary && (
        <div className="dj-selection-stats" aria-live="polite">
          <span>Выделено: <b>{selectionSummary.count}</b></span>
          {selectionSummary.filled !== selectionSummary.count && <span>Заполнено: <b>{selectionSummary.filled}</b></span>}
          {selectionSummary.sum !== null && <span>Сумма: <b>{selectionSummary.sum}</b></span>}
          {selectionSummary.average !== null && <span>Среднее: <b>{selectionSummary.average}</b></span>}
        </div>
      )}
      <div className="dj-table-wrap" ref={wrapRef} onScroll={handleWrapScroll}>
        {fillHandlePos && journalAccess !== 'view' && (
          <div
            className="dj-fill-handle"
            style={{ left: fillHandlePos.left, top: fillHandlePos.top }}
            title="Потяните вниз или вверх — скопировать значение; с Ctrl — ряд (1, 2, 3…, дата +1 день)"
            onMouseDown={startFill}
          />
        )}
        {stickyBand && showDayBands && (
          <div className="dj-sticky-band" style={{ top: headerHeight * zoom }} aria-hidden="true">
            <div className="dj-band__label dj-sticky-band__inner" style={{ width: wrapWidth / zoom, zoom }}>
              {renderBandLabel(stickyBand)}
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
          <tbody
            ref={tbodyRef}
            onFocus={(event) => {
              const cell = (event.target as HTMLElement).closest('td[data-field]') as HTMLElement | null;
              const rowElement = cell?.closest('tr') as HTMLElement | null;
              if (!cell || !rowElement) return;
              const next = { rowId: rowElement.dataset.rowId ?? null, field: cell.dataset.field ?? '' };
              setActiveCell((prev) => (prev?.rowId === next.rowId && prev?.field === next.field ? prev : next));
              // перешли в другую ячейку — выделение начинается с неё заново
              setCellSelection((prev) => (
                prev.anchor?.rowId === next.rowId && prev.anchor?.field === next.field && !prev.focus && !prev.extra.length
                  ? prev
                  : { anchor: next.rowId ? { rowId: next.rowId, field: next.field } : null, focus: null, extra: [] }
              ));
            }}
            onMouseDownCapture={(event) => {
              if (event.button !== 0) return;
              const cell = (event.target as HTMLElement).closest('td[data-field]') as HTMLElement | null;
              const rowElement = cell?.closest('tr') as HTMLElement | null;
              const rowId = rowElement?.dataset.rowId;
              if (!cell || !rowId) return;
              const ref = { rowId, field: cell.dataset.field ?? '' };
              const withMeta = event.ctrlKey || event.metaKey;
              if (!event.shiftKey && !withMeta) {
                const current = cellSelectionRef.current;
                if (current.focus || current.extra.length) setCellSelection({ anchor: ref, focus: null, extra: [] });
                return;
              }
              if ((event.target as HTMLElement).closest('.is-editing')) return;
              // фокус остаётся на активной ячейке — от неё и строится выделение
              event.preventDefault();
              const active = activeCellRef.current;
              const base = active?.rowId ? { rowId: active.rowId, field: active.field } : ref;
              if (event.shiftKey) {
                setCellSelection((prev) => ({ anchor: prev.anchor ?? base, focus: ref, extra: withMeta ? prev.extra : [] }));
                return;
              }
              const keys = new Set(selectedKeysRef.current.size ? selectedKeysRef.current : [cellKey(base.rowId, base.field)]);
              const key = cellKey(ref.rowId, ref.field);
              if (keys.has(key)) keys.delete(key);
              else keys.add(key);
              setCellSelection((prev) => ({ anchor: prev.anchor ?? base, focus: null, extra: [...keys] }));
            }}
            onKeyDownCapture={(event) => {
              if (selectedKeysRef.current.size <= 1 || editingField(event.target)) return;
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                clearSelectedCells();
                return;
              }
              // начали править активную ячейку — выделение снимается (как в google)
              if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'F2' || isPrintableKey(event)) {
                setCellSelection((prev) => ({ anchor: prev.anchor, focus: null, extra: [] }));
              }
            }}
          >
            {windowStart > 0 && (
              <tr className="dj-spacer" aria-hidden="true"><td colSpan={visibleColumns.length + 3} style={{ height: itemOffsets[windowStart] }} /></tr>
            )}
            {windowItems.map((item) => {
              if (item.kind === 'band') {
                return (
                  <tr key={item.key} className="dj-band">
                    <td colSpan={visibleColumns.length + 3}>
                      <div className="dj-band__label">{renderBandLabel(item)}</div>
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
                  data-row-id={row.id}
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
                    // на Mac Ctrl+клик — это выделение ячейки, а не меню строки
                    if (event.ctrlKey && /Mac/i.test(navigator.platform)) return;
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
                        : 'Клик — выделить строку. Чтобы перетаскивать строки, сбросьте фильтры и поиск',
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
                    <span className="dj-rownum__num">{rowNumberById.get(row.id) ?? index + 1}</span>
                    {canDragRows && <DragIndicator className="dj-rownum__grip" sx={{ fontSize: 16 }} />}
                  </td>
                  <td
                    data-field={DATE_KEY}
                    className={`dj-date-cell${pinClass(DATE_KEY)}${fillRange?.fields.has(DATE_KEY) && fillRange.ids.has(row.id) ? ' dj-fill-target' : ''}${activeCell?.rowId === row.id && activeCell.field === DATE_KEY ? ' dj-cell--active' : ''}${multiSelected && selectedKeys.has(cellKey(row.id, DATE_KEY)) ? ' dj-cell--selected' : ''}`}
                    style={pinStyle(DATE_KEY)}
                  >
                    <DateCell
                      value={row.orderDate}
                      readOnly={!canManageRows}
                      onPick={(next) => {
                        patchRow(row.id, { orderDate: next });
                        if (next < rangeRef.current.from || next > rangeRef.current.to) {
                          setMessage({ severity: 'success', text: `Заявка перенесена на ${formatDateShort(next)}` });
                        }
                      }}
                    />
                  </td>
                  {visibleColumns.map((column) => renderColumnCell(row, column))}
                  <td className="dj-checkbox-cell">
                    {canManageRows && (
                      <button
                        type="button"
                        className="dj-delete-btn"
                        title="Удалить строку"
                        onClick={() => void deleteRow(row)}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {windowEnd < displayItems.length && (
              <tr className="dj-spacer" aria-hidden="true">
                <td colSpan={visibleColumns.length + 3} style={{ height: totalItemsHeight - itemOffsets[windowEnd] }} />
              </tr>
            )}
            {canManageRows && <tr key={`ghost-${ghostKey}`} className="dj-row--ghost dj-row--day-start">
              <td
                className={`dj-rownum dj-rownum--add${pinClass('__rownum')}`}
                style={pinStyle('__rownum')}
                title="Добавить пустую строку"
                onClick={() => void addBlankRow(defaultNewDate)}
              >
                ＋
              </td>
              <td data-field={DATE_KEY} className={`dj-date-cell${pinClass(DATE_KEY)}`} style={pinStyle(DATE_KEY)}>
                <DateCell
                  value={defaultNewDate}
                  title="Двойной клик — выбрать дату, заявка создастся сразу"
                  onPick={(next) => void createRow(next)}
                />
              </td>
              {visibleColumns.map((column) => renderGhostCell(column))}
              <td />
            </tr>}
          </tbody>
        </table>
        {!rows.length && !loading && (
          <div className="dj-empty">{canManageRows ? 'В этом месяце заявок нет — начните заполнять нижнюю строку, она создастся сама' : 'В этом месяце заявок нет'}</div>
        )}
        {rows.length > 0 && !displayRows.length && (
          <div className="dj-empty">
            {searchQuery ? `По запросу «${search.trim()}» в этом месяце ничего не найдено` : 'Все заявки скрыты фильтрами — «Настройки» → «Сбросить фильтры»'}
          </div>
        )}
      </div>
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
              top: Math.min(contextMenu.y, window.innerHeight - 250),
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
            {canManageRows && (
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
            )}
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
            <div className="dj-context-sep" />
            <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void copyFromMenu(current);
              }}
            >
              Копировать<span className="dj-context-hint">Ctrl+C</span>
            </button>
            {canManageRows && (
              <button
                type="button"
                className="dj-context-item"
                onClick={() => {
                  const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                  setContextMenu(null);
                  void pasteFromMenu(current);
                }}
              >
                Вставить<span className="dj-context-hint">Ctrl+V</span>
              </button>
            )}
            {canManageRows && <div className="dj-context-sep" />}
            {canManageRows && <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void insertRowNear(current, false);
              }}
            >
              Добавить строку выше
            </button>}
            {canManageRows && <button
              type="button"
              className="dj-context-item"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void insertRowNear(current, true);
              }}
            >
              Добавить строку ниже
            </button>}
            {(canManageRows || canViewHistory) && <div className="dj-context-sep" />}
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
            {canManageRows && <button
              type="button"
              className="dj-context-item danger"
              onClick={() => {
                const current = rowsRef.current.find((item) => item.id === contextMenu.row.id) ?? contextMenu.row;
                setContextMenu(null);
                void deleteRow(current);
              }}
            >
              Удалить
            </button>}
          </div>
        </div>
      )}

      {filterMenu && (
        <ColumnFilterPopover
          anchorEl={filterMenu.anchor}
          title={filterMenuTitle}
          values={rows.map((row) => filterText(row, filterMenu.field))}
          hidden={filters[filterMenu.field] ?? []}
          conditionKind={filterMenu.field === DATE_KEY
            ? 'date'
            : COLUMN_BY_KEY.get(filterMenu.field)?.kind === 'checkbox' ? 'none' : 'text'}
          condition={conditions[filterMenu.field] ?? null}
          colorOptions={columnColorOptions(filterMenu.field)}
          color={colorFilters[filterMenu.field] ?? null}
          isPinnedUntilHere={pinnedUntil === filterMenu.field}
          onSort={(direction) => sortOnce(filterMenu.field, direction)}
          onApply={(value) => applyColumnFilter(filterMenu.field, value)}
          onTogglePin={() => setPinnedUntil((prev) => (prev === filterMenu.field ? null : filterMenu.field))}
          align={alignOf(filterMenu.field)}
          onAlign={(value) => setColumnAligns((prev) => ({ ...prev, [filterMenu.field]: value }))}
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
        <MenuItem
          disabled={activeFilterCount === 0}
          onClick={() => {
            resetAllFilters();
            setSettingsAnchor(null);
          }}
        >
          <ListItemIcon><FilterListOff fontSize="small" /></ListItemIcon>
          <ListItemText primary="Сбросить фильтры" />
        </MenuItem>
        <MenuItem
          disabled={!personalSort}
          onClick={() => {
            resetPersonalSort();
            setSettingsAnchor(null);
          }}
        >
          <ListItemIcon><SwapVert fontSize="small" /></ListItemIcon>
          <ListItemText primary="Вернуть общий порядок" secondary={personalSort ? 'сейчас у вас своя сортировка' : undefined} />
        </MenuItem>
        <MenuItem
          disabled={exporting}
          onClick={() => {
            setSettingsAnchor(null);
            setExporting(true);
            setMessage({ severity: 'success', text: 'Готовим Excel со всеми месяцами…' });
            downloadDispatcherJournalExcel()
              .then(({ blob, filename }) => downloadBlob(blob, filename))
              .then(() => setMessage({ severity: 'success', text: 'Excel скачан: лист на каждый месяц' }))
              .catch(() => setMessage({ severity: 'error', text: 'Не удалось скачать Excel' }))
              .finally(() => setExporting(false));
          }}
        >
          <ListItemIcon><FileDownload fontSize="small" /></ListItemIcon>
          <ListItemText primary="Скачать Excel (все месяцы)" />
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

      {alignCss && <style>{alignCss}</style>}
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />

      <Dialog open={Boolean(pastePrompt)} onClose={() => setPastePrompt(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3, width: 480, maxWidth: 'calc(100% - 32px)' } }}>
        <DialogTitle sx={{ pb: 1, px: 3, fontWeight: 600 }}>Вставить {pastePrompt?.count} строк</DialogTitle>
        <DialogContent sx={{ fontSize: 14, color: '#3d4757', px: 3 }}>
          Ниже уже есть заявки или начинается другой день. Вставить новыми строками под выбранной
          (с её датой) или заменить значения в следующих строках?
        </DialogContent>
        <DialogActions
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.3fr)',
            gap: 1,
            px: 3,
            pb: 2.5,
            '& > :not(style) ~ :not(style)': { ml: 0 },
            '& .MuiButton-root': { textTransform: 'none', fontSize: 14, fontWeight: 600, py: 0.9, whiteSpace: 'nowrap' },
          }}
        >
          <Button variant="outlined" color="inherit" sx={{ color: '#4b5563', borderColor: '#d1d5db' }} onClick={() => setPastePrompt(null)}>
            Отмена
          </Button>
          <Button
            variant="outlined"
            color="warning"
            onClick={() => {
              pastePrompt?.replace();
              setPastePrompt(null);
            }}
          >
            Заменить
          </Button>
          <Button
            variant="contained"
            disableElevation
            autoFocus
            onClick={() => {
              pastePrompt?.insert();
              setPastePrompt(null);
            }}
          >
            Новыми строками
          </Button>
        </DialogActions>
      </Dialog>

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
        canEditColors={canEditDictionaryColors}
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
            if (!column || (hideFinance && DISPATCHER_FINANCE_COLUMNS.has(key))) return null;
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
