import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import { useAuthStore } from '../store/auth-store';
import {
  EmployeeItem,
  EmployeePayload,
  FleetLocation,
  FleetVehicleItem,
  TrailerItem,
  VehicleModelItem,
  createEmployee,
  createFleetVehicle,
  createTrailer,
  createVehicleModel,
  deleteEmployee,
  deleteFleetVehicle,
  deleteTrailer,
  deleteVehicleModel,
  getEmployeeCardText,
  getEmployees,
  getFleetVehicles,
  getFuelSeasons,
  getTrailers,
  getVehicleModels,
  saveFuelSeasons,
  updateEmployee,
  updateFleetVehicle,
  updateTrailer,
  updateVehicleModel,
} from '../services/directories.api';
import { canManageFuelNormsFrontend, directoryLocationsForRole } from '../utils/rolePermissions';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };
const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

type TabKey = 'employees' | 'vehicles' | 'trailers' | 'models';

type Feedback = { severity: 'success' | 'error'; text: string } | null;

const formatDateInput = (value: string | null | undefined): string => (value ? value.slice(0, 10) : '');

const errorText = (error: unknown): string => {
  const anyError = error as any;
  return anyError?.response?.data?.message || anyError?.message || 'Не удалось выполнить операцию';
};

export default function DirectoriesPage() {
  const { user } = useAuthStore();
  const allowedLocations = useMemo(() => directoryLocationsForRole(user?.role), [user?.role]);
  const canManageNorms = canManageFuelNormsFrontend(user?.role);
  const isAdmin = user?.role === 'admin';
  const [location, setLocation] = useState<FleetLocation>(allowedLocations[0] ?? 'vvo');
  const [tab, setTab] = useState<TabKey>('employees');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicleItem[]>([]);
  const [trailers, setTrailers] = useState<TrailerItem[]>([]);
  const [models, setModels] = useState<VehicleModelItem[]>([]);
  const [seasons, setSeasons] = useState<{ winterStartMonth: number; winterEndMonth: number }>({
    winterStartMonth: 11,
    winterEndMonth: 3,
  });

  const [employeeEdit, setEmployeeEdit] = useState<Partial<EmployeeItem> | null>(null);
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [showFullData, setShowFullData] = useState(false);
  const [vehicleEdit, setVehicleEdit] = useState<Partial<FleetVehicleItem> | null>(null);
  const [vehicleModelLabel, setVehicleModelLabel] = useState('');
  const [trailerEdit, setTrailerEdit] = useState<Partial<TrailerItem> | null>(null);
  const [modelEdit, setModelEdit] = useState<Partial<VehicleModelItem> | null>(null);

  const reload = useCallback(async () => {
    try {
      const [employeesRes, vehiclesRes, trailersRes, modelsRes, seasonsRes] = await Promise.all([
        getEmployees(location).catch(() => ({ data: [] as EmployeeItem[] })),
        getFleetVehicles(location),
        getTrailers(location),
        getVehicleModels(),
        getFuelSeasons().catch(() => ({ data: { winterStartMonth: 11, winterEndMonth: 3 } })),
      ]);
      setEmployees(employeesRes.data);
      setVehicles(vehiclesRes.data);
      setTrailers(trailersRes.data);
      setModels(modelsRes.data);
      setSeasons(seasonsRes.data);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  }, [location]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredEmployees = useMemo(() => {
    if (personFilter === 'all') return employees;
    return employees.filter((e) => e.position === personFilter);
  }, [employees, personFilter]);

  const copyCard = async (employee: EmployeeItem) => {
    try {
      const { data } = await getEmployeeCardText(employee.id);
      await navigator.clipboard.writeText(data.text);
      setFeedback({ severity: 'success', text: `Карточка «${employee.fullName}» скопирована в буфер обмена` });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveEmployeeEdit = async () => {
    if (!employeeEdit) return;
    if (!employeeEdit.fullName?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите ФИО' });
      return;
    }
    const payload: EmployeePayload = {
      ...employeeEdit,
      location,
      fullName: employeeEdit.fullName.trim(),
    } as EmployeePayload;
    try {
      if (employeeEdit.id) await updateEmployee(employeeEdit.id, payload);
      else await createEmployee(payload);
      setEmployeeEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Сотрудник сохранён' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveVehicleEdit = async () => {
    if (!vehicleEdit) return;
    if (!vehicleEdit.plate?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите госномер' });
      return;
    }
    try {
      const payload = { ...vehicleEdit, location, modelLabel: vehicleModelLabel.trim(), modelId: vehicleModelLabel.trim() ? undefined : null };
      if (vehicleEdit.id) await updateFleetVehicle(vehicleEdit.id, payload);
      else await createFleetVehicle(payload);
      setVehicleEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Техника сохранена' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveTrailerEdit = async () => {
    if (!trailerEdit) return;
    if (!trailerEdit.plate?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите номер прицепа' });
      return;
    }
    try {
      const payload = { ...trailerEdit, location };
      if (trailerEdit.id) await updateTrailer(trailerEdit.id, payload);
      else await createTrailer(payload);
      setTrailerEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Прицеп сохранён' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveModelEdit = async () => {
    if (!modelEdit) return;
    if (!modelEdit.brand?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите марку' });
      return;
    }
    try {
      if (modelEdit.id) await updateVehicleModel(modelEdit.id, modelEdit);
      else await createVehicleModel(modelEdit);
      setModelEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Модель сохранена' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const removeEntity = async (kind: TabKey, id: string, label: string) => {
    if (!window.confirm(`Удалить «${label}»?`)) return;
    try {
      if (kind === 'employees') { await deleteEmployee(id); setEmployeeEdit(null); }
      if (kind === 'vehicles') { await deleteFleetVehicle(id); setVehicleEdit(null); }
      if (kind === 'trailers') { await deleteTrailer(id); setTrailerEdit(null); }
      if (kind === 'models') { await deleteVehicleModel(id); setModelEdit(null); }
      await reload();
      setFeedback({ severity: 'success', text: 'Удалено' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveSeasons = async () => {
    try {
      await saveFuelSeasons(seasons);
      setFeedback({ severity: 'success', text: 'Сезоны сохранены' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const textField = (
    label: string,
    value: string | undefined,
    onChange: (value: string) => void,
    options?: { type?: string; multiline?: boolean }
  ) => (
    <TextField
      label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      fullWidth
      type={options?.type}
      multiline={options?.multiline}
      InputLabelProps={options?.type === 'date' ? { shrink: true } : undefined}
    />
  );

  return (
    <div className="ops-preview">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5, width: '100%' }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            {allowedLocations.length > 1 ? (
              <TextField
                label="Город"
                select
                size="small"
                value={location}
                onChange={(event) => setLocation(event.target.value as FleetLocation)}
                sx={{ width: 170, '& .MuiInputBase-root': { height: 40 } }}
              >
                {allowedLocations.map((value) => (
                  <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography sx={{ fontWeight: 700 }}>{LOCATION_LABELS[location]}</Typography>
            )}
            <Tabs
              value={tab}
              onChange={(_event, value) => setTab(value as TabKey)}
              variant="scrollable"
              sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0 } }}
            >
              <Tab value="employees" label={`Персонал (${employees.length})`} />
              <Tab value="vehicles" label={`Техника (${vehicles.length})`} />
              <Tab value="trailers" label={`Прицепы (${trailers.length})`} />
              <Tab value="models" label={`Модели и нормы (${models.length})`} />
            </Tabs>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {tab === 'employees' && (
                <TextField
                  label="Роль"
                  select
                  size="small"
                  value={personFilter}
                  onChange={(event) => setPersonFilter(event.target.value)}
                  sx={{ width: 170, '& .MuiInputBase-root': { height: 40 } }}
                >
                  <MenuItem value="all">Все</MenuItem>
                  {['водитель', 'диспетчер', 'оперативник', 'автослесарь', 'сторож', 'прочее'].map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </TextField>
              )}
              {tab === 'employees' && (
                <button
                  type="button"
                  className="ops-btn ops-btn--add"
                  onClick={() => {
                    setShowFullData(false);
                    setEmployeeEdit({ position: 'водитель', status: 'active' });
                  }}
                >
                  Добавить
                </button>
              )}
              {tab === 'vehicles' && (
                <button
                  type="button"
                  className="ops-btn ops-btn--add"
                  onClick={() => {
                    setVehicleModelLabel('');
                    setVehicleEdit({ status: 'active' });
                  }}
                >
                  Добавить
                </button>
              )}
              {tab === 'trailers' && (
                <button type="button" className="ops-btn ops-btn--add" onClick={() => setTrailerEdit({ status: 'active' })}>
                  Добавить
                </button>
              )}
              {tab === 'models' && canManageNorms && (
                <button type="button" className="ops-btn ops-btn--add" onClick={() => setModelEdit({})}>
                  Добавить
                </button>
              )}
            </Box>
          </Box>
        </Paper>
      </section>

      <section className="ops-preview__matrix">
        {tab === 'employees' && (
          <>
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>ФИО</th>
                  <th style={{ minWidth: 110 }}>Роль</th>
                  <th style={{ minWidth: 130 }}>Телефон</th>
                  <th className="fuel-cell--center" style={{ minWidth: 90 }}>Статус</th>
                  <th className="fuel-cell--center" style={{ minWidth: 80 }}>Карточка</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    onDoubleClick={() => {
                      setShowFullData(false);
                      setEmployeeEdit(employee);
                    }}
                  >
                    <td className="fuel-cell--sticky">{employee.fullName}</td>
                    <td className="fuel-cell--center"><span className="dir-role">{employee.position}</span></td>
                    <td className="fuel-cell--center">{employee.phone || '—'}</td>
                    <td className="fuel-cell--center">
                      <span className={`dir-status ${employee.status === 'active' ? 'dir-status--ok' : 'dir-status--off'}`}>
                        {employee.status === 'active' ? 'работает' : 'уволен'}
                      </span>
                    </td>
                    <td className="fuel-cell--center dir-actions">
                      {employee.position === 'водитель' && (
                        <Tooltip title="Скопировать карточку водителя">
                          <IconButton size="small" onClick={() => void copyCard(employee)}>
                            <ContentCopy sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="fuel-empty">
                      {employees.length === 0 ? 'Справочник пуст — добавьте сотрудников' : 'Нет записей по выбранному фильтру'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}

        {tab === 'vehicles' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 110 }}>Г/Н ТС</th>
                  <th style={{ minWidth: 170 }}>Тип ТС</th>
                  <th style={{ minWidth: 150 }}>Модель</th>
                  <th style={{ minWidth: 90 }}>Цвет</th>
                  <th style={{ minWidth: 140 }}>VIN</th>
                  <th className="fuel-cell--center" style={{ minWidth: 90 }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    onDoubleClick={() => {
                      setVehicleModelLabel(vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '');
                      setVehicleEdit(vehicle);
                    }}
                  >
                    <td className="fuel-cell--sticky">{vehicle.plate}</td>
                    <td className="fuel-cell--left">{vehicle.vehicleKind || '—'}</td>
                    <td className="fuel-cell--left">{vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '—'}</td>
                    <td className="fuel-cell--center">{vehicle.color || '—'}</td>
                    <td className="fuel-cell--left">{vehicle.vin || '—'}</td>
                    <td className="fuel-cell--center">
                      <span className={`dir-status ${vehicle.status === 'active' ? 'dir-status--ok' : vehicle.status === 'repair' ? 'dir-status--warn' : 'dir-status--off'}`}>
                        {vehicle.status === 'active' ? 'в работе' : vehicle.status === 'repair' ? 'ремонт' : 'архив'}
                      </span>
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="fuel-empty">Справочник пуст — техника появится из графиков или добавьте вручную</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'trailers' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Номер</th>
                  <th style={{ minWidth: 260 }}>Примечание</th>
                  <th className="fuel-cell--center" style={{ minWidth: 90 }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {trailers.map((trailer) => (
                  <tr key={trailer.id} onDoubleClick={() => setTrailerEdit(trailer)}>
                    <td className="fuel-cell--sticky">{trailer.plate}</td>
                    <td className="fuel-cell--left">{trailer.note || '—'}</td>
                    <td className="fuel-cell--center">
                      <span className={`dir-status ${trailer.status === 'active' ? 'dir-status--ok' : 'dir-status--off'}`}>
                        {trailer.status === 'active' ? 'в работе' : 'архив'}
                      </span>
                    </td>
                  </tr>
                ))}
                {trailers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="fuel-empty">Справочник пуст — добавьте прицепы</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'models' && (
          <>
            {canManageNorms && (
              <Paper sx={{ p: 1.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 13, color: '#6b7280' }}>Зимний период:</Typography>
                  <TextField
                    select size="small" sx={{ minWidth: 140, '& .MuiInputBase-root': { height: 36 } }}
                    value={seasons.winterStartMonth}
                    onChange={(event) => setSeasons((prev) => ({ ...prev, winterStartMonth: Number(event.target.value) }))}
                  >
                    {MONTH_GENITIVE.map((name, index) => (
                      <MenuItem key={name} value={index + 1}>с 1 {name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select size="small" sx={{ minWidth: 170, '& .MuiInputBase-root': { height: 36 } }}
                    value={seasons.winterEndMonth}
                    onChange={(event) => setSeasons((prev) => ({ ...prev, winterEndMonth: Number(event.target.value) }))}
                  >
                    {MONTH_GENITIVE.map((name, index) => (
                      <MenuItem key={name} value={index + 1}>по конец {name}</MenuItem>
                    ))}
                  </TextField>
                  <button type="button" className="ops-btn ghost" onClick={() => void saveSeasons()}>
                    Сохранить сезоны
                  </button>
                </Box>
              </Paper>
            )}
            <div className="dir-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Марка / модель</th>
                    <th className="fuel-cell--center" style={{ minWidth: 140 }}>Норма зима, л/100км</th>
                    <th className="fuel-cell--center" style={{ minWidth: 140 }}>Норма лето, л/100км</th>
                    <th className="fuel-cell--center" style={{ minWidth: 80 }}>Машин</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id} onDoubleClick={canManageNorms ? () => setModelEdit(model) : undefined}>
                      <td className="fuel-cell--sticky">{`${model.brand} ${model.name}`.trim()}</td>
                      <td className="fuel-cell--center">{model.fuelNormWinter ?? '—'}</td>
                      <td className="fuel-cell--center">{model.fuelNormSummer ?? '—'}</td>
                      <td className="fuel-cell--center">{model.vehicleCount ?? 0}</td>
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr>
                      <td colSpan={4} className="fuel-empty">Моделей пока нет — они появятся при заполнении карточек техники</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>



      {/* ─── Карточка сотрудника: полная для водителя, короткая для остальных ─── */}
      <Dialog open={Boolean(employeeEdit)} onClose={() => setEmployeeEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {(employeeEdit?.position ?? 'водитель') === 'водитель'
            ? (employeeEdit?.id ? 'Карточка водителя' : 'Новый водитель')
            : (employeeEdit?.id ? 'Карточка сотрудника' : 'Новый сотрудник')}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
            {textField('ФИО', employeeEdit?.fullName, (value) => setEmployeeEdit((prev) => ({ ...prev, fullName: value })))}
            <TextField
              select size="small" label="Роль" fullWidth
              value={employeeEdit?.position ?? 'водитель'}
              onChange={(event) => setEmployeeEdit((prev) => ({ ...prev, position: event.target.value }))}
            >
              {['водитель', 'диспетчер', 'оперативник', 'автослесарь', 'сторож', 'прочее'].map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>
            {textField('Телефон', employeeEdit?.phone, (value) => setEmployeeEdit((prev) => ({ ...prev, phone: value })))}
            <TextField
              select size="small" label="Статус" fullWidth
              value={employeeEdit?.status ?? 'active'}
              onChange={(event) => setEmployeeEdit((prev) => ({ ...prev, status: event.target.value as 'active' | 'fired' }))}
            >
              <MenuItem value="active">работает</MenuItem>
              <MenuItem value="fired">уволен</MenuItem>
            </TextField>
          </Box>
          {(employeeEdit?.position ?? 'водитель') !== 'водитель' && !showFullData && (
            <Button size="small" sx={{ mt: 1.5 }} onClick={() => setShowFullData(true)}>
              Заполнить полные данные (паспорт, ВУ)
            </Button>
          )}
          {((employeeEdit?.position ?? 'водитель') === 'водитель' || showFullData) && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                {textField('Дата рождения', formatDateInput(employeeEdit?.birthDate), (value) => setEmployeeEdit((prev) => ({ ...prev, birthDate: value || null })), { type: 'date' })}
                {textField('Место рождения', employeeEdit?.birthPlace, (value) => setEmployeeEdit((prev) => ({ ...prev, birthPlace: value })))}
                {textField('Паспорт (серия и номер)', employeeEdit?.passportNumber, (value) => setEmployeeEdit((prev) => ({ ...prev, passportNumber: value })))}
                {textField('Дата выдачи паспорта', formatDateInput(employeeEdit?.passportIssueDate), (value) => setEmployeeEdit((prev) => ({ ...prev, passportIssueDate: value || null })), { type: 'date' })}
              </Box>
              <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5 }}>
                {textField('Кем выдан паспорт', employeeEdit?.passportIssuedBy, (value) => setEmployeeEdit((prev) => ({ ...prev, passportIssuedBy: value })))}
                {textField('Адрес регистрации', employeeEdit?.registrationAddress, (value) => setEmployeeEdit((prev) => ({ ...prev, registrationAddress: value })))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                {textField('ВУ (номер)', employeeEdit?.licenseNumber, (value) => setEmployeeEdit((prev) => ({ ...prev, licenseNumber: value })))}
                {textField('Дата выдачи ВУ', formatDateInput(employeeEdit?.licenseIssueDate), (value) => setEmployeeEdit((prev) => ({ ...prev, licenseIssueDate: value || null })), { type: 'date' })}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Машина и прицеп не закрепляются в справочнике — сцепка берётся из строки графика.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {isAdmin && employeeEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('employees', employeeEdit.id!, employeeEdit.fullName ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setEmployeeEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveEmployeeEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Карточка техники ─── */}
      <Dialog open={Boolean(vehicleEdit)} onClose={() => setVehicleEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{vehicleEdit?.id ? 'Карточка техники' : 'Новая техника'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
            {textField('Госномер', vehicleEdit?.plate, (value) => setVehicleEdit((prev) => ({ ...prev, plate: value })))}
            {textField('Тип ТС', vehicleEdit?.vehicleKind, (value) => setVehicleEdit((prev) => ({ ...prev, vehicleKind: value })))}
            <Autocomplete
              freeSolo
              size="small"
              options={models.map((model) => `${model.brand} ${model.name}`.trim())}
              value={vehicleModelLabel}
              onChange={(_event, value) => setVehicleModelLabel(value ?? '')}
              onInputChange={(_event, value) => setVehicleModelLabel(value)}
              renderInput={(params) => (
                <TextField {...params} label="Модель" placeholder="Начните вводить — или выберите из списка" fullWidth />
              )}
            />
            {textField('Цвет', vehicleEdit?.color, (value) => setVehicleEdit((prev) => ({ ...prev, color: value })))}
            {textField('VIN', vehicleEdit?.vin, (value) => setVehicleEdit((prev) => ({ ...prev, vin: value })))}
            <TextField
              select size="small" label="Статус" fullWidth
              value={vehicleEdit?.status ?? 'active'}
              onChange={(event) => setVehicleEdit((prev) => ({ ...prev, status: event.target.value as FleetVehicleItem['status'] }))}
            >
              <MenuItem value="active">в работе</MenuItem>
              <MenuItem value="repair">ремонт</MenuItem>
              <MenuItem value="archived">архив</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          {isAdmin && vehicleEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('vehicles', vehicleEdit.id!, vehicleEdit.plate ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setVehicleEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveVehicleEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Прицеп ─── */}
      <Dialog open={Boolean(trailerEdit)} onClose={() => setTrailerEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{trailerEdit?.id ? 'Прицеп' : 'Новый прицеп'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            {textField('Номер прицепа', trailerEdit?.plate, (value) => setTrailerEdit((prev) => ({ ...prev, plate: value })))}
            {textField('Примечание', trailerEdit?.note, (value) => setTrailerEdit((prev) => ({ ...prev, note: value })))}
          </Box>
        </DialogContent>
        <DialogActions>
          {isAdmin && trailerEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('trailers', trailerEdit.id!, trailerEdit.plate ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setTrailerEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveTrailerEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Модель ─── */}
      <Dialog open={Boolean(modelEdit)} onClose={() => setModelEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{modelEdit?.id ? 'Модель техники' : 'Новая модель'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            {textField('Марка', modelEdit?.brand, (value) => setModelEdit((prev) => ({ ...prev, brand: value })))}
            {textField('Модель', modelEdit?.name, (value) => setModelEdit((prev) => ({ ...prev, name: value })))}
            {textField('Норма зима, л/100км', modelEdit?.fuelNormWinter ?? '', (value) => setModelEdit((prev) => ({ ...prev, fuelNormWinter: value || null })), { type: 'number' })}
            {textField('Норма лето, л/100км', modelEdit?.fuelNormSummer ?? '', (value) => setModelEdit((prev) => ({ ...prev, fuelNormSummer: value || null })), { type: 'number' })}
          </Box>
        </DialogContent>
        <DialogActions>
          {isAdmin && modelEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('models', modelEdit.id!, `${modelEdit.brand ?? ''} ${modelEdit.name ?? ''}`.trim())}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setModelEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveModelEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback?.severity ?? 'success'} onClose={() => setFeedback(null)}>
          {feedback?.text}
        </Alert>
      </Snackbar>
    </div>
  );
}
