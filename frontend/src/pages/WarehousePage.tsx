import {
  Add,
  DirectionsCar,
  Edit,
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createWarehouseVehicle,
  getWarehouseClients,
  getWarehouseVehicles,
  issueWarehouseVehicle,
  updateWarehouseVehicle,
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

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyForm = (): WarehouseVehiclePayload => ({
  counterpartyId: '',
  requestNumber: '',
  requestDate: today(),
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
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isWarehouseKeeper = user?.role === 'warehouse_keeper';
  const canOperateWarehouse = user?.role !== 'counterparty_user';
  const canEditServices = ['admin', 'warehouse_manager', 'warehouse_keeper', 'financer']
    .includes(user?.role ?? '');
  const canManageClients = user?.role === 'admin' || user?.role === 'warehouse_manager';
  const canManageTariffs = ['admin', 'warehouse_manager', 'financer'].includes(user?.role ?? '');
  const canViewBilling = user?.role !== 'warehouse_keeper';
  const canCloseBilling = ['admin', 'warehouse_manager', 'financer'].includes(user?.role ?? '');
  const showTabs = canManageClients || canManageTariffs || canViewBilling;
  const [tab, setTab] = useState<'registry' | 'clients' | 'tariffs' | 'billing'>('registry');
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
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
  const [issueVehicle, setIssueVehicle] = useState<WarehouseVehicle | null>(null);
  const [issueDate, setIssueDate] = useState(today());
  const [photoVehicle, setPhotoVehicle] = useState<WarehouseVehicle | null>(null);
  const [servicesVehicle, setServicesVehicle] = useState<WarehouseVehicle | null>(null);

  const loadCounterparties = useCallback(async () => {
    const response = await getWarehouseClients(false);
    setCounterparties(response.data.map((client) => ({
      id: client.counterpartyId,
      inn: client.inn,
      nameFull: client.nameFull,
      nameShort: client.nameShort,
    })));
  }, []);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
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
    if (!canOperateWarehouse || searchParams.get('receive') !== '1') return;
    setEditingVehicle(null);
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
    if (!isWarehouseKeeper) {
      navigate('/warehouse', { replace: true });
    }
  }, [canOperateWarehouse, isWarehouseKeeper, navigate, searchParams]);

  const closeVehicleDialog = () => {
    setDialogOpen(false);
    if (isWarehouseKeeper && !editingVehicle) {
      navigate('/warehouse/operations', { replace: true });
    }
  };

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
          receivedDate: form.receivedDate,
          fuelLevelPercent: form.fuelLevelPercent,
          notes: form.notes,
        });
        setSuccess('Карточка ТС обновлена.');
      } else {
        const response = await createWarehouseVehicle(form);
        setSuccess(`Создана карточка ${response.data.warehouseNumber}.`);
      }
      setDialogOpen(false);
      if (isWarehouseKeeper && !editingVehicle) {
        navigate('/warehouse/operations', { replace: true });
        return;
      }
      await loadVehicles();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Не удалось сохранить карточку ТС.'));
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async () => {
    if (!issueVehicle) return;
    setSaving(true);
    setError(null);
    try {
      await issueWarehouseVehicle(issueVehicle.id, issueDate);
      setSuccess(`ТС ${issueVehicle.warehouseNumber} выдано.`);
      setIssueVehicle(null);
      await loadVehicles();
    } catch (issueError) {
      setError(errorMessage(issueError, 'Не удалось оформить выдачу.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          gap={2}
        >
          <Box>
            <Typography variant="h4" component="h1">Склад ТС</Typography>
            <Typography color="text.secondary">
              Реестр техники на хранении и история складских операций
            </Typography>
          </Box>
          {canOperateWarehouse && tab === 'registry' && (
            <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
              Принять ТС
            </Button>
          )}
        </Stack>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        {showTabs && (
          <Tabs
            value={tab}
            onChange={(_event, value) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab value="registry" label="Реестр ТС" />
            {canManageClients && <Tab value="clients" label="Клиенты склада" />}
            {canManageTariffs && <Tab value="tariffs" label="Услуги и тарифы" />}
            {canViewBilling && <Tab value="billing" label="Начисления и акты" />}
          </Tabs>
        )}

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
                <MenuItem value="passenger">Легковой</MenuItem>
                <MenuItem value="truck">Грузовой</MenuItem>
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
                    <Stack direction="row" spacing={1} alignItems="center">
                      {vehicle.vehicleType === 'truck'
                        ? <LocalShipping fontSize="small" color="action" />
                        : <DirectionsCar fontSize="small" color="action" />}
                      <span>{vehicle.brand} {vehicle.model}</span>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{vehicle.vin || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {vehicle.registrationNumber || 'Без госномера'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{vehicle.receivedDate}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{vehicle.issuedDate || '—'}</TableCell>
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
                            onClick={() => {
                              setIssueDate(today());
                              setIssueVehicle(vehicle);
                            }}
                          >
                            <Logout fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
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

      <Dialog open={dialogOpen} onClose={() => !saving && closeVehicleDialog()} fullWidth maxWidth="md">
        <DialogTitle>
          {editingVehicle ? `Карточка ${editingVehicle.warehouseNumber}` : 'Приёмка ТС'}
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
                  label="Номер заявки"
                  value={form.requestNumber || ''}
                  onChange={(event) => setForm((current) => ({ ...current, requestNumber: event.target.value }))}
                />
                <TextField
                  fullWidth
                  type="date"
                  label="Дата заявки"
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
                  <MenuItem value="passenger">Легковой</MenuItem>
                  <MenuItem value="truck">Грузовой</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                type="date"
                label="Дата приёмки *"
                InputLabelProps={{ shrink: true }}
                value={form.receivedDate}
                onChange={(event) => setForm((current) => ({ ...current, receivedDate: event.target.value }))}
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
          <Button onClick={closeVehicleDialog} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(issueVehicle)} onClose={() => !saving && setIssueVehicle(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Выдача ТС</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              {issueVehicle?.warehouseNumber}: {issueVehicle?.brand} {issueVehicle?.model}
            </Typography>
            <TextField
              type="date"
              label="Дата выдачи"
              InputLabelProps={{ shrink: true }}
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
            {issueVehicle && (
              <Alert severity="info">
                День приёмки и день выдачи включаются в расчёт хранения.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueVehicle(null)} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleIssue()} disabled={saving}>
            Подтвердить выдачу
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
