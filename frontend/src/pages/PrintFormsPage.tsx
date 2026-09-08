import { useCallback, useEffect, useMemo, useState } from 'react';
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
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowDropDown, Delete, Download, Print } from '@mui/icons-material';
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
  getPrintFormsJournal,
  getPrintFormsMeta,
  savePrintForm,
} from '../services/print-forms.api';
import { TableSortState, cycleSort, sortIndicator, sortRows } from '../utils/tableSort';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

/** Подстраницы печатных форм: доверенности и заявки — общий конструктор, разный набор шаблонов. */
export type PrintFormsMode = 'poa' | 'requests';
const MODE_TEMPLATE_KEYS: Record<PrintFormsMode, string[]> = {
  poa: ['poa_vmpp', 'poa_dkh', 'poa_pl', 'poa_tk_vehicle'],
  requests: ['vmpp_vehicles_request', 'vmpp_drivers_approval', 'carrier_vehicles'],
};
/** В журнале видны и записи старых ключей (до фиксации контрагента в форме). */
const MODE_JOURNAL_KEYS: Record<PrintFormsMode, string[]> = {
  poa: [...MODE_TEMPLATE_KEYS.poa, 'poa_warehouse', 'poa_terminal_vehicle'],
  requests: MODE_TEMPLATE_KEYS.requests,
};
const LEGACY_TEMPLATE_LABELS: Record<string, string> = {
  poa_warehouse: 'Доверенность на сотрудника (склад)',
  poa_terminal_vehicle: 'Доверенность с ТС (терминал)',
};
/** Короткие имена доверенностей для журнала. */
const SHORT_FORM_LABELS: Record<string, string> = {
  poa_vmpp: 'ВМПП',
  poa_dkh: 'ДКХ',
  poa_pl: 'ПЛ',
  poa_tk_vehicle: 'ТрансКонтейнер',
  poa_warehouse: 'Склад (ВМПП/ДКХ)',
  poa_terminal_vehicle: 'ТрансКонтейнер',
};
const MODE_DEFAULT_TEMPLATE: Record<PrintFormsMode, string> = {
  poa: 'poa_vmpp',
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
  // Печатные формы пока только для Владивостока: шаблоны заточены под
  // контрагентов ВВО. Москве добавим её формы, когда появятся образцы.
  const location: FleetLocation = 'vvo';
  const [meta, setMeta] = useState<PrintFormsMeta | null>(null);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicleItem[]>([]);
  const [journal, setJournal] = useState<PrintJournalRow[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [templateKey, setTemplateKey] = useState(MODE_DEFAULT_TEMPLATE[mode]);
  const [generating, setGenerating] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  // журнал: поиск и сортировка по заголовкам (как в справочниках)
  const [journalQuery, setJournalQuery] = useState('');
  const [journalSort, setJournalSort] = useState<TableSortState>(null);

  // параметры форм
  const [employee, setEmployee] = useState<EmployeeItem | null>(null);
  const [vehicle, setVehicle] = useState<FleetVehicleItem | null>(null);
  const [counterparty, setCounterparty] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState(endOfYear());

  const [contractLine, setContractLine] = useState('');
  const [multiEmployees, setMultiEmployees] = useState<EmployeeItem[]>([]);
  const [multiVehicles, setMultiVehicles] = useState<FleetVehicleItem[]>([]);
  // диалог мультивыбора с галочками (водители согласования / ТС Excel-формы)
  const [pickerKind, setPickerKind] = useState<'drivers' | 'vehicles' | null>(null);
  const [pickerIds, setPickerIds] = useState<string[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pairs, setPairs] = useState<VmppPairDraft[]>([{ employee: null, vehicle: null }]);

  const drivers = useMemo(() => employees.filter((item) => item.position === 'водитель'), [employees]);
  // доверенности выдаются и на не-водителей — выбор из всех сотрудников, в списке только ФИО
  const poaEmployeeLabel = (item: EmployeeItem) => item.fullName;
  const modeTemplates = (meta?.templates ?? []).filter((item) => modeKeys.includes(item.key));
  const modeJournal = journal.filter((row) => MODE_JOURNAL_KEYS[mode].includes(row.templateKey));

  const templateLabel = (key: string): string =>
    meta?.templates.find((item) => item.key === key)?.label ?? LEGACY_TEMPLATE_LABELS[key] ?? key;
  const journalFormLabel = (key: string): string => SHORT_FORM_LABELS[key] ?? templateLabel(key);
  /** У доверенностей summary = «ФИО · контрагент» — в журнале показываем только ФИО. */
  const journalPersonText = (row: PrintJournalRow): string =>
    mode === 'poa' ? (row.summary.split(' · ')[0] || '—') : (row.summary || '—');


  const dotsDateKey = (value: string | undefined): string =>
    value ? value.split('.').reverse().join('-') : '';
  const journalSortValue = (row: PrintJournalRow, field: string): unknown => {
    if (field === 'formNumber') return row.formNumber;
    if (field === 'createdAt') return row.createdAt;
    if (field === 'form') return journalFormLabel(row.templateKey);
    if (field === 'person') return journalPersonText(row);
    if (field === 'issueDate') return dotsDateKey(row.issueDate);
    if (field === 'validUntil') return dotsDateKey(row.validUntil);
    if (field === 'createdBy') return row.createdBy;
    return '';
  };
  const visibleJournal = sortRows(
    modeJournal.filter((row) => {
      const q = journalQuery.trim().toLowerCase();
      if (!q) return true;
      return [String(row.formNumber ?? ''), row.summary, row.createdBy, journalFormLabel(row.templateKey), row.issueDate, row.validUntil ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    }),
    journalSort,
    journalSortValue
  );
  const pickerOptions =
    pickerKind === 'drivers'
      ? drivers
          .filter((item) => item.fullName.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
          .map((item) => ({ id: item.id, label: item.fullName }))
      : pickerKind === 'vehicles'
        ? vehicles
            .filter((item) => item.plate.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
            .map((item) => ({ id: item.id, label: item.plate }))
        : [];

  const journalHeader = (field: string, label: string) => (
    <button type="button" className="ops-matrix__sort-btn" onClick={() => setJournalSort((prev) => cycleSort(prev, field))}>
      <span>{label}</span>
      <span className={`ops-matrix__sort-indicator is-${sortIndicator(journalSort, field)}`} aria-hidden="true" />
    </button>
  );

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
      if (!counterparty && metaRes.data.counterparties.length) {
        setCounterparty(metaRes.data.counterparties[0].label);
      }
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
    // counterparty/carrierName намеренно вне зависимостей: это только первичная инициализация
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    void reload();
  }, [reload]);


  const buildParams = (): Record<string, unknown> => {
    // номер присваивается на сервере автоматически (сквозной по региону и году)
    if (templateKey === 'poa_vmpp' || templateKey === 'poa_dkh' || templateKey === 'poa_pl') {
      return {
        employeeId: employee?.id ?? null,
        issueDate,
        validUntil,
      };
    }
    if (templateKey === 'poa_tk_vehicle') {
      return {
        employeeId: employee?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        issueDate,
        validFrom,
        validUntil,
      };
    }
    if (templateKey === 'vmpp_vehicles_request') {
      return {
        contractLine,
        pairs: pairs
          .filter((pair) => pair.employee)
          .map((pair) => ({ employeeId: pair.employee?.id, vehicleId: pair.vehicle?.id ?? null })),
      };
    }
    if (templateKey === 'vmpp_drivers_approval') {
      return { contractLine, employeeIds: multiEmployees.map((item) => item.id) };
    }
    return { vehicleIds: multiVehicles.map((item) => item.id) };
  };

  const openPdfBlob = (data: unknown) => {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }));
    const win = window.open(url, '_blank');
    if (!win) setFeedback({ severity: 'error', text: 'Браузер заблокировал открытие вкладки — разрешите всплывающие окна' });
  };

  const runSave = async () => {
    setGenerating(true);
    try {
      const response = await savePrintForm(location, templateKey, buildParams());
      setLastSavedId(response.data.id);
      setFeedback({
        severity: 'success',
        text: `Сохранено в журнал${response.data.formNumber ? ` — №${response.data.formNumber}` : ''}. Печать и скачивание — в «Действиях».`,
      });
      // выбранные люди и машины сбрасываются (защита от дублей),
      // контекст — город, форма, даты, договор — остаётся для серии форм
      setEmployee(null);
      setVehicle(null);
      setMultiEmployees([]);
      setMultiVehicles([]);
      setPairs([{ employee: null, vehicle: null }]);
      const journalRes = await getPrintFormsJournal(location);
      setJournal(journalRes.data);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
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
    options: EmployeeItem[] = drivers,
    sx: Record<string, unknown> = { flex: '2 1 220px', minWidth: 160 }
  ) => (
    <Autocomplete
      size="small"
      ListboxProps={COMPACT_LISTBOX}
      options={options}
      getOptionLabel={(item) => poaEmployeeLabel(item)}
      value={value}
      onChange={(_event, item) => onChange(item)}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
      sx={sx}
    />
  );

  const vehicleField = (
    value: FleetVehicleItem | null,
    onChange: (item: FleetVehicleItem | null) => void,
    label = 'ТС (из справочника)',
    sx: Record<string, unknown> = { flex: '1 1 140px', minWidth: 110 }
  ) => (
    <Autocomplete
      size="small"
      ListboxProps={COMPACT_LISTBOX}
      options={vehicles}
      getOptionLabel={(item) => item.plate}
      value={value}
      onChange={(_event, item) => onChange(item)}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
      sx={sx}
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
            <TextField
              select size="small" label="Форма" SelectProps={COMPACT_SELECT} value={templateKey}
              onChange={(event) => {
                // смена формы очищает заполненное — поля разных форм не смешиваются
                setTemplateKey(event.target.value);
                setEmployee(null);
                setVehicle(null);
                setMultiEmployees([]);
                setMultiVehicles([]);
                setPairs([{ employee: null, vehicle: null }]);
                setContractLine('');
                setIssueDate(today());
                setValidFrom(today());
                setValidUntil(endOfYear());
              }}
              sx={{ flex: '1.5 1 220px', minWidth: 180, maxWidth: 400 }}
            >
              {modeTemplates.map((item) => (
                <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>
              ))}
            </TextField>
            {isPoa && (
              <>
                {employeeField(employee, setEmployee, 'Сотрудник (из справочника)', employees)}
                {templateKey === 'poa_tk_vehicle' && vehicleField(vehicle, setVehicle)}
                {dateField('Дата выдачи', issueDate, setIssueDate)}
                {templateKey === 'poa_tk_vehicle' && dateField('Действительна с', validFrom, setValidFrom)}
                {dateField('Действительна по', validUntil, setValidUntil)}
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
              </>
            )}
            {templateKey === 'vmpp_drivers_approval' && (
              <TextField
                size="small"
                label="Водители"
                value={multiEmployees.length ? `Выбрано: ${multiEmployees.length}` : ''}
                placeholder="Выбрать…"
                onClick={() => {
                  setPickerIds(multiEmployees.map((item) => item.id));
                  setPickerQuery('');
                  setPickerKind('drivers');
                }}
                InputProps={{ readOnly: true, endAdornment: <ArrowDropDown sx={{ color: 'rgba(0,0,0,0.54)' }} /> }}
                sx={{ flex: '1 1 170px', minWidth: 0, '& input': { cursor: 'pointer', caretColor: 'transparent' } }}
              />
            )}
            {templateKey === 'carrier_vehicles' && (
              <TextField
                size="small"
                label="ТС"
                value={multiVehicles.length ? `Выбрано: ${multiVehicles.length}` : ''}
                placeholder="Выбрать…"
                onClick={() => {
                  setPickerIds(multiVehicles.map((item) => item.id));
                  setPickerQuery('');
                  setPickerKind('vehicles');
                }}
                InputProps={{ readOnly: true, endAdornment: <ArrowDropDown sx={{ color: 'rgba(0,0,0,0.54)' }} /> }}
                sx={{ flex: '1 1 170px', minWidth: 0, '& input': { cursor: 'pointer', caretColor: 'transparent' } }}
              />
            )}
            <TextField
              size="small"
              label="Поиск по журналу"
              value={journalQuery}
              onChange={(event) => setJournalQuery(event.target.value)}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
            />
            <Box sx={{ ml: 'auto' }}>
              <button type="button" className="ops-btn ops-btn--add" disabled={generating} onClick={() => void runSave()}>
                {generating ? 'Сохранение…' : 'Сохранить'}
              </button>
            </Box>
          </Box>

          {templateKey === 'vmpp_vehicles_request' && (
            <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#6b7280' }}>Строки заявки (водитель + ТС):</Typography>
              {pairs.map((pair, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  {employeeField(pair.employee, (item) => setPairs((prev) => prev.map((row, i) => (i === index ? { ...row, employee: item } : row))), `Водитель ${index + 1}`, drivers, { flex: '1 1 0', minWidth: 160 })}
                  {vehicleField(pair.vehicle, (item) => setPairs((prev) => prev.map((row, i) => (i === index ? { ...row, vehicle: item } : row))), 'ТС', { flex: '1 1 0', minWidth: 160 })}
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
                <th className="fuel-cell--center" style={{ minWidth: 60 }}>{journalHeader('formNumber', '№')}</th>
                <th style={{ minWidth: 120 }}>{journalHeader('createdAt', 'Создано')}</th>
                <th style={{ minWidth: 130 }}>{journalHeader('form', 'Форма')}</th>
                <th style={{ minWidth: 240 }}>{journalHeader('person', mode === 'poa' ? 'ФИО' : 'Содержание')}</th>
                <th className="fuel-cell--center" style={{ minWidth: 100 }}>{journalHeader('issueDate', 'Дата выдачи')}</th>
                {mode === 'poa' && (
                  <th className="fuel-cell--center" style={{ minWidth: 110 }}>{journalHeader('validUntil', 'Действительна по')}</th>
                )}
                <th style={{ minWidth: 170 }}>{journalHeader('createdBy', 'Кем создана')}</th>
                <th className="fuel-cell--center" style={{ minWidth: 80 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleJournal.map((row) => (
                <tr key={row.id} className={row.id === lastSavedId ? 'print-journal-row--new' : undefined}>
                  <td className="fuel-cell--center">{row.formNumber ?? 'б/н'}</td>
                  <td className="fuel-cell--left">{new Date(row.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="fuel-cell--left" title={templateLabel(row.templateKey)}>{journalFormLabel(row.templateKey)}</td>
                  <td className="fuel-cell--left" title={row.summary}>{journalPersonText(row)}</td>
                  <td className="fuel-cell--center">{row.issueDate}</td>
                  {mode === 'poa' && <td className="fuel-cell--center">{row.validUntil || '—'}</td>}
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
              {visibleJournal.length === 0 && (
                <tr>
                  <td colSpan={mode === 'poa' ? 8 : 7} className="fuel-empty">
                    {journalQuery.trim() ? 'Ничего не найдено' : 'Журнал пуст — сформируйте первую форму'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={pickerKind !== null} onClose={() => setPickerKind(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{pickerKind === 'drivers' ? 'Выбор водителей' : 'Выбор ТС'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            size="small" fullWidth autoFocus label="Поиск"
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            sx={{ mt: 1, mb: 1 }}
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Button
              size="small"
              onClick={() => setPickerIds((prev) => [...new Set([...prev, ...pickerOptions.map((o) => o.id)])])}
            >
              Выделить все
            </Button>
            <Button size="small" onClick={() => setPickerIds([])}>
              Снять все
            </Button>
          </Box>
          <List dense sx={{ maxHeight: 360, overflow: 'auto', py: 0 }}>
            {pickerOptions.map((option) => (
              <ListItem key={option.id} disablePadding>
                <FormControlLabel
                  sx={{ width: '100%', m: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }}
                  control={(
                    <Checkbox
                      size="small"
                      checked={pickerIds.includes(option.id)}
                      onChange={() =>
                        setPickerIds((prev) =>
                          prev.includes(option.id) ? prev.filter((x) => x !== option.id) : [...prev, option.id]
                        )
                      }
                    />
                  )}
                  label={option.label}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', ml: 1 }}>
            Выбрано: {pickerIds.length}
          </Typography>
          <Button onClick={() => setPickerKind(null)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pickerKind === 'drivers') {
                setMultiEmployees(drivers.filter((item) => pickerIds.includes(item.id)));
              } else {
                setMultiVehicles(vehicles.filter((item) => pickerIds.includes(item.id)));
              }
              setPickerKind(null);
            }}
          >
            Готово
          </Button>
        </DialogActions>
      </Dialog>

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
