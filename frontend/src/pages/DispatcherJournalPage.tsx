import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  IconButton,
  MenuItem,
  Popover,
  Select,
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
import { loadSortState, saveSortState } from '../utils/tableSort';
import {
  applyColumnPrefs,
  isHidden,
  moveColumnTo,
  orderedKeys,
  toggleHidden,
  type ColumnPrefs,
} from '../utils/tableColumns';
import '../styles/dispatcher-journal.css';

const todayYmd = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

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
  | { kind: 'text'; field: TextFieldName; title: string; width: number; multiline?: boolean; listId?: string }
  | { kind: 'checkbox'; field: BooleanFieldName; title: string; width: number };

/**
 * Все колонки журнала (порядок — как в google-таблице отдела). Пользователь
 * может скрывать и переставлять их (кнопка настройки, как в справочниках);
 * колонка «Статус» и кнопка удаления — фиксированные.
 */
const ALL_COLUMNS: ColumnDef[] = [
  { kind: 'text', field: 'info', title: 'Инфо', width: 90 },
  { kind: 'text', field: 'client', title: 'Клиент', width: 150 },
  { kind: 'text', field: 'driverName', title: 'ФИО водителя', width: 150, listId: 'dj-drivers' },
  { kind: 'text', field: 'vehiclePlate', title: 'Гос номер', width: 110, listId: 'dj-vehicles' },
  { kind: 'text', field: 'ktkNumber', title: '№ КТК', width: 120 },
  { kind: 'text', field: 'ktkType', title: 'Тип', width: 55 },
  { kind: 'text', field: 'grossWeight', title: 'Вес (брутто)', width: 100 },
  { kind: 'text', field: 'comments', title: 'Комментарии', width: 180, multiline: true },
  { kind: 'text', field: 'operation', title: 'Операция', width: 110, listId: 'dj-operations' },
  { kind: 'text', field: 'terminalFrom', title: 'Терминал постановки', width: 200, multiline: true },
  { kind: 'text', field: 'slotFrom', title: 'Слот', width: 80 },
  { kind: 'text', field: 'pinFrom', title: 'Пин', width: 70 },
  { kind: 'text', field: 'submitTime', title: 'Время подачи', width: 90 },
  { kind: 'text', field: 'deliveryAddress', title: 'Адрес доставки', width: 220, multiline: true },
  { kind: 'text', field: 'terminalTo', title: 'Терминал снятия', width: 200, multiline: true },
  { kind: 'text', field: 'slotTo', title: 'Слот снятия', width: 80 },
  { kind: 'text', field: 'pinTo', title: 'Пин снятия', width: 70 },
  { kind: 'text', field: 'driverRate', title: 'Ставка водителя', width: 90 },
  { kind: 'text', field: 'vat', title: 'НДС', width: 90, listId: 'dj-vat' },
  { kind: 'text', field: 'clientRate', title: 'Ставка', width: 90 },
  { kind: 'text', field: 'passes', title: 'Пропуска', width: 90 },
  { kind: 'text', field: 'extraAddress', title: 'Доп адрес', width: 160, multiline: true },
  { kind: 'text', field: 'demurrage', title: 'Простой/руб', width: 90 },
  { kind: 'checkbox', field: 'orderOnVehicle', title: 'Заказ на ТС', width: 70 },
  { kind: 'checkbox', field: 'invoiceSent', title: 'Отправка счета', width: 70 },
  { kind: 'text', field: 'extraTon', title: 'Доп тонна', width: 90 },
  { kind: 'text', field: 'seal', title: 'Пломба', width: 90 },
  { kind: 'checkbox', field: 'recoupling', title: 'Перецеп', width: 60 },
  { kind: 'text', field: 'driverRemarks', title: 'Замечания к водителю', width: 180, multiline: true },
];

const ALL_COLUMN_KEYS = ALL_COLUMNS.map((column) => column.field);
const COLUMN_BY_KEY = new Map(ALL_COLUMNS.map((column) => [column.field, column]));
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

export default function DispatcherJournalPage() {
  const { user } = useAuthStore();
  const [date, setDate] = useState<string>(todayYmd());
  const [rows, setRows] = useState<DispatcherOrderRow[]>([]);
  const [statuses, setStatuses] = useState<DispatcherStatusOption[]>([]);
  const [driverOptions, setDriverOptions] = useState<string[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

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
      .map((key) => COLUMN_BY_KEY.get(key as TextFieldName | BooleanFieldName)!)
      .filter(Boolean),
    [columnPrefs],
  );

  const statusByName = useMemo(() => {
    const map = new Map<string, DispatcherStatusOption>();
    statuses.forEach((status) => map.set(status.name, status));
    return map;
  }, [statuses]);

  const loadRows = useCallback(async (targetDate: string, withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const { data } = await getDispatcherOrders(targetDate);
      if (dateRef.current === targetDate) setRows(data);
    } catch {
      setError('Не удалось загрузить журнал');
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(date, true);
  }, [date, loadRows]);

  useEffect(() => {
    getDispatcherStatuses()
      .then((response) => setStatuses(response.data))
      .catch(() => setError('Не удалось загрузить статусы'));
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
      if (event.date !== dateRef.current) return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        void loadRows(dateRef.current);
      }, 250);
    });
    return () => {
      unsubscribe();
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
  }, [loadRows]);

  const patchRow = useCallback((id: string, patch: DispatcherOrderPatch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    updateDispatcherOrder(id, patch).catch(() => {
      setError('Не удалось сохранить изменение');
      void loadRows(dateRef.current);
    });
  }, [loadRows]);

  const handleAddRow = async () => {
    try {
      const { data } = await createDispatcherOrder(date);
      setRows((prev) => [...prev, data]);
    } catch {
      setError('Не удалось добавить строку');
    }
  };

  const handleDeleteRow = async (row: DispatcherOrderRow) => {
    const label = [row.ktkNumber, row.client].filter(Boolean).join(', ');
    if (!window.confirm(`Удалить строку${label ? ` (${label})` : ''}?`)) return;
    try {
      await deleteDispatcherOrder(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch {
      setError('Не удалось удалить строку');
    }
  };

  const renderStatusValue = (name: string) => {
    const status = statusByName.get(name);
    if (!status) return name || '—';
    return (
      <span className="dj-status-chip" style={{ background: status.color, color: textColorFor(status.color) }}>
        {status.name}
      </span>
    );
  };

  const renderColumnCell = (row: DispatcherOrderRow, column: ColumnDef) => {
    if (column.kind === 'checkbox') {
      return (
        <td key={column.field} className="dj-checkbox-cell">
          <Checkbox
            size="small"
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

  return (
    <Box className="dj-page">
      <Box className="dj-toolbar">
        <Typography variant="h6" sx={{ fontSize: 17, fontWeight: 650 }}>
          Диспетчерская — КТК Владивосток
        </Typography>
        <TextField
          type="date"
          size="small"
          value={date}
          onChange={(event) => setDate(event.target.value || todayYmd())}
          sx={{ width: 160 }}
        />
        <Button size="small" onClick={() => setDate(todayYmd())} disabled={date === todayYmd()}>
          Сегодня
        </Button>
        <Button size="small" variant="contained" onClick={handleAddRow}>
          Добавить заявку
        </Button>
        <span className="dj-toolbar__spacer" />
        <span className="dj-toolbar__hint">
          {loading ? 'Загрузка…' : `Заявок: ${rows.length} · изменения сохраняются сразу и видны всем`}
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
              <th style={{ minWidth: 160 }}>Статус</th>
              {visibleColumns.map((column) => (
                <th key={column.field} style={{ minWidth: column.width }}>{column.title}</th>
              ))}
              <th aria-label="Удаление" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Select
                    className="dj-status-select"
                    size="small"
                    variant="standard"
                    disableUnderline
                    fullWidth
                    displayEmpty
                    value={row.status ?? ''}
                    renderValue={(selected) => renderStatusValue(String(selected ?? ''))}
                    onChange={(event) => patchRow(row.id, { status: event.target.value || null })}
                    sx={{ px: 1, py: 0.25, fontSize: 12.5 }}
                  >
                    <MenuItem value="">
                      <em>без статуса</em>
                    </MenuItem>
                    {statuses.map((status) => (
                      <MenuItem key={status.id} value={status.name} sx={{ py: 0.5 }}>
                        <span
                          className="dj-status-chip"
                          style={{ background: status.color, color: textColorFor(status.color) }}
                        >
                          {status.name}
                        </span>
                      </MenuItem>
                    ))}
                  </Select>
                </td>
                {visibleColumns.map((column) => renderColumnCell(row, column))}
                <td className="dj-checkbox-cell">
                  <button
                    type="button"
                    className="dj-delete-btn"
                    title="Удалить строку"
                    onClick={() => void handleDeleteRow(row)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && (
          <div className="dj-empty">На эту дату заявок нет — нажмите «Добавить заявку»</div>
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
            const column = COLUMN_BY_KEY.get(key as TextFieldName | BooleanFieldName);
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
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
