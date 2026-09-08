import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete, Download, Print } from '@mui/icons-material';
import { useAuthStore } from '../store/auth-store';
import {
  EmployeeItem,
  FleetLocation,
  FleetVehicleItem,
  getEmployees,
  getFleetVehicles,
} from '../services/directories.api';
import {
  PrintFormsMeta,
  PrintJournalRow,
  downloadPrintFormAgain,
  generatePrintForm,
  getPrintFormsJournal,
  getPrintFormsMeta,
} from '../services/print-forms.api';
import { directoryLocationsForRole } from '../utils/rolePermissions';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };

/** Подстраницы печатных форм: доверенности и заявки — общий конструктор, разный набор шаблонов. */
export type PrintFormsMode = 'poa' | 'requests';
const MODE_TEMPLATE_KEYS: Record<PrintFormsMode, string[]> = {
  poa: ['poa_warehouse', 'poa_pl', 'poa_terminal_vehicle'],
  requests: ['vmpp_vehicles_request', 'vmpp_drivers_approval', 'carrier_vehicles'],
};
const MODE_DEFAULT_TEMPLATE: Record<PrintFormsMode, string> = {
  poa: 'poa_warehouse',
  requests: 'vmpp_vehicles_request',
};

type Feedback = { severity: 'success' | 'error'; text: string } | null;

const errorText = (error: unknown): string => {
  const anyError = error as any;
  return anyError?.response?.data?.message || anyError?.message || 'Не удалось выполнить операцию';
};

const today = () => new Date().toISOString().slice(0, 10);
const endOfYear = () => `${new Date().getFullYear()}-12-31`;

const saveBlob = (data: unknown, filename: string) => {
  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** Имя файла из Content-Disposition (filename*=UTF-8''…). */
const filenameFromHeaders = (headers: Record<string, unknown>, fallback: string): string => {
  const raw = String((headers as any)?.['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)/i.exec(raw);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

type VmppPairDraft = { employee: EmployeeItem | null; vehicle: FleetVehicleItem | null };

/** Выпадашки рендерятся в оверлее вне страницы — компактный текст задаём классом. */
const COMPACT_LISTBOX = { className: 'print-compact-listbox' };
const COMPACT_SELECT = { MenuProps: { PaperProps: { className: 'print-compact-menu' } } } as const;

export default function PrintFormsPage({ mode = 'poa' }: { mode?: PrintFormsMode }) {
  const modeKeys = MODE_TEMPLATE_KEYS[mode];
  const { user } = useAuthStore();
  const allowedLocations = useMemo(() => directoryLocationsForRole(user?.role), [user?.role]);
  const [location, setLocation] = useState<FleetLocation>(allowedLocations[0] ?? 'vvo');
  const [meta, setMeta] = useState<PrintFormsMeta | null>(null);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicleItem[]>([]);
  const [journal, setJournal] = useState<PrintJournalRow[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [templateKey, setTemplateKey] = useState(MODE_DEFAULT_TEMPLATE[mode]);
  const [generating, setGenerating] = useState(false);

  // параметры форм
  const [employee, setEmployee] = useState<EmployeeItem | null>(null);
  const [vehicle, setVehicle] = useState<FleetVehicleItem | null>(null);
  const [counterparty, setCounterparty] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState(endOfYear());
  const [formNumber, setFormNumber] = useState<string>('');
  const [withSignature, setWithSignature] = useState(true);
  const [contractLine, setContractLine] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [multiEmployees, setMultiEmployees] = useState<EmployeeItem[]>([]);
  const [multiVehicles, setMultiVehicles] = useState<FleetVehicleItem[]>([]);
  const [pairs, setPairs] = useState<VmppPairDraft[]>([{ employee: null, vehicle: null }]);

  const drivers = useMemo(() => employees.filter((item) => item.position === 'водитель'), [employees]);
  // доверенности выдаются и на не-водителей — там выбор из всех сотрудников
  const poaEmployeeLabel = (item: EmployeeItem) =>
    item.position && item.position !== 'водитель' ? `${item.fullName} · ${item.position}` : item.fullName;
  const template = meta?.templates.find((item) => item.key === templateKey) ?? null;
  const modeTemplates = (meta?.templates ?? []).filter((item) => modeKeys.includes(item.key));
  const modeJournal = journal.filter((row) => modeKeys.includes(row.templateKey));

  const reload = useCallback(async () => {
    try {
      const [metaRes, employeesRes, vehiclesRes, journalRes] = await Promise.all([
        getPrintFormsMeta(location),
        getEmployees(location),
        getFleetVehicles(location),
        getPrintFormsJournal(location),
      ]);
      setMeta(metaRes.data);
      setEmployees(employeesRes.data);
      setVehicles(vehiclesRes.data);
      setJournal(journalRes.data);
      setFormNumber(String(metaRes.data.nextNumber));
      if (!counterparty && metaRes.data.counterparties.length) {
        setCounterparty(metaRes.data.counterparties[0].label);
      }
      if (!carrierName) setCarrierName(metaRes.data.org.shortName);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
    // counterparty/carrierName намеренно вне зависимостей: это только первичная инициализация
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const templateLabel = (key: string): string => meta?.templates.find((item) => item.key === key)?.label ?? key;

  const buildParams = (): Record<string, unknown> => {
    if (templateKey === 'poa_warehouse' || templateKey === 'poa_pl') {
      return {
        employeeId: employee?.id ?? null,
        counterparty,
        issueDate,
        validUntil,
        number: formNumber.trim() === '' ? null : Number(formNumber),
        withSignature,
      };
    }
    if (templateKey === 'poa_terminal_vehicle') {
      return {
        employeeId: employee?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        counterparty,
        issueDate,
        validFrom,
        validUntil,
        number: Number(formNumber),
      };
    }
    if (templateKey === 'vmpp_vehicles_request') {
      return {
        contractLine,
        carrierName,
        pairs: pairs
          .filter((pair) => pair.employee)
          .map((pair) => ({ employeeId: pair.employee?.id, vehicleId: pair.vehicle?.id ?? null })),
      };
    }
    if (templateKey === 'vmpp_drivers_approval') {
      return { contractLine, carrierName, employeeIds: multiEmployees.map((item) => item.id) };
    }
    return { vehicleIds: multiVehicles.map((item) => item.id) };
  };

  const openPdfBlob = (data: unknown) => {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }));
    const win = window.open(url, '_blank');
    if (!win) setFeedback({ severity: 'error', text: 'Браузер заблокировал открытие вкладки — разрешите всплывающие окна' });
  };

  const runGenerate = async (print = false) => {
    setGenerating(true);
    try {
      const response = await generatePrintForm(location, templateKey, buildParams(), print ? 'pdf' : undefined);
      if (print) {
        openPdfBlob(response.data);
      } else {
        saveBlob(response.data, filenameFromHeaders(response.headers as Record<string, unknown>, `Форма.${template?.kind ?? 'docx'}`));
      }
      setFeedback({ severity: 'success', text: 'Форма сформирована и записана в журнал' });
      const journalRes = await getPrintFormsJournal(location);
      setJournal(journalRes.data);
      const metaRes = await getPrintFormsMeta(location);
      setMeta(metaRes.data);
      setFormNumber(String(metaRes.data.nextNumber));
    } catch (error) {
      // ошибка приходит blob'ом — вытащим текст
      const anyError = error as any;
      if (anyError?.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await anyError.response.data.text());
          setFeedback({ severity: 'error', text: parsed?.message ?? 'Не удалось сформировать форму' });
        } catch {
          setFeedback({ severity: 'error', text: 'Не удалось сформировать форму' });
        }
      } else {
        setFeedback({ severity: 'error', text: errorText(error) });
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadAgain = async (row: PrintJournalRow, print = false) => {
    try {
      const response = await downloadPrintFormAgain(row.id, print ? 'pdf' : undefined);
      if (print) openPdfBlob(response.data);
      else saveBlob(response.data, filenameFromHeaders(response.headers as Record<string, unknown>, 'Форма.docx'));
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const isPoa = templateKey.startsWith('poa_');
  const isVmpp = templateKey.startsWith('vmpp_');

  const employeeField = (
    value: EmployeeItem | null,
    onChange: (item: EmployeeItem | null) => void,
    label = 'Сотрудник (из справочника)',
    options: EmployeeItem[] = drivers
  ) => (
    <Autocomplete
      size="small"
      ListboxProps={COMPACT_LISTBOX}
      options={options}
      getOptionLabel={(item) => poaEmployeeLabel(item)}
      value={value}
      onChange={(_event, item) => onChange(item)}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
      sx={{ flex: '2 1 220px', minWidth: 160 }}
    />
  );

  const vehicleField = (
    value: FleetVehicleItem | null,
    onChange: (item: FleetVehicleItem | null) => void,
    label = 'ТС (из справочника)'
  ) => (
    <Autocomplete
      size="small"
      ListboxProps={COMPACT_LISTBOX}
      options={vehicles}
      getOptionLabel={(item) => item.plate}
      value={value}
      onChange={(_event, item) => onChange(item)}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
      sx={{ flex: '1 1 140px', minWidth: 110 }}
    />
  );

  const dateField = (label: string, value: string, onChange: (value: string) => void) => (
    <TextField
      size="small"
      type="date"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      InputLabelProps={{ shrink: true }}
      sx={{ flex: '0 1 160px', minWidth: 125 }}
    />
  );

  return (
    <div className="ops-preview print-page">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {allowedLocations.length > 1 && (
              <TextField
                select size="small" label="Город" SelectProps={COMPACT_SELECT} value={location}
                onChange={(event) => setLocation(event.target.value as FleetLocation)}
                sx={{ flex: '0 1 150px', minWidth: 110 }}
              >
                {allowedLocations.map((value) => (
                  <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select size="small" label="Форма" SelectProps={COMPACT_SELECT} value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
              sx={{ flex: '1.5 1 220px', minWidth: 180, maxWidth: 400 }}
            >
              {modeTemplates.map((item) => (
                <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>
              ))}
            </TextField>
            {isPoa && (
              <>
                {employeeField(employee, setEmployee, 'Сотрудник (из справочника)', employees)}
                {templateKey === 'poa_terminal_vehicle' && vehicleField(vehicle, setVehicle)}
                <TextField
                  select size="small" SelectProps={COMPACT_SELECT}
                  label={templateKey === 'poa_terminal_vehicle' ? 'Терминал' : 'Склад / контрагент'}
                  value={counterparty}
                  onChange={(event) => setCounterparty(event.target.value)}
                  sx={{ flex: '2 1 220px', minWidth: 170 }}
                >
                  {(meta?.counterparties ?? []).map((item) => (
                    <MenuItem key={item.label} value={item.label}>{item.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small" label={templateKey === 'poa_pl' ? 'Номер (пусто — б/н)' : 'Номер'}
                  value={formNumber}
                  onChange={(event) => setFormNumber(event.target.value.replace(/[^\d]/g, ''))}
                  sx={{ flex: '0 1 120px', minWidth: 90 }}
                />
                {dateField('Дата выдачи', issueDate, setIssueDate)}
                {templateKey === 'poa_terminal_vehicle' && dateField('Действительна с', validFrom, setValidFrom)}
                {dateField('Действительна по', validUntil, setValidUntil)}
                {templateKey !== 'poa_terminal_vehicle' && (
                  <FormControlLabel
                    control={<Checkbox size="small" checked={withSignature} onChange={(event) => setWithSignature(event.target.checked)} />}
                    label="Строка подписи доверенного"
                  />
                )}
              </>
            )}
            {isVmpp && (
              <>
                <TextField
                  size="small" label="Договор аккредитации (№ и дата)" value={contractLine}
                  onChange={(event) => setContractLine(event.target.value)}
                  placeholder="№ АТ-ВМПП-2026/86 от «10» декабря 2025 г."
                  sx={{ flex: '2 1 280px', minWidth: 200 }}
                />
                <TextField
                  size="small" label="Автоперевозчик" value={carrierName}
                  onChange={(event) => setCarrierName(event.target.value)}
                  sx={{ flex: '1 1 180px', minWidth: 140 }}
                />
              </>
            )}
            {templateKey === 'vmpp_drivers_approval' && (
              <Autocomplete
                multiple size="small" ListboxProps={COMPACT_LISTBOX} options={drivers}
                getOptionLabel={(item) => item.fullName}
                value={multiEmployees}
                onChange={(_event, value) => setMultiEmployees(value)}
                renderInput={(params) => <TextField {...params} label="Водители" />}
                sx={{ flex: '1 1 320px', minWidth: 220 }}
              />
            )}
            {templateKey === 'carrier_vehicles' && (
              <Autocomplete
                multiple size="small" ListboxProps={COMPACT_LISTBOX} options={vehicles}
                getOptionLabel={(item) => item.plate}
                value={multiVehicles}
                onChange={(_event, value) => setMultiVehicles(value)}
                renderInput={(params) => <TextField {...params} label="ТС (пусто — вся активная техника)" />}
                sx={{ flex: '1 1 320px', minWidth: 220 }}
              />
            )}
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              {template?.kind !== 'xlsx' && (
                <button type="button" className="ops-btn ghost" disabled={generating} onClick={() => void runGenerate(true)}>
                  Печать
                </button>
              )}
              <button type="button" className="ops-btn ops-btn--add" disabled={generating} onClick={() => void runGenerate()}>
                {generating ? 'Формирование…' : `Скачать ${template?.kind === 'xlsx' ? 'Excel' : 'Word'}`}
              </button>
            </Box>
          </Box>

          {templateKey === 'vmpp_vehicles_request' && (
            <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#6b7280' }}>Строки заявки (водитель + ТС):</Typography>
              {pairs.map((pair, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  {employeeField(pair.employee, (item) => setPairs((prev) => prev.map((row, i) => (i === index ? { ...row, employee: item } : row))), `Водитель ${index + 1}`)}
                  {vehicleField(pair.vehicle, (item) => setPairs((prev) => prev.map((row, i) => (i === index ? { ...row, vehicle: item } : row))), 'ТС')}
                  <Tooltip title="Убрать строку">
                    <span>
                      <IconButton size="small" disabled={pairs.length === 1} onClick={() => setPairs((prev) => prev.filter((_row, i) => i !== index))}>
                        <Delete sx={{ fontSize: 18 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ))}
              <Box>
                <button type="button" className="ops-btn ghost" onClick={() => setPairs((prev) => [...prev, { employee: null, vehicle: null }])}>
                  Добавить строку
                </button>
              </Box>
            </Box>
          )}
        </Paper>
      </section>

      <section className="ops-preview__matrix">
        <div className="dir-table">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>Создано</th>
                <th style={{ minWidth: 280 }}>Форма</th>
                <th className="fuel-cell--center" style={{ minWidth: 70 }}>№</th>
                <th className="fuel-cell--center" style={{ minWidth: 110 }}>Дата выдачи</th>
                <th style={{ minWidth: 260 }}>Содержание</th>
                <th style={{ minWidth: 180 }}>Кем создана</th>
                <th className="fuel-cell--center" style={{ minWidth: 90 }}>Скачать</th>
              </tr>
            </thead>
            <tbody>
              {modeJournal.map((row) => (
                <tr key={row.id}>
                  <td className="fuel-cell--left">{new Date(row.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="fuel-cell--left">{templateLabel(row.templateKey)}</td>
                  <td className="fuel-cell--center">{row.formNumber ?? 'б/н'}</td>
                  <td className="fuel-cell--center">{row.issueDate}</td>
                  <td className="fuel-cell--left">{row.summary || '—'}</td>
                  <td className="fuel-cell--left">{row.createdBy}</td>
                  <td className="fuel-cell--center dir-actions">
                    {row.templateKey !== 'carrier_vehicles' && (
                      <Tooltip title="Открыть для печати (PDF)">
                        <IconButton size="small" onClick={() => void downloadAgain(row, true)}>
                          <Print sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Скачать повторно (та же форма)">
                      <IconButton size="small" onClick={() => void downloadAgain(row)}>
                        <Download sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {modeJournal.length === 0 && (
                <tr>
                  <td colSpan={7} className="fuel-empty">Журнал пуст — сформируйте первую форму</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback?.severity ?? 'success'} onClose={() => setFeedback(null)}>
          {feedback?.text ?? ''}
        </Alert>
      </Snackbar>
    </div>
  );
}
