import { Close, EventRepeat, Logout, PictureAsPdf, MiscellaneousServices } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadWarehouseVehicleInspectionAct,
  getWarehouseBilling,
  getWarehouseVehicleInspection,
  getWarehouseVehicleOperations,
  saveWarehouseVehicleInspection,
  updateWarehouseVehicle,
  WarehouseBillingVehicleLine,
  WarehouseClient,
  WarehouseVehicle,
  WarehouseVehicleInspection,
  WarehouseVehicleInspectionPayload,
  WarehouseVehicleOperation,
  WarehouseVehicleType,
} from '../../services/warehouse.api';
import { WAREHOUSE_VEHICLE_TYPES, warehouseVehicleTypeLabel } from '../../constants/warehouse';
import { downloadBlob } from '../../utils/download';
import WarehouseInspectionForm, {
  documentsAndKeys,
  emptyWarehouseInspection,
  equipmentFields,
  technicalCondition,
  technicalTextFields,
  vehicleDetailFields,
} from './WarehouseInspectionForm';
import WarehouseDamageScheme from './WarehouseDamageScheme';
import WarehousePhotoDialog from './WarehousePhotoDialog';

type CardTab = 'main' | 'reception' | 'issue' | 'billing' | 'photos' | 'docs' | 'history';

interface Props {
  open: boolean;
  vehicle: WarehouseVehicle | null;
  client?: WarehouseClient | null;
  /** кладовщик/заведующий/админ: правка карточки и осмотра, пока ТС не выдано */
  canOperate: boolean;
  canCorrectDates: boolean;
  canEditServices: boolean;
  /** журнал операций — внутренний, клиенту склада не показывается */
  canViewHistory: boolean;
  onClose: () => void;
  onChanged: () => void;
  onCorrectDates: (vehicle: WarehouseVehicle) => void;
  onOpenServices: (vehicle: WarehouseVehicle) => void;
  onIssue: (vehicle: WarehouseVehicle) => void;
  /** растёт, когда данные ТС поменяли снаружи (услуги, корректировка дат) — перечитать вкладки */
  refreshToken?: number;
}

const STATUS_LABELS: Record<WarehouseVehicle['status'], string> = {
  expected: 'Ожидается',
  on_site: 'На стоянке',
  issued: 'Выдано',
};
const STATUS_COLORS: Record<WarehouseVehicle['status'], { bg: string; color: string }> = {
  expected: { bg: '#fef3c7', color: '#92400e' },
  on_site: { bg: '#dcfce7', color: '#166534' },
  issued: { bg: '#e0e7ff', color: '#3730a3' },
};

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
const dateTime = (value: string | null | undefined) => (value
  ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
  : '—');
const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10).split('-').reverse().join('.') : '—');
const todayYmd = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Vladivostok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

type MainForm = {
  vehicleType: WarehouseVehicleType;
  brand: string;
  model: string;
  vin: string;
  chassisNumber: string;
  registrationNumber: string;
  fuelLevelPercent: string;
  notes: string;
};

const mainFormFrom = (vehicle: WarehouseVehicle): MainForm => ({
  vehicleType: vehicle.vehicleType,
  brand: vehicle.brand,
  model: vehicle.model,
  vin: vehicle.vin ?? '',
  chassisNumber: vehicle.chassisNumber ?? '',
  registrationNumber: vehicle.registrationNumber ?? '',
  fuelLevelPercent: vehicle.fuelLevelPercent == null ? '' : String(vehicle.fuelLevelPercent),
  notes: vehicle.notes ?? '',
});

const inspectionPayloadFrom = (inspection: WarehouseVehicleInspection | null): WarehouseVehicleInspectionPayload => (
  inspection
    ? {
      vehicleDetails: inspection.vehicleDetails ?? {},
      documentsAndKeys: inspection.documentsAndKeys ?? {},
      equipment: inspection.equipment ?? {},
      technicalCondition: inspection.technicalCondition ?? {},
      photoChecklist: inspection.photoChecklist ?? {},
      damageNotes: inspection.damageNotes ?? '',
      personalItemsNotes: inspection.personalItemsNotes ?? '',
      responsibilityAmount: inspection.responsibilityAmount ?? null,
    }
    : emptyWarehouseInspection()
);

const groupOf = (payload: WarehouseVehicleInspectionPayload | null, group: keyof WarehouseVehicleInspectionPayload) =>
  ((payload?.[group] as Record<string, unknown> | undefined) ?? {});

const damageMarkCount = (payload: WarehouseVehicleInspectionPayload | null) => {
  const marks = groupOf(payload, 'technicalCondition').damageMarks;
  return Array.isArray(marks) ? marks.length : 0;
};

const messageFromError = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return fallback;
};

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#27364b', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

/**
 * Карточка ТС склада: вкладки «Основное / Приёмка / Выдача / Услуги и начисления /
 * Фото / Документы / История» (макет согласован 2026-09-14). Правят карточку
 * и осмотр только складские роли и только пока ТС не выдано; финансы и клиент
 * смотрят те же данные в режиме просмотра, журнал операций клиенту не виден.
 */
export default function WarehouseVehicleCard({
  open,
  vehicle,
  client,
  canOperate,
  canCorrectDates,
  canEditServices,
  canViewHistory,
  onClose,
  onChanged,
  onCorrectDates,
  onOpenServices,
  onIssue,
  refreshToken = 0,
}: Props) {
  const fullScreen = useMediaQuery('(max-width:600px)');
  const [tab, setTab] = useState<CardTab>('main');
  const [mainForm, setMainForm] = useState<MainForm | null>(null);
  const [reception, setReception] = useState<WarehouseVehicleInspectionPayload | null>(null);
  const [receptionMeta, setReceptionMeta] = useState<WarehouseVehicleInspection | null>(null);
  const [receptionDirty, setReceptionDirty] = useState(false);
  const [issue, setIssue] = useState<WarehouseVehicleInspectionPayload | null>(null);
  const [issueMeta, setIssueMeta] = useState<WarehouseVehicleInspection | null>(null);
  const [billingLine, setBillingLine] = useState<WarehouseBillingVehicleLine | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [operations, setOperations] = useState<WarehouseVehicleOperation[] | null>(null);
  const [showAllComparison, setShowAllComparison] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const editable = canOperate && vehicle?.status !== 'issued';

  useEffect(() => {
    if (!open || !vehicle) return;
    setTab('main');
    setMainForm(mainFormFrom(vehicle));
    setReceptionDirty(false);
    setOperations(null);
    setBillingLine(null);
    setShowAllComparison(false);
    setError(null);
    setSuccess(null);
    Promise.all([
      getWarehouseVehicleInspection(vehicle.id, 'reception'),
      vehicle.status === 'issued' ? getWarehouseVehicleInspection(vehicle.id, 'issue') : Promise.resolve({ data: null }),
    ])
      .then(([receptionResponse, issueResponse]) => {
        setReceptionMeta(receptionResponse.data);
        setReception(inspectionPayloadFrom(receptionResponse.data));
        setIssueMeta(issueResponse.data);
        setIssue(issueResponse.data ? inspectionPayloadFrom(issueResponse.data) : null);
      })
      .catch((loadError) => setError(messageFromError(loadError, 'Не удалось загрузить осмотр.')));
    // карточка заново открывается для другого ТС — перечитываем данные по id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle?.id]);

  useEffect(() => {
    if (!refreshToken) return;
    setBillingLine(null);
    setOperations(null);
  }, [refreshToken]);

  const loadBilling = useCallback(async () => {
    if (!vehicle) return;
    setBillingLoading(true);
    try {
      const response = await getWarehouseBilling({
        periodFrom: vehicle.receivedDate,
        periodTo: vehicle.issuedDate ?? todayYmd(),
        counterpartyId: vehicle.counterpartyId,
      });
      setBillingLine(response.data.lines.find((line) => line.vehicleId === vehicle.id) ?? null);
    } catch (loadError) {
      setError(messageFromError(loadError, 'Не удалось рассчитать начисления.'));
    } finally {
      setBillingLoading(false);
    }
  }, [vehicle]);

  useEffect(() => {
    if (!open || !vehicle) return;
    if (tab === 'billing' && !billingLine && !billingLoading) void loadBilling();
    if (tab === 'history' && operations === null && canViewHistory) {
      getWarehouseVehicleOperations(vehicle.id)
        .then((response) => setOperations(response.data))
        .catch((loadError) => setError(messageFromError(loadError, 'Не удалось загрузить историю.')));
    }
  }, [billingLine, billingLoading, canViewHistory, loadBilling, open, operations, tab, vehicle]);

  const mainDirty = useMemo(() => {
    if (!vehicle || !mainForm) return false;
    return JSON.stringify(mainForm) !== JSON.stringify(mainFormFrom(vehicle));
  }, [mainForm, vehicle]);
  const dirty = editable && (mainDirty || receptionDirty);

  const missing = useMemo(() => {
    if (!editable || !mainForm) return [];
    const list: string[] = [];
    if (!mainForm.registrationNumber.trim()) list.push('госномер');
    if (!mainForm.vin.trim() && !mainForm.chassisNumber.trim()) list.push('VIN или номер шасси');
    if (mainForm.fuelLevelPercent === '') list.push('уровень топлива');
    if (reception && !String(groupOf(reception, 'vehicleDetails').odometerKm ?? '').trim()) list.push('одометр');
    if (reception && !groupOf(reception, 'documentsAndKeys').ignitionKeys) list.push('ключи зажигания не отмечены');
    return list;
  }, [editable, mainForm, reception]);

  const handleClose = () => {
    if (dirty && !window.confirm('Есть несохранённые изменения. Закрыть карточку без сохранения?')) return;
    onClose();
  };

  const save = async () => {
    if (!vehicle || !mainForm) return;
    if (!mainForm.brand.trim() || !mainForm.model.trim()) {
      setTab('main');
      setError('Заполните марку и модель.');
      return;
    }
    const fuel = mainForm.fuelLevelPercent === '' ? null : Number(mainForm.fuelLevelPercent);
    if (fuel !== null && (!Number.isFinite(fuel) || fuel < 0 || fuel > 100)) {
      setTab('main');
      setError('Уровень топлива должен быть от 0 до 100%.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mainDirty) {
        await updateWarehouseVehicle(vehicle.id, {
          vehicleType: mainForm.vehicleType,
          brand: mainForm.brand.trim(),
          model: mainForm.model.trim(),
          vin: mainForm.vin.trim() || null,
          chassisNumber: mainForm.chassisNumber.trim() || null,
          registrationNumber: mainForm.registrationNumber.trim() || null,
          fuelLevelPercent: fuel,
          notes: mainForm.notes.trim() || null,
        });
      }
      if (receptionDirty && reception) {
        const saved = await saveWarehouseVehicleInspection(vehicle.id, 'reception', reception);
        setReceptionMeta(saved.data);
        setReceptionDirty(false);
      }
      setSuccess('Карточка сохранена.');
      setOperations(null);
      onChanged();
    } catch (saveError) {
      setError(messageFromError(saveError, 'Не удалось сохранить карточку.'));
    } finally {
      setSaving(false);
    }
  };

  const downloadAct = async (phase: 'reception' | 'issue') => {
    if (!vehicle) return;
    try {
      const response = await downloadWarehouseVehicleInspectionAct(vehicle.id, phase);
      await downloadBlob(
        response.data,
        `${phase === 'issue' ? 'Акт_возврата' : 'Акт_приёма'}_${vehicle.warehouseNumber}.pdf`,
      );
    } catch (downloadError) {
      setError(messageFromError(downloadError, 'Не удалось сформировать акт.'));
    }
  };

  const comparison = useMemo(() => {
    if (!reception || !issue) return [];
    const rows: Array<{ label: string; before: string; after: string; diff: boolean }> = [];
    const text = (value: unknown) => (String(value ?? '').trim() || '—');
    const flag = (value: unknown) => (value ? 'есть' : 'нет');
    const push = (label: string, before: string, after: string) => rows.push({ label, before, after, diff: before !== after });
    vehicleDetailFields.forEach(([key, label]) => push(label, text(groupOf(reception, 'vehicleDetails')[key]), text(groupOf(issue, 'vehicleDetails')[key])));
    documentsAndKeys.forEach(([key, label]) => push(label, flag(groupOf(reception, 'documentsAndKeys')[key]), flag(groupOf(issue, 'documentsAndKeys')[key])));
    equipmentFields.forEach(([key, label]) => push(label, flag(groupOf(reception, 'equipment')[key]), flag(groupOf(issue, 'equipment')[key])));
    technicalCondition.forEach(([key, label]) => push(label, flag(groupOf(reception, 'technicalCondition')[key]), flag(groupOf(issue, 'technicalCondition')[key])));
    technicalTextFields.forEach(([key, label]) => push(label, text(groupOf(reception, 'technicalCondition')[key]), text(groupOf(issue, 'technicalCondition')[key])));
    push('Отметки повреждений на схеме', `${damageMarkCount(reception)}`, `${damageMarkCount(issue)}`);
    push('Личные вещи', text(reception.personalItemsNotes), text(issue.personalItemsNotes));
    push('Повреждения и замечания', text(reception.damageNotes), text(issue.damageNotes));
    return rows;
  }, [issue, reception]);
  const diffCount = comparison.filter((row) => row.diff).length;

  if (!vehicle || !mainForm) return null;

  const statusColor = STATUS_COLORS[vehicle.status];
  const field = (label: string, value: ReactNode, note?: string) => (
    <Box>
      <Typography sx={{ fontSize: 11, color: '#5b6472', fontWeight: 600, mb: 0.25 }}>{label}</Typography>
      <Box sx={{ border: '1px solid #e1e6ed', bgcolor: '#f1f4f8', color: '#4b5563', borderRadius: 1.5, px: 1.25, py: 0.9, fontSize: 13, minHeight: 36 }}>
        {value}
      </Box>
      {note && <Typography sx={{ fontSize: 10.5, color: '#8b93a1', mt: 0.25 }}>{note}</Typography>}
    </Box>
  );
  const input = (key: keyof MainForm, label: string, extra?: { type?: string; upper?: boolean; multiline?: boolean }) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      type={extra?.type}
      value={mainForm[key]}
      multiline={extra?.multiline}
      minRows={extra?.multiline ? 2 : undefined}
      InputProps={{ readOnly: !editable }}
      onChange={(event) => setMainForm((current) => current && ({
        ...current,
        [key]: extra?.upper ? event.target.value.toUpperCase() : event.target.value,
      }))}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : handleClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      PaperProps={{ sx: { height: fullScreen ? '100%' : 'calc(100vh - 64px)', borderRadius: fullScreen ? 0 : 3 } }}
    >
      <Box sx={{ px: 2.5, pt: 1.75, pb: 1.25, borderBottom: '1px solid #eef1f5', display: 'flex', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
            Карточка {vehicle.warehouseNumber} · {vehicle.brand} {vehicle.model}
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5, fontSize: 12, color: '#5b6472' }}>
            <Chip size="small" label={STATUS_LABELS[vehicle.status]} sx={{ bgcolor: statusColor.bg, color: statusColor.color, fontWeight: 700, height: 22 }} />
            <span>Клиент: <b>{vehicle.counterparty.nameShort || vehicle.counterparty.nameFull}</b> · ИНН {vehicle.counterparty.inn}</span>
            <span>Принят: {dateTime(vehicle.receivedAt)}</span>
            {vehicle.issuedAt && <span>Выдан: {dateTime(vehicle.issuedAt)}</span>}
            <span>{vehicle.status === 'issued' ? 'Хранился' : 'На хранении'}: <b>{vehicle.storageDays} сут.</b></span>
            {Boolean(client?.individualTariffsCount) && (
              <Chip size="small" label="Свой прайс" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 700, height: 22 }} />
            )}
          </Stack>
        </Box>
        <IconButton aria-label="Закрыть" onClick={handleClose} disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          <Close />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: '1px solid #d8dde5', bgcolor: '#f8fafc', minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontSize: 12.5, fontWeight: 600, textTransform: 'none', whiteSpace: 'nowrap', flex: { md: 1 } } }}
      >
        <Tab value="main" label="Основное" />
        <Tab value="reception" label={`Приёмка${receptionDirty ? ' •' : ''}`} />
        <Tab value="issue" label="Выдача" />
        <Tab value="billing" label="Услуги и начисления" />
        <Tab value="photos" label="Фото" />
        <Tab value="docs" label="Документы" />
        {canViewHistory && <Tab value="history" label="История" />}
      </Tabs>

      <DialogContent
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor: '#fff',
          '& .MuiInputBase-input, & .MuiSelect-select': { fontSize: 13 },
          '& .MuiInputLabel-root': { fontSize: 13 },
          '& .MuiInputLabel-shrink': { fontSize: 12 },
        }}
      >
        <Stack spacing={1.5}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

          {tab === 'main' && (
            <>
              <Section title="Клиент и заявка">
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}>
                  {field('Контрагент', `${vehicle.counterparty.nameShort || vehicle.counterparty.nameFull} — ${vehicle.counterparty.inn}`)}
                  {field('№ заявки клиента', vehicle.requestNumber || '—')}
                  {field('Дата заявки', dateOnly(vehicle.requestDate))}
                </Box>
              </Section>
              <Section title="Транспортное средство">
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Тип ТС</InputLabel>
                    <Select
                      label="Тип ТС"
                      value={mainForm.vehicleType}
                      readOnly={!editable}
                      onChange={(event) => setMainForm((current) => current && ({ ...current, vehicleType: event.target.value as WarehouseVehicleType }))}
                    >
                      {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>{warehouseVehicleTypeLabel(type)}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {input('brand', 'Марка *')}
                  {input('model', 'Модель *')}
                  {input('registrationNumber', 'Госномер', { upper: true })}
                  {input('vin', 'VIN', { upper: true })}
                  {input('chassisNumber', 'Номер шасси')}
                  {input('fuelLevelPercent', 'Топливо при приёмке, %', { type: 'number' })}
                  {field('Размер ответственности', reception?.responsibilityAmount != null
                    ? money.format(Number(reception.responsibilityAmount))
                    : '—', 'Задаётся в осмотре при приёмке')}
                </Box>
              </Section>
              <Section
                title="Даты"
                action={canCorrectDates ? (
                  <Button size="small" color="warning" startIcon={<EventRepeat />} onClick={() => onCorrectDates(vehicle)}>
                    Скорректировать дату и время
                  </Button>
                ) : undefined}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                  {field('Приёмка', dateTime(vehicle.receivedAt), 'Меняется только корректировкой с причиной')}
                  {field('Выдача', vehicle.issuedAt ? dateTime(vehicle.issuedAt) : 'ещё на стоянке')}
                  {field('Срок хранения', `${vehicle.storageDays} сут.`)}
                </Box>
              </Section>
              <Section title="Комментарий">
                {input('notes', 'Комментарий', { multiline: true })}
              </Section>
            </>
          )}

          {tab === 'reception' && (
            reception === null ? (
              <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
            ) : (
              <>
                {!receptionMeta && (
                  <Alert severity="warning">Осмотр при приёмке не сохранялся{editable ? ' — заполните и сохраните карточку.' : '.'}</Alert>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
                  <WarehouseInspectionForm
                    value={reception}
                    readOnly={!editable}
                    defaultExpanded
                    compact
                    hideNotes
                    onChange={(next) => { setReception(next); setReceptionDirty(true); }}
                  />
                  {/* схема и заметки рядом с осмотром; колонка прилипает при прокрутке длинного осмотра */}
                  <Stack spacing={1.25} sx={{ position: { lg: 'sticky' }, top: 0 }}>
                    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                      <WarehouseDamageScheme
                        value={reception}
                        vehicleType={vehicle.vehicleType}
                        readOnly={!editable}
                        compact
                        onChange={(next) => { setReception(next); setReceptionDirty(true); }}
                      />
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                      <Stack spacing={1}>
                        <TextField
                          size="small"
                          label="Личные вещи и примечания"
                          value={reception.personalItemsNotes ?? ''}
                          multiline
                          minRows={2}
                          InputProps={{ readOnly: !editable }}
                          onChange={(event) => { setReception({ ...reception, personalItemsNotes: event.target.value }); setReceptionDirty(true); }}
                        />
                        <TextField
                          size="small"
                          label="Повреждения и замечания"
                          value={reception.damageNotes ?? ''}
                          multiline
                          minRows={2}
                          InputProps={{ readOnly: !editable }}
                          onChange={(event) => { setReception({ ...reception, damageNotes: event.target.value }); setReceptionDirty(true); }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Размер ответственности Хранителя, ₽"
                          value={reception.responsibilityAmount ?? ''}
                          inputProps={{ min: 0, step: 0.01, readOnly: !editable }}
                          onChange={(event) => {
                            setReception({ ...reception, responsibilityAmount: event.target.value === '' ? null : Number(event.target.value) });
                            setReceptionDirty(true);
                          }}
                        />
                        {receptionMeta && (
                          <Typography sx={{ fontSize: 11, color: '#8b93a1' }}>
                            Осмотр провёл: {receptionMeta.inspectedByName} · {dateTime(receptionMeta.updatedAt)}
                          </Typography>
                        )}
                      </Stack>
                    </Paper>
                  </Stack>
                </Box>
              </>
            )
          )}

          {tab === 'issue' && (
            vehicle.status !== 'issued' ? (
              <Section title="Выдача ещё не оформлена">
                <Typography sx={{ fontSize: 13, color: '#5b6472' }}>
                  После выдачи здесь появится осмотр при выдаче и сравнение с приёмкой: что было при приёмке и что стало.
                </Typography>
                {canOperate && (
                  <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<Logout />} onClick={() => onIssue(vehicle)}>
                    Оформить выдачу
                  </Button>
                )}
              </Section>
            ) : !issue ? (
              <Alert severity="warning">Осмотр при выдаче не найден.</Alert>
            ) : (
              <>
                <Section
                  title="Сравнение: приёмка → выдача"
                  action={(
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="small"
                        label={diffCount ? `Расхождений: ${diffCount}` : 'Расхождений нет'}
                        sx={{ bgcolor: diffCount ? '#fef3c7' : '#dcfce7', color: diffCount ? '#92400e' : '#166534', fontWeight: 700 }}
                      />
                      <Button size="small" onClick={() => setShowAllComparison((value) => !value)}>
                        {showAllComparison ? 'Только расхождения' : 'Все позиции'}
                      </Button>
                    </Stack>
                  )}
                >
                  <Table size="small" sx={{ '& td, & th': { fontSize: 12, py: 0.6 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: '44%', fontWeight: 700 }}>Позиция</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>При приёмке</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>При выдаче</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparison
                        .filter((row) => showAllComparison || row.diff)
                        .map((row) => (
                          <TableRow key={row.label} sx={row.diff ? { bgcolor: '#fef2f2' } : undefined}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell>{row.before}</TableCell>
                            <TableCell sx={row.diff ? { color: '#b91c1c', fontWeight: 700 } : { color: '#6b7280' }}>{row.after}</TableCell>
                          </TableRow>
                        ))}
                      {!showAllComparison && diffCount === 0 && (
                        <TableRow><TableCell colSpan={3} sx={{ color: '#166534' }}>ТС выдано в том же состоянии, что и принято.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Section>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, maxWidth: 560 }}>
                  <WarehouseDamageScheme value={issue} vehicleType={vehicle.vehicleType} readOnly compact onChange={() => undefined} />
                  {issueMeta && (
                    <Typography sx={{ fontSize: 11, color: '#8b93a1', mt: 1 }}>
                      Осмотр при выдаче: {issueMeta.inspectedByName} · {dateTime(issueMeta.updatedAt)}
                    </Typography>
                  )}
                </Paper>
              </>
            )
          )}

          {tab === 'billing' && (
            billingLoading ? (
              <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
            ) : !billingLine ? (
              <Alert severity="info">Начислений по этому ТС пока нет.</Alert>
            ) : (
              <>
                <Section title={`Хранение · ${dateOnly(billingLine.storageFrom)} – ${dateOnly(billingLine.storageTo)}`}>
                  <Table size="small" sx={{ '& td, & th': { fontSize: 12, py: 0.6 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Ставка</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Суток</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Сумма</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {billingLine.storageRates.map((rate) => (
                        <TableRow key={rate.price}>
                          <TableCell>{money.format(rate.price)} / сутки</TableCell>
                          <TableCell align="right">{rate.days}</TableCell>
                          <TableCell align="right">{money.format(rate.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {billingLine.storageRates.length === 0 && (
                        <TableRow><TableCell colSpan={3} sx={{ color: '#b45309' }}>Тариф хранения не задан — хранение не начислено.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Section>
                <Section
                  title="Услуги"
                  action={(
                    <Button size="small" startIcon={<MiscellaneousServices />} onClick={() => onOpenServices(vehicle)}>
                      {canEditServices && vehicle.status === 'on_site' ? 'Добавить или исправить услугу' : 'Подробнее'}
                    </Button>
                  )}
                >
                  <Table size="small" sx={{ '& td, & th': { fontSize: 12, py: 0.6 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Дата</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Услуга</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Кол-во</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Цена</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Сумма</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Выполнил</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {billingLine.services.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>{dateTime(service.performedAt)}</TableCell>
                          <TableCell>{service.name}</TableCell>
                          <TableCell align="right">{service.quantity}</TableCell>
                          <TableCell align="right">{money.format(service.unitPrice)}</TableCell>
                          <TableCell align="right">{money.format(service.amount)}</TableCell>
                          <TableCell>{service.performedByName}</TableCell>
                        </TableRow>
                      ))}
                      {billingLine.services.length === 0 && (
                        <TableRow><TableCell colSpan={6} sx={{ color: '#8b93a1' }}>Услуг нет</TableCell></TableRow>
                      )}
                      <TableRow>
                        <TableCell colSpan={4} sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>
                          Итого {vehicle.status === 'issued' ? 'за хранение' : `на ${dateOnly(todayYmd())}`} (хранение + услуги)
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>{money.format(billingLine.totalAmount)}</TableCell>
                        <TableCell sx={{ bgcolor: '#f8fafc' }} />
                      </TableRow>
                    </TableBody>
                  </Table>
                  <Typography sx={{ fontSize: 11, color: '#8b93a1', mt: 0.75 }}>
                    Расчёт по текущим тарифам с учётом прайса клиента. Закрытые периоды в актах не пересчитываются.
                  </Typography>
                </Section>
              </>
            )
          )}

          {tab === 'photos' && (
            <WarehousePhotoDialog open vehicle={vehicle} readOnly={!canOperate} onClose={() => undefined} embedded />
          )}

          {tab === 'docs' && (
            <Section title="Документы">
              <Stack spacing={1}>
                {([
                  { phase: 'reception' as const, title: 'Акт приёма-передачи на хранение', available: Boolean(receptionMeta), note: receptionMeta ? `осмотр от ${dateTime(receptionMeta.updatedAt)}` : 'осмотр при приёмке не сохранён' },
                  { phase: 'issue' as const, title: 'Акт возврата с хранения', available: Boolean(issueMeta), note: vehicle.status === 'issued' ? `выдача ${dateTime(vehicle.issuedAt)}` : 'сформируется после оформления выдачи' },
                ]).map((doc) => (
                  <Stack
                    key={doc.phase}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ border: '1px solid #e1e4ea', borderRadius: 2, px: 1.5, py: 1.1, opacity: doc.available ? 1 : 0.55 }}
                  >
                    <PictureAsPdf sx={{ color: '#b91c1c' }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: 13 }}>{doc.title}</Typography>
                      <Typography sx={{ fontSize: 11, color: '#8b93a1' }}>{vehicle.warehouseNumber} · {doc.note}</Typography>
                    </Box>
                    {doc.available && (
                      <Button size="small" variant="outlined" onClick={() => void downloadAct(doc.phase)}>Скачать PDF</Button>
                    )}
                  </Stack>
                ))}
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ border: '1px solid #e1e4ea', borderRadius: 2, px: 1.5, py: 1.1 }}>
                  <Box sx={{ width: 24, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#1d4ed8' }}>ДОГ</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13 }}>Договор хранения клиента</Typography>
                    <Typography sx={{ fontSize: 11, color: '#8b93a1' }}>
                      {client?.contractNumber
                        ? `№ ${client.contractNumber}${client.contractDate ? ` от ${dateOnly(client.contractDate)}` : ''}${client.contractEndDate ? ` · действует до ${dateOnly(client.contractEndDate)}` : ''}`
                        : 'номер договора не указан в карточке клиента'}
                    </Typography>
                  </Box>
                  {client?.contractStatus === 'expired' && <Chip size="small" color="error" label="Истёк" />}
                  {client?.contractStatus === 'expiring' && <Chip size="small" color="warning" label={`Истекает через ${client.contractDaysRemaining} дн.`} />}
                </Stack>
              </Stack>
            </Section>
          )}

          {tab === 'history' && canViewHistory && (
            operations === null ? (
              <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
            ) : operations.length === 0 ? (
              <Alert severity="info">Операций пока нет.</Alert>
            ) : (
              <Box sx={{ position: 'relative', pl: 2.5, '&::before': { content: '""', position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, bgcolor: '#e1e6ed' } }}>
                {operations.map((operation) => {
                  const warn = operation.type === 'dates_corrected' || operation.type === 'photo_deleted' || operation.type === 'service_corrected';
                  return (
                    <Box key={operation.id} sx={{ position: 'relative', pb: 1.5 }}>
                      <Box sx={{ position: 'absolute', left: -19.5, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: warn ? '#f59e0b' : '#1d4ed8', border: '2px solid #fff', boxShadow: '0 0 0 1px #c7d2fe' }} />
                      <Typography sx={{ fontSize: 11, color: '#8b93a1' }}>{dateTime(operation.createdAt)} · {operation.actorName}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{operation.title}</Typography>
                      {operation.description && (
                        <Typography sx={{ fontSize: 12, color: '#5b6472' }}>{operation.description}</Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )
          )}
        </Stack>
      </DialogContent>

      {editable && missing.length > 0 && (
        <Box sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontSize: 12, px: 2.5, py: 0.9, borderTop: '1px solid #fde7cf' }}>
          Не заполнено: {missing.join(', ')} — проверьте перед выдачей.
        </Box>
      )}
      <DialogActions sx={{ px: 2.5, py: 1.25, borderTop: '1px solid #eef1f5' }}>
        {!editable && (
          <Typography sx={{ fontSize: 12, color: '#5b6472', mr: 'auto' }}>
            {vehicle.status === 'issued' && canOperate ? 'ТС выдано — карточка только для просмотра' : 'Режим просмотра'}
          </Typography>
        )}
        <Button onClick={handleClose} disabled={saving}>Закрыть</Button>
        {editable && (
          <Button variant="contained" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Сохранение…' : 'Сохранить изменения'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
