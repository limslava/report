import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
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

type ColumnDef = {
  field: TextFieldName;
  title: string;
  width: number;
  multiline?: boolean;
  listId?: string;
};

const TEXT_COLUMNS: ColumnDef[] = [
  { field: 'info', title: 'Инфо', width: 90 },
  { field: 'client', title: 'Клиент', width: 150 },
  { field: 'driverName', title: 'ФИО водителя', width: 150, listId: 'dj-drivers' },
  { field: 'vehiclePlate', title: 'Гос номер', width: 110, listId: 'dj-vehicles' },
  { field: 'ktkNumber', title: '№ КТК', width: 120 },
  { field: 'ktkType', title: 'Тип', width: 55 },
  { field: 'grossWeight', title: 'Вес (брутто)', width: 100 },
  { field: 'comments', title: 'Комментарии', width: 180, multiline: true },
  { field: 'operation', title: 'Операция', width: 110, listId: 'dj-operations' },
  { field: 'terminalFrom', title: 'Терминал постановки', width: 200, multiline: true },
  { field: 'slotFrom', title: 'Слот', width: 80 },
  { field: 'pinFrom', title: 'Пин', width: 70 },
  { field: 'submitTime', title: 'Время подачи', width: 90 },
  { field: 'deliveryAddress', title: 'Адрес доставки', width: 220, multiline: true },
  { field: 'terminalTo', title: 'Терминал снятия', width: 200, multiline: true },
  { field: 'slotTo', title: 'Слот', width: 80 },
  { field: 'pinTo', title: 'Пин', width: 70 },
  { field: 'driverRate', title: 'Ставка водителя', width: 90 },
  { field: 'vat', title: 'НДС', width: 90, listId: 'dj-vat' },
  { field: 'clientRate', title: 'Ставка', width: 90 },
  { field: 'passes', title: 'Пропуска', width: 90 },
  { field: 'extraAddress', title: 'Доп адрес', width: 160, multiline: true },
  { field: 'demurrage', title: 'Простой/руб', width: 90 },
];

const TAIL_TEXT_COLUMNS: ColumnDef[] = [
  { field: 'extraTon', title: 'Доп тонна', width: 90 },
  { field: 'seal', title: 'Пломба', width: 90 },
];

const REMARKS_COLUMN: ColumnDef = { field: 'driverRemarks', title: 'Замечания к водителю', width: 180, multiline: true };

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
              {TEXT_COLUMNS.map((column) => (
                <th key={column.field} style={{ minWidth: column.width }}>{column.title}</th>
              ))}
              <th>Заказ на ТС</th>
              <th>Отправка счета</th>
              {TAIL_TEXT_COLUMNS.map((column) => (
                <th key={column.field} style={{ minWidth: column.width }}>{column.title}</th>
              ))}
              <th>Перецеп</th>
              <th style={{ minWidth: REMARKS_COLUMN.width }}>{REMARKS_COLUMN.title}</th>
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
                {TEXT_COLUMNS.map((column) => (
                  <td key={column.field}>
                    <EditableCell
                      value={row[column.field]}
                      multiline={column.multiline}
                      listId={column.listId}
                      onSave={(value) => patchRow(row.id, { [column.field]: value || null })}
                    />
                  </td>
                ))}
                <td className="dj-checkbox-cell">
                  <Checkbox
                    size="small"
                    checked={row.orderOnVehicle}
                    onChange={(event) => patchRow(row.id, { orderOnVehicle: event.target.checked })}
                  />
                </td>
                <td className="dj-checkbox-cell">
                  <Checkbox
                    size="small"
                    checked={row.invoiceSent}
                    onChange={(event) => patchRow(row.id, { invoiceSent: event.target.checked })}
                  />
                </td>
                {TAIL_TEXT_COLUMNS.map((column) => (
                  <td key={column.field}>
                    <EditableCell
                      value={row[column.field]}
                      listId={column.listId}
                      onSave={(value) => patchRow(row.id, { [column.field]: value || null })}
                    />
                  </td>
                ))}
                <td className="dj-checkbox-cell">
                  <Checkbox
                    size="small"
                    checked={row.recoupling}
                    onChange={(event) => patchRow(row.id, { recoupling: event.target.checked })}
                  />
                </td>
                <td>
                  <EditableCell
                    value={row.driverRemarks}
                    multiline
                    onSave={(value) => patchRow(row.id, { driverRemarks: value || null })}
                  />
                </td>
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
