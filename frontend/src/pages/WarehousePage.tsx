import {
  Add,
  DirectionsCar,
  Edit,
  EventRepeat,
  LocalShipping,
  Logout,
  MiscellaneousServices,
  PhotoCamera,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createWarehouseVehicle,
  correctWarehouseVehicleDates,
  getWarehouseClients,
  getWarehouseVehicles,
  updateWarehouseVehicle,
  WarehouseClient,
  WarehouseCounterparty,
  WarehouseVehicle,
  WarehouseVehiclePayload,
  WarehouseVehicleStatus,
  WarehouseVehicleType,
} from '../services/warehouse.api';
import WarehousePhotoDialog from '../components/warehouse/WarehousePhotoDialog';
import WarehouseClientsPanel from '../components/warehouse/WarehouseClientsPanel';
import WarehouseServicesDialog from '../components/warehouse/WarehouseServicesDialog';
import WarehouseTariffsPanel from '../components/warehouse/WarehouseTariffsPanel';
import WarehouseBillingPanel from '../components/warehouse/WarehouseBillingPanel';
import { useAuthStore } from '../store/auth-store';
import {
  WAREHOUSE_VEHICLE_TYPES,
  warehouseVehicleTypeLabel,
} from '../constants/warehouse';

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatOperationDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const toVladivostokDateTimeInput = (value: string | null): string => {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
};

const vladivostokInputToIso = (value: string): string =>
  new Date(`${value}:00+10:00`).toISOString();

const emptyForm = (): WarehouseVehiclePayload => ({
  counterpartyId: '',
  requestNumber: '',
  requestDate: '',
  vehicleType: 'passenger',
  vin: '',
  chassisNumber: '',
  brand: '',
  model: '',
  registrationNumber: '',
  receivedDate: today(),
  fuelLevelPercent: null,
  notes: '',
});

const statusLabels: Record<WarehouseVehicleStatus, string> = {
  expected: 'Ожидается',
  on_site: 'На стоянке',
  issued: 'Выдано',
};

const errorMessage = (error: unknown, fallback: string): string => {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
  ) {
    const response = (error as { response?: { data?: { message?: string; errors?: Array<{ msg?: string }> } } }).response;
    return response?.data?.message || response?.data?.errors?.[0]?.msg || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

export default function WarehousePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canOperateWarehouse = ['admin', 'warehouse_manager', 'warehouse_keeper']
    .includes(user?.role ?? '');
  const canEditServices = ['admin', 'warehouse_manager', 'warehouse_keeper', 'financer']
    .includes(user?.role ?? '');
  const canManageClients = user?.role === 'admin' || user?.role === 'warehouse_manager';
  const canManageTariffs = ['admin', 'warehouse_manager', 'financer'].includes(user?.role ?? '');
  const canViewBilling = user?.role !== 'warehouse_keeper';
  const canCloseBilling = ['admin', 'warehouse_manager', 'financer'].includes(user?.role ?? '');
  const canCorrectDates = user?.role === 'admin' || user?.role === 'warehouse_manager';
  const showTabs = canManageClients || canManageTariffs || canViewBilling;
  const [tab, setTab] = useState<'registry' | 'clients' | 'tariffs' | 'billing'>('registry');
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
  const [warehouseClients, setWarehouseClients] = useState<WarehouseClient[]>([]);
  const [counterparties, setCounterparties] = useState<WarehouseCounterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WarehouseVehicleStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<WarehouseVehicleType | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<WarehouseVehicle | null>(null);
  const [form, setForm] = useState<WarehouseVehiclePayload>(emptyForm);
  const [photoVehicle, setPhotoVehicle] = useState<WarehouseVehicle | null>(null);
  const [servicesVehicle, setServicesVehicle] = useState<WarehouseVehicle | null>(null);
  const [dateCorrectionVehicle, setDateCorrectionVehicle] = useState<WarehouseVehicle | null>(null);
  const [dateCorrection, setDateCorrection] = useState({
    receivedAt: '',
    issuedAt: '',
    reason: '',
  });

  const loadCounterparties = useCallback(async () => {
    const response = await getWarehouseClients(false);
    setWarehouseClients(response.data);
    setCounterparties(response.data.map((client) => ({
      id: client.counterpartyId,
      inn: client.inn,
      nameFull: client.nameFull,
      nameShort: client.nameShort,
    })));
  }, []);

  const loadVehicles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await getWarehouseVehicles({
        q: search.trim() || undefined,
        status: statusFilter,
        vehicleType: typeFilter,
      });
      setVehicles(response.data);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Не удалось загрузить реестр ТС.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    void loadCounterparties().catch((loadError) => {
      setError(errorMessage(loadError, 'Не удалось загрузить контрагентов.'));
    });
  }, [loadCounterparties]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVehicles();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadVehicles]);

  useEffect(() => {
    if (tab !== 'registry') return undefined;
    const timer = window.setInterval(() => {
      void loadVehicles(true);
    }, 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadVehicles(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [loadVehicles, tab]);

  const selectedCounterparty = useMemo(
    () => counterparties.find((item) => item.id === form.counterpartyId) ?? null,
    [counterparties, form.counterpartyId],
  );

  const openCreateDialog = () => {
    setEditingVehicle(null);
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (vehicle: WarehouseVehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      counterpartyId: vehicle.counterpartyId,
      requestNumber: vehicle.requestNumber,
      requestDate: vehicle.requestDate,
      vehicleType: vehicle.vehicleType,
      vin: vehicle.vin,
      chassisNumber: vehicle.chassisNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      registrationNumber: vehicle.registrationNumber,
      receivedDate: vehicle.receivedDate,
      fuelLevelPercent: vehicle.fuelLevelPercent,
      notes: vehicle.notes,
    });
    setError(null);
    setDialogOpen(true);
  };

  const openDateCorrectionDialog = (vehicle: WarehouseVehicle) => {
    setDateCorrectionVehicle(vehicle);
    setDateCorrection({
      receivedAt: toVladivostokDateTimeInput(vehicle.receivedAt),
      issuedAt: toVladivostokDateTimeInput(vehicle.issuedAt),
      reason: '',
    });
    setError(null);
  };

  const saveDateCorrection = async () => {
    if (!dateCorrectionVehicle) return;
    if (!dateCorrection.receivedAt || dateCorrection.reason.trim().length < 10) {
      setError('Укажите дату и время приёмки, а также причину не короче 10 символов.');
      return;
    }
    if (dateCorrectionVehicle.status === 'issued' && !dateCorrection.issuedAt) {
      setError('Для выданного ТС укажите дату и время выдачи.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await correctWarehouseVehicleDates(dateCorrectionVehicle.id, {
        receivedAt: vladivostokInputToIso(dateCorrection.receivedAt),
        issuedAt: dateCorrection.issuedAt
          ? vladivostokInputToIso(dateCorrection.issuedAt)
          : null,
        reason: dateCorrection.reason.trim(),
      });
      setSuccess(`Даты ${dateCorrectionVehicle.warehouseNumber} скорректированы с записью в аудит.`);
      setDateCorrectionVehicle(null);
      await loadVehicles();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Не удалось скорректировать дату и время.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.counterpartyId || !form.brand.trim() || !form.model.trim() || !form.receivedDate) {
      setError('Заполните контрагента, марку, модель и дату приёмки.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingVehicle) {
        await updateWarehouseVehicle(editingVehicle.id, {
          vehicleType: form.vehicleType,
          vin: form.vin,
          chassisNumber: form.chassisNumber,
          brand: form.brand,
          model: form.model,
          registrationNumber: form.registrationNumber,
          fuelLevelPercent: form.fuelLevelPercent,
          notes: form.notes,
        });
        setSuccess('Карточка ТС обновлена.');
      } else {
        const response = await createWarehouseVehicle(form);
        setSuccess(`Создана карточка ${response.data.warehouseNumber}.`);
      }
      setDialogOpen(false);
      await loadVehicles();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Не удалось сохранить карточку ТС.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
        {user?.role === 'counterparty_user'
          && warehouseClients[0]?.contractStatus === 'expired' && (
            <Alert severity="error">
              Срок договора хранения истёк {warehouseClients[0].contractEndDate}.
              Обратитесь к ответственному сотруднику для продления.
            </Alert>
        )}
        {user?.role === 'counterparty_user'
          && warehouseClients[0]?.contractStatus === 'expiring' && (
            <Alert severity="warning">
              До окончания договора хранения осталось {warehouseClients[0].contractDaysRemaining} дн.
              Дата окончания: {warehouseClients[0].contractEndDate}.
            </Alert>
        )}

        <Card variant="outlined">
          <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', md: 'center' }}
              gap={2}
            >
              {showTabs ? (
                <Tabs
                  value={tab}
                  onChange={(_event, value) => setTab(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{ minHeight: 40 }}
                >
                  <Tab value="registry" label="Реестр ТС" sx={{ minHeight: 40 }} />
                  {canManageClients && <Tab value="clients" label="Клиенты склада" sx={{ minHeight: 40 }} />}
                  {canManageTariffs && <Tab value="tariffs" label="Услуги и тарифы" sx={{ minHeight: 40 }} />}
                  {canViewBilling && <Tab value="billing" label="Начисления и акты" sx={{ minHeight: 40 }} />}
                </Tabs>
              ) : (
                <Box />
              )}
              {canOperateWarehouse && tab === 'registry' && (
                <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
                  Принять ТС
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {tab === 'clients' && canManageClients ? (
          <WarehouseClientsPanel onClientsChanged={() => void loadCounterparties()} />
        ) : tab === 'tariffs' && canManageTariffs ? (
          <WarehouseTariffsPanel />
        ) : tab === 'billing' && canViewBilling ? (
          <WarehouseBillingPanel
            canClose={canCloseBilling}
            ownCounterpartyOnly={user?.role === 'counterparty_user'}
          />
        ) : (
          <>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              fullWidth
              size="small"
              label="Поиск"
              placeholder="Складской номер, VIN, госномер, марка"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Статус</InputLabel>
              <Select
                label="Статус"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as WarehouseVehicleStatus | '')}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="on_site">На стоянке</MenuItem>
                <MenuItem value="issued">Выдано</MenuItem>
                <MenuItem value="expected">Ожидается</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Тип ТС</InputLabel>
              <Select
                label="Тип ТС"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as WarehouseVehicleType | '')}
              >
                <MenuItem value="">Все</MenuItem>
                {WAREHOUSE_VEHICLE_TYPES.map((vehicleType) => (
                  <MenuItem key={vehicleType} value={vehicleType}>
                    {warehouseVehicleTypeLabel(vehicleType)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Складской №</TableCell>
                <TableCell>Контрагент</TableCell>
                <TableCell>ТС</TableCell>
                <TableCell>VIN / госномер</TableCell>
                <TableCell>Принято</TableCell>
                <TableCell>Выдано</TableCell>
                <TableCell align="right">Суток</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && vehicles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    В реестре пока нет транспортных средств
                  </TableCell>
                </TableRow>
              )}
              {!loading && vehicles.map((vehicle) => (
                <TableRow key={vehicle.id} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {vehicle.warehouseNumber}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {vehicle.counterparty.nameShort || vehicle.counterparty.nameFull}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ИНН {vehicle.counterparty.inn}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5} alignItems="flex-start">
                      <Stack direction="row" spacing={1} alignItems="center">
                        {['truck', 'trailer', 'special'].includes(vehicle.vehicleType)
                          ? <LocalShipping fontSize="small" color="action" />
                          : <DirectionsCar fontSize="small" color="action" />}
                        <span>{vehicle.brand} {vehicle.model}</span>
                      </Stack>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={warehouseVehicleTypeLabel(vehicle.vehicleType)}
                      />
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{vehicle.vin || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {vehicle.registrationNumber || 'Без госномера'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatOperationDateTime(vehicle.receivedAt)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatOperationDateTime(vehicle.issuedAt)}
                  </TableCell>
                  <TableCell align="right">{vehicle.storageDays}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statusLabels[vehicle.status]}
                      color={vehicle.status === 'on_site' ? 'success' : vehicle.status === 'issued' ? 'default' : 'warning'}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Дополнительные услуги">
                      <IconButton
                        size="small"
                        onClick={() => setServicesVehicle(vehicle)}
                      >
                        <MiscellaneousServices fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Фотографии">
                      <IconButton
                        size="small"
                        onClick={() => setPhotoVehicle(vehicle)}
                      >
                        <PhotoCamera fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canOperateWarehouse && vehicle.status !== 'issued' && (
                      <>
                        <Tooltip title="Редактировать карточку">
                          <IconButton size="small" onClick={() => openEditDialog(vehicle)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Оформить выдачу">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => navigate(`/warehouse/issue?vehicleId=${vehicle.id}`)}
                          >
                            <Logout fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {canCorrectDates && (
                      <Tooltip title="Скорректировать дату и время">
                        <IconButton
                          size="small"
                          color="warning"
                          onClick={() => openDateCorrectionDialog(vehicle)}
                        >
                          <EventRepeat fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
          </>
        )}
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editingVehicle
            ? `Карточка ${editingVehicle.warehouseNumber}`
            : 'Приёмка ТС'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            <Autocomplete
              options={counterparties}
              value={selectedCounterparty}
              disabled={Boolean(editingVehicle)}
              onChange={(_event, value) => {
                setForm((current) => ({ ...current, counterpartyId: value?.id ?? '' }));
              }}
              getOptionLabel={(option) => `${option.nameShort || option.nameFull} — ${option.inn}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => <TextField {...params} label="Контрагент *" />}
            />

            {!editingVehicle && counterparties.length === 0 && (
              <Alert severity="warning">
                Нет активных клиентов склада. Сначала добавьте организацию на вкладке «Клиенты склада».
              </Alert>
            )}

            {!editingVehicle && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Входящий номер заявки клиента"
                  value={form.requestNumber || ''}
                  onChange={(event) => setForm((current) => ({ ...current, requestNumber: event.target.value }))}
                />
                <TextField
                  fullWidth
                  type="date"
                  label="Дата заявки клиента"
                  InputLabelProps={{ shrink: true }}
                  value={form.requestDate || ''}
                  onChange={(event) => setForm((current) => ({ ...current, requestDate: event.target.value }))}
                />
              </Stack>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Тип ТС *</InputLabel>
                <Select
                  label="Тип ТС *"
                  value={form.vehicleType}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    vehicleType: event.target.value as WarehouseVehicleType,
                  }))}
                >
                  {WAREHOUSE_VEHICLE_TYPES.map((vehicleType) => (
                    <MenuItem key={vehicleType} value={vehicleType}>
                      {warehouseVehicleTypeLabel(vehicleType)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                type="date"
                label="Дата приёмки *"
                InputLabelProps={{ shrink: true }}
                value={form.receivedDate}
                disabled={Boolean(editingVehicle)}
                onChange={(event) => setForm((current) => ({ ...current, receivedDate: event.target.value }))}
                helperText={editingVehicle
                  ? 'Изменяется только через контролируемую корректировку с указанием причины'
                  : undefined}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Марка *"
                value={form.brand}
                onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Модель *"
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="VIN"
                value={form.vin || ''}
                onChange={(event) => setForm((current) => ({ ...current, vin: event.target.value.toUpperCase() }))}
              />
              <TextField
                fullWidth
                label="Номер шасси"
                value={form.chassisNumber || ''}
                onChange={(event) => setForm((current) => ({ ...current, chassisNumber: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Госномер"
                value={form.registrationNumber || ''}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  registrationNumber: event.target.value.toUpperCase(),
                }))}
              />
            </Stack>

            <TextField
              type="number"
              label="Уровень топлива при приёмке, %"
              value={form.fuelLevelPercent ?? ''}
              inputProps={{ min: 0, max: 100 }}
              onChange={(event) => setForm((current) => ({
                ...current,
                fuelLevelPercent: event.target.value === '' ? null : Number(event.target.value),
              }))}
            />

            <TextField
              multiline
              minRows={3}
              label="Комментарий"
              value={form.notes || ''}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(dateCorrectionVehicle)}
        onClose={() => !saving && setDateCorrectionVehicle(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Корректировка дат · {dateCorrectionVehicle?.warehouseNumber}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Изменение влияет на расчёт хранения. Старые и новые значения, причина и исполнитель
              будут записаны в аудит. Даты внутри закрытого периода изменить нельзя.
            </Alert>
            <TextField
              type="datetime-local"
              label="Принято"
              InputLabelProps={{ shrink: true }}
              value={dateCorrection.receivedAt}
              onChange={(event) => setDateCorrection((current) => ({
                ...current,
                receivedAt: event.target.value,
              }))}
              fullWidth
            />
            {dateCorrectionVehicle?.status === 'issued' && (
              <TextField
                type="datetime-local"
                label="Выдано"
                InputLabelProps={{ shrink: true }}
                value={dateCorrection.issuedAt}
                onChange={(event) => setDateCorrection((current) => ({
                  ...current,
                  issuedAt: event.target.value,
                }))}
                fullWidth
              />
            )}
            <TextField
              label="Причина корректировки *"
              value={dateCorrection.reason}
              onChange={(event) => setDateCorrection((current) => ({
                ...current,
                reason: event.target.value,
              }))}
              helperText="Не менее 10 символов"
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDateCorrectionVehicle(null)} disabled={saving}>Отмена</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void saveDateCorrection()}
            disabled={saving}
          >
            Сохранить корректировку
          </Button>
        </DialogActions>
      </Dialog>

      <WarehousePhotoDialog
        open={Boolean(photoVehicle)}
        vehicle={photoVehicle}
        readOnly={!canOperateWarehouse}
        onClose={() => setPhotoVehicle(null)}
      />
      <WarehouseServicesDialog
        open={Boolean(servicesVehicle)}
        vehicle={servicesVehicle}
        readOnly={!canEditServices}
        onClose={() => setServicesVehicle(null)}
      />
    </Box>
  );
}
