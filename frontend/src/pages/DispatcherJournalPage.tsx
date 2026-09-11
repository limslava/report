import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  IconButton,
  Popover,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DragIndicator, KeyboardArrowDown, KeyboardArrowUp, Settings } from '@mui/icons-material';
import {
  createDispatcherOrder,
  deleteDispatcherOrder,
  getDispatcherOrders,
  getDispatcherStatuses,
  updateDispatcherOrder,
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

/** Парсинг даты из буфера обмена: 01.09.2026 / 01.09 / 2026-09-01. */
const parseClipboardDate = (raw: string, fallbackMonth: string): string | null => {
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  let match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (match) return `${match[3]}-${pad2(Number(match[2]))}-${pad2(Number(match[1]))}`;
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
  | 'submitTime' | 'deliveryAddress' | 'terminalTo' | 'slotTo' | 'pinTo'
  | 'driverRate' | 'vat' | 'clientRate' | 'passes' | 'extraAddress' | 'demurrage'
  | 'extraTon' | 'seal' | 'driverRemarks';

type BooleanFieldName = 'orderOnVehicle' | 'invoiceSent' | 'recoupling';

type ColumnDef =
  | { kind: 'status'; field: 'status'; title: string; width: number }
  | { kind: 'text'; field: TextFieldName; title: string; width: number; multiline?: boolean; listId?: string }
  | { kind: 'checkbox'; field: BooleanFieldName; title: string; width: number };

/**
 * Все колонки журнала (порядок — как в google-таблице отдела). Видимость и
 * порядок настраиваются пользователем; фиксированы только номер строки,
 * дата и кнопка удаления.
 */
const ALL_COLUMNS: ColumnDef[] = [
  { kind: 'status', field: 'status', title: 'Статус', width: 130 },
  { kind: 'text', field: 'info', title: 'Инфо', width: 70 },
  { kind: 'text', field: 'client', title: 'Клиент', width: 120 },
  { kind: 'text', field: 'driverName', title: 'ФИО водителя', width: 120, listId: 'dj-drivers' },
  { kind: 'text', field: 'vehiclePlate', title: 'Гос номер', width: 90, listId: 'dj-vehicles' },
  { kind: 'text', field: 'ktkNumber', title: '№ КТК', width: 105 },
  { kind: 'text', field: 'ktkType', title: 'Тип', width: 42 },
  { kind: 'text', field: 'grossWeight', title: 'Вес (брутто)', width: 80 },
  { kind: 'text', field: 'comments', title: 'Комментарии', width: 140, multiline: true },
  { kind: 'text', field: 'operation', title: 'Операция', width: 90, listId: 'dj-operations' },
  { kind: 'text', field: 'terminalFrom', title: 'Терминал постановки', width: 150, multiline: true },
  { kind: 'text', field: 'slotFrom', title: 'Слот', width: 60 },
  { kind: 'text', field: 'pinFrom', title: 'Пин', width: 58 },
  { kind: 'text', field: 'submitTime', title: 'Время подачи', width: 66 },
  { kind: 'text', field: 'deliveryAddress', title: 'Адрес доставки', width: 170, multiline: true },
  { kind: 'text', field: 'terminalTo', title: 'Терминал снятия', width: 150, multiline: true },
  { kind: 'text', field: 'slotTo', title: 'Слот снятия', width: 60 },
  { kind: 'text', field: 'pinTo', title: 'Пин снятия', width: 58 },
  { kind: 'text', field: 'driverRate', title: 'Ставка водителя', width: 70 },
  { kind: 'text', field: 'vat', title: 'НДС', width: 70, listId: 'dj-vat' },
  { kind: 'text', field: 'clientRate', title: 'Ставка', width: 70 },
  { kind: 'text', field: 'passes', title: 'Пропуска', width: 70 },
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

const OPERATION_SUGGESTIONS = ['выгрузка', 'погрузка', 'перемещение', 'вывоз'];
const VAT_SUGGESTIONS = ['НДС22%', 'без НДС'];

type EditableCellProps = {
  value: string | null;
  multiline?: boolean;
  listId?: string;
  onSave: (value: string) => void;
};

function EditableCell({ value, multiline, listId, onSave }: EditableCellProps) {
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
      list={listId}
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

export default function DispatcherJournalPage() {
  const { user } = useAuthStore();
  const [month, setMonth] = useState<string>(currentMonth());
  const [rows, setRows] = useState<DispatcherOrderRow[]>([]);
  const [statuses, setStatuses] = useState<DispatcherStatusOption[]>([]);
  const [driverOptions, setDriverOptions] = useState<string[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [ghostKey, setGhostKey] = useState(0);
  const reloadTimerRef = useRef<number | null>(null);
  const monthRef = useRef(month);
  monthRef.current = month;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectedRowIdRef = useRef(selectedRowId);
  selectedRowIdRef.current = selectedRowId;

  // дата новых строк: сегодня, если открыт текущий месяц, иначе 1-е число
  const defaultNewDate = month === currentMonth() ? todayYmd() : `${month}-01`;

  // настройка колонок (видимость + порядок), на пользователя — как в справочниках
  const columnsStorageKey = `dj-columns-v1:${user?.id ?? 'anonymous'}`;
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs | undefined>(() =>
    loadSortState<ColumnPrefs | undefined>(columnsStorageKey, undefined)
  );
  useEffect(() => saveSortState(columnsStorageKey, columnPrefs), [columnsStorageKey, columnPrefs]);
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const dragColumnKey = useRef<string | null>(null);
  const visibleColumns = useMemo(
    () => applyColumnPrefs(ALL_COLUMN_KEYS, NO_DEFAULT_HIDDEN, columnPrefs)
      .map((key) => COLUMN_BY_KEY.get(key))
      .filter((column): column is ColumnDef => Boolean(column)),
    [columnPrefs],
  );
  const visibleColumnsRef = useRef(visibleColumns);
  visibleColumnsRef.current = visibleColumns;

  // сортировка по заголовкам: asc -> desc -> исходный порядок (по датам)
  const sortStorageKey = `dj-sort-v1:${user?.id ?? 'anonymous'}`;
  const [sort, setSort] = useState<TableSortState>(() => loadSortState<TableSortState>(sortStorageKey, null));
  useEffect(() => saveSortState(sortStorageKey, sort), [sortStorageKey, sort]);
  const sortValue = useCallback((row: DispatcherOrderRow, field: string): unknown => {
    if (field === 'orderDate') return row.orderDate;
    const column = COLUMN_BY_KEY.get(field);
    if (!column) return '';
    if (column.kind === 'checkbox') return row[column.field] ? 1 : '';
    return row[column.field] ?? '';
  }, []);
  const displayRows = useMemo(() => applySort(rows, sort, sortValue), [rows, sort, sortValue]);
  const sortHeader = (field: string, label: string) => (
    <button type="button" className="dj-sort-btn" onClick={() => setSort((prev) => cycleSort(prev, field))}>
      <span>{label}</span>
      <span className={`dj-sort-ind is-${sortIndicator(sort, field)}`} aria-hidden="true" />
    </button>
  );

  const statusByName = useMemo(() => {
    const map = new Map<string, DispatcherStatusOption>();
    statuses.forEach((status) => map.set(status.name, status));
    return map;
  }, [statuses]);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const loadRows = useCallback(async (targetMonth: string, withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const { data } = await getDispatcherOrders(targetMonth);
      if (monthRef.current === targetMonth) setRows(data);
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось загрузить журнал' });
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(month, true);
  }, [month, loadRows]);

  useEffect(() => {
    getDispatcherStatuses()
      .then((response) => setStatuses(response.data))
      .catch(() => setMessage({ severity: 'error', text: 'Не удалось загрузить статусы' }));
    getDirectoryOptions('vvo')
      .then((response) => {
        setDriverOptions(response.data.employees.map((employee) => employee.fullName));
        setVehicleOptions(response.data.vehicles);
      })
      .catch(() => undefined);
  }, []);

  // realtime: другие диспетчера меняют журнал — подтягиваем изменения
  useEffect(() => {
    const unsubscribe = subscribePlansRealtime((payload) => {
      const event = payload as { type?: string; date?: string };
      if (event?.type !== 'dispatcher-journal:updated') return;
      if (!event.date?.startsWith(monthRef.current)) return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        void loadRows(monthRef.current);
      }, 250);
    });
    return () => {
      unsubscribe();
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
  }, [loadRows]);

  const sortByDate = (list: DispatcherOrderRow[]): DispatcherOrderRow[] =>
    [...list].sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  const patchRow = useCallback((id: string, patch: DispatcherOrderPatch) => {
    setRows((prev) => sortByDate(prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
      .filter((row) => row.orderDate.startsWith(monthRef.current))));
    updateDispatcherOrder(id, patch).catch(() => {
      setMessage({ severity: 'error', text: 'Не удалось сохранить изменение' });
      void loadRows(monthRef.current);
    });
  }, [loadRows]);

  const createRow = useCallback(async (orderDate: string, initial?: DispatcherOrderPatch) => {
    try {
      const { data } = await createDispatcherOrder(orderDate, initial);
      if (orderDate.startsWith(monthRef.current)) {
        setRows((prev) => sortByDate([...prev, data]));
      }
      setGhostKey((prev) => prev + 1);
      return data;
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось добавить строку' });
      return null;
    }
  }, []);

  const deleteRow = useCallback(async (row: DispatcherOrderRow, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      const label = [row.ktkNumber, row.client].filter(Boolean).join(', ');
      if (!window.confirm(`Удалить строку${label ? ` (${label})` : ''}?`)) return;
    }
    try {
      await deleteDispatcherOrder(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (selectedRowIdRef.current === row.id) setSelectedRowId(null);
    } catch {
      setMessage({ severity: 'error', text: 'Не удалось удалить строку' });
    }
  }, []);

  // ── Excel-обмен: выделение строки, Ctrl+C / Ctrl+X / Ctrl+V ──
  const rowToTsv = useCallback((row: DispatcherOrderRow): string => {
    const cells: string[] = [
      `${formatDateShort(row.orderDate)}.${row.orderDate.slice(0, 4)}`,
    ];
    visibleColumnsRef.current.forEach((column) => {
      if (column.kind === 'checkbox') cells.push(row[column.field] ? 'да' : '');
      else cells.push((row[column.field] ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
    });
    return cells.join('\t');
  }, []);

  const applyTsvLine = useCallback((line: string): { date: string; patch: DispatcherOrderPatch } => {
    const cells = line.split('\t');
    const parsedDate = parseClipboardDate(cells[0] ?? '', monthRef.current);
    const patch: DispatcherOrderPatch = {};
    visibleColumnsRef.current.forEach((column, index) => {
      const raw = cells[index + 1];
      if (raw == null) return;
      if (column.kind === 'checkbox') {
        patch[column.field] = TRUE_WORDS.has(raw.trim().toLowerCase());
      } else if (column.kind === 'status') {
        const trimmed = raw.trim();
        const exact = statusesRef.current.find((status) => status.name.toLowerCase() === trimmed.toLowerCase());
        patch.status = exact?.name ?? (trimmed || null);
      } else {
        patch[column.field] = raw.trim() || null;
      }
    });
    const fallbackDate = monthRef.current === currentMonth() ? todayYmd() : `${monthRef.current}-01`;
    return { date: parsedDate ?? fallbackDate, patch };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedRowId(null);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const isCopy = key === 'c' || key === 'с';
      const isCut = key === 'x' || key === 'ч';
      const isPaste = key === 'v' || key === 'м';
      if (!isCopy && !isCut && !isPaste) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const selected = rowsRef.current.find((row) => row.id === selectedRowIdRef.current) ?? null;

      if ((isCopy || isCut) && selected) {
        event.preventDefault();
        navigator.clipboard.writeText(rowToTsv(selected)).then(() => {
          if (isCut) {
            void deleteRow(selected, { silent: true });
            setMessage({ severity: 'success', text: 'Строка вырезана в буфер' });
          } else {
            setMessage({ severity: 'success', text: 'Строка скопирована в буфер' });
          }
        }).catch(() => setMessage({ severity: 'error', text: 'Нет доступа к буферу обмена' }));
        return;
      }

      if (isPaste) {
        event.preventDefault();
        navigator.clipboard.readText().then(async (text) => {
          const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
          if (!lines.length) return;
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
        }).catch(() => setMessage({ severity: 'error', text: 'Нет доступа к буферу обмена — разрешите чтение буфера' }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyTsvLine, createRow, deleteRow, patchRow, rowToTsv]);

  const renderColumnCell = (row: DispatcherOrderRow, column: ColumnDef) => {
    if (column.kind === 'status') {
      return (
        <td key={column.field} className="dj-status-cell">
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
        <td key={column.field} className="dj-checkbox-cell">
          <Checkbox
            size="small"
            sx={{ p: 0.25 }}
            checked={row[column.field]}
            onChange={(event) => patchRow(row.id, { [column.field]: event.target.checked })}
          />
        </td>
      );
    }
    return (
      <td key={column.field}>
        <EditableCell
          value={row[column.field]}
          multiline={column.multiline}
          listId={column.listId}
          onSave={(value) => patchRow(row.id, { [column.field]: value || null })}
        />
      </td>
    );
  };

  // «призрачная» строка: начал заполнять — заявка создаётся сама
  const renderGhostCell = (column: ColumnDef) => {
    if (column.kind === 'status') {
      return (
        <td key={column.field} className="dj-status-cell">
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
        <td key={column.field} className="dj-checkbox-cell">
          <Checkbox
            size="small"
            sx={{ p: 0.25 }}
            checked={false}
            onChange={(event) => { if (event.target.checked) void createRow(defaultNewDate, { [column.field]: true }); }}
          />
        </td>
      );
    }
    return (
      <td key={column.field}>
        <EditableCell
          value=""
          multiline={column.multiline}
          listId={column.listId}
          onSave={(value) => { if (value) void createRow(defaultNewDate, { [column.field]: value }); }}
        />
      </td>
    );
  };

  let previousDate: string | null = null;

  return (
    <Box className="dj-page">
      <Box className="dj-toolbar">
        <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 650 }}>
          Диспетчерская — КТК Владивосток
        </Typography>
        <TextField
          type="month"
          size="small"
          value={month}
          onChange={(event) => setMonth(event.target.value || currentMonth())}
          sx={{ width: 150 }}
        />
        <Button size="small" onClick={() => setMonth(currentMonth())} disabled={month === currentMonth()}>
          Текущий месяц
        </Button>
        <Button size="small" variant="contained" onClick={() => void createRow(defaultNewDate)}>
          Добавить заявку
        </Button>
        <span className="dj-toolbar__spacer" />
        <span className="dj-toolbar__hint">
          {loading
            ? 'Загрузка…'
            : `Заявок: ${rows.length} · автосохранение · № строки → Ctrl+C/X/V для работы с Excel`}
        </span>
        <Tooltip title="Настроить колонки">
          <IconButton size="small" onClick={(event) => setColumnsAnchor(event.currentTarget)}>
            <Settings sx={{ fontSize: 20, color: '#6b7280' }} />
          </IconButton>
        </Tooltip>
      </Box>

      <datalist id="dj-drivers">
        {driverOptions.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="dj-vehicles">
        {vehicleOptions.map((plate) => <option key={plate} value={plate} />)}
      </datalist>
      <datalist id="dj-operations">
        {OPERATION_SUGGESTIONS.map((operation) => <option key={operation} value={operation} />)}
      </datalist>
      <datalist id="dj-vat">
        {VAT_SUGGESTIONS.map((vat) => <option key={vat} value={vat} />)}
      </datalist>

      <div className="dj-table-wrap">
        <table className="dj-table">
          <thead>
            <tr>
              <th className="dj-rownum-head" aria-label="Номер строки">№</th>
              <th style={{ minWidth: 84 }}>{sortHeader('orderDate', 'Дата')}</th>
              {visibleColumns.map((column) => (
                <th key={column.field} style={{ minWidth: column.width }}>{sortHeader(column.field, column.title)}</th>
              ))}
              <th aria-label="Удаление" />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const dayStart = !sort && row.orderDate !== previousDate;
              previousDate = row.orderDate;
              return (
                <tr
                  key={row.id}
                  className={`${dayStart ? 'dj-row--day-start' : ''}${selectedRowId === row.id ? ' dj-row--selected' : ''}`}
                >
                  <td
                    className="dj-rownum"
                    title="Клик — выделить строку (Ctrl+C — копировать, Ctrl+X — вырезать, Ctrl+V — вставить)"
                    onClick={() => setSelectedRowId((prev) => (prev === row.id ? null : row.id))}
                  >
                    {index + 1}
                  </td>
                  <td className="dj-date-cell">
                    <input
                      type="date"
                      className="dj-date-input"
                      value={row.orderDate}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (!next) return;
                        patchRow(row.id, { orderDate: next });
                        if (!next.startsWith(month)) {
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
              <td className="dj-rownum">＋</td>
              <td className="dj-date-cell">
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
      </div>

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
            Отметьте нужные и перетащите для порядка
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Button size="small" onClick={() => setColumnPrefs(undefined)}>
              Сбросить
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
