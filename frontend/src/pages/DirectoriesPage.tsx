import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy, Delete, Edit } from '@mui/icons-material';
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

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };
const MONTH_OPTIONS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
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
  const [vehicleEdit, setVehicleEdit] = useState<Partial<FleetVehicleItem> | null>(null);
  const [vehicleModelLabel, setVehicleModelLabel] = useState('');
  const [trailerEdit, setTrailerEdit] = useState<Partial<TrailerItem> | null>(null);
  const [modelEdit, setModelEdit] = useState<Partial<VehicleModelItem> | null>(null);
  const [cardPreview, setCardPreview] = useState<{ fullName: string; text: string } | null>(null);

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

  const copyCard = async (employee: EmployeeItem) => {
    try {
      const { data } = await getEmployeeCardText(employee.id);
      await navigator.clipboard.writeText(data.text);
      setFeedback({ severity: 'success', text: `Карточка «${employee.fullName}» скопирована в буфер обмена` });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const showCard = async (employee: EmployeeItem) => {
    try {
      const { data } = await getEmployeeCardText(employee.id);
      setCardPreview({ fullName: employee.fullName, text: data.text });
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
      if (kind === 'employees') await deleteEmployee(id);
      if (kind === 'vehicles') await deleteFleetVehicle(id);
      if (kind === 'trailers') await deleteTrailer(id);
      if (kind === 'models') await deleteVehicleModel(id);
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
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700}>Справочники</Typography>
        {allowedLocations.length > 1 ? (
          <TextField
            select
            size="small"
            value={location}
            onChange={(event) => setLocation(event.target.value as FleetLocation)}
            sx={{ minWidth: 180 }}
          >
            {allowedLocations.map((value) => (
              <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
            ))}
          </TextField>
        ) : (
          <Chip label={LOCATION_LABELS[location]} />
        )}
      </Box>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_event, value) => setTab(value as TabKey)} variant="scrollable">
          <Tab value="employees" label={`Сотрудники (${employees.length})`} />
          <Tab value="vehicles" label={`Техника (${vehicles.length})`} />
          <Tab value="trailers" label={`Прицепы (${trailers.length})`} />
          <Tab value="models" label={`Модели и нормы (${models.length})`} />
        </Tabs>
      </Paper>

      {tab === 'employees' && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Сотрудники · {LOCATION_LABELS[location]}
            </Typography>
            <Button variant="contained" onClick={() => setEmployeeEdit({ position: 'водитель', status: 'active' })}>
              Добавить сотрудника
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Роль</TableCell>
                  <TableCell>Телефон</TableCell>
                  <TableCell>Закрепление</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} hover>
                    <TableCell sx={{ cursor: 'pointer' }} onClick={() => void showCard(employee)}>
                      {employee.fullName}
                    </TableCell>
                    <TableCell>{employee.position}</TableCell>
                    <TableCell>{employee.phone}</TableCell>
                    <TableCell>
                      {[employee.assignedVehicle?.plate, employee.assignedTrailer ? `прицеп ${employee.assignedTrailer.plate}` : '']
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={employee.status === 'active' ? 'работает' : 'уволен'}
                        color={employee.status === 'active' ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Скопировать карточку">
                        <IconButton size="small" onClick={() => void copyCard(employee)}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" onClick={() => setEmployeeEdit(employee)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => void removeEntity('employees', employee.id, employee.fullName)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                      Справочник пуст — добавьте сотрудников
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 'vehicles' && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Техника · {LOCATION_LABELS[location]}
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                setVehicleModelLabel('');
                setVehicleEdit({ status: 'active' });
              }}
            >
              Добавить технику
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Г/Н ТС</TableCell>
                  <TableCell>Тип ТС</TableCell>
                  <TableCell>Модель</TableCell>
                  <TableCell>Цвет</TableCell>
                  <TableCell>VIN</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{vehicle.plate}</TableCell>
                    <TableCell>{vehicle.vehicleKind}</TableCell>
                    <TableCell>{vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '—'}</TableCell>
                    <TableCell>{vehicle.color}</TableCell>
                    <TableCell>{vehicle.vin}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={vehicle.status === 'active' ? 'в работе' : vehicle.status === 'repair' ? 'ремонт' : 'архив'}
                        color={vehicle.status === 'active' ? 'success' : vehicle.status === 'repair' ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setVehicleModelLabel(vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '');
                          setVehicleEdit(vehicle);
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => void removeEntity('vehicles', vehicle.id, vehicle.plate)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>
                      Справочник пуст — добавьте технику
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 'trailers' && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Прицепы · {LOCATION_LABELS[location]}
            </Typography>
            <Button variant="contained" onClick={() => setTrailerEdit({ status: 'active' })}>
              Добавить прицеп
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Номер</TableCell>
                  <TableCell>Примечание</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trailers.map((trailer) => (
                  <TableRow key={trailer.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{trailer.plate}</TableCell>
                    <TableCell>{trailer.note}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={trailer.status === 'active' ? 'в работе' : 'архив'}
                        color={trailer.status === 'active' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setTrailerEdit(trailer)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => void removeEntity('trailers', trailer.id, trailer.plate)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {trailers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                      Справочник пуст — добавьте прицепы
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 'models' && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>Модели техники и нормы расхода</Typography>
            {canManageNorms && (
              <Button variant="contained" onClick={() => setModelEdit({})}>Добавить модель</Button>
            )}
          </Box>
          {canManageNorms && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">Зимний период:</Typography>
              <TextField
                select size="small" sx={{ minWidth: 130 }}
                value={seasons.winterStartMonth}
                onChange={(event) => setSeasons((prev) => ({ ...prev, winterStartMonth: Number(event.target.value) }))}
              >
                {MONTH_OPTIONS.map((name, index) => (
                  <MenuItem key={name} value={index + 1}>с 1 {name}</MenuItem>
                ))}
              </TextField>
              <TextField
                select size="small" sx={{ minWidth: 150 }}
                value={seasons.winterEndMonth}
                onChange={(event) => setSeasons((prev) => ({ ...prev, winterEndMonth: Number(event.target.value) }))}
              >
                {MONTH_OPTIONS.map((name, index) => (
                  <MenuItem key={name} value={index + 1}>по конец {name === 'март' ? 'марта' : name + 'я'}</MenuItem>
                ))}
              </TextField>
              <Button size="small" onClick={() => void saveSeasons()}>Сохранить сезоны</Button>
            </Box>
          )}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Марка / модель</TableCell>
                  <TableCell align="right">Норма зима, л/100км</TableCell>
                  <TableCell align="right">Норма лето, л/100км</TableCell>
                  <TableCell align="right">Машин</TableCell>
                  {canManageNorms && <TableCell align="right">Действия</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{`${model.brand} ${model.name}`.trim()}</TableCell>
                    <TableCell align="right">{model.fuelNormWinter ?? '—'}</TableCell>
                    <TableCell align="right">{model.fuelNormSummer ?? '—'}</TableCell>
                    <TableCell align="right">{model.vehicleCount ?? 0}</TableCell>
                    {canManageNorms && (
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setModelEdit(model)}>
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void removeEntity('models', model.id, `${model.brand} ${model.name}`.trim())}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {models.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManageNorms ? 5 : 4} align="center" sx={{ color: 'text.secondary' }}>
                      Моделей пока нет
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ─── Карточка сотрудника ─── */}
      <Dialog open={Boolean(employeeEdit)} onClose={() => setEmployeeEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{employeeEdit?.id ? 'Карточка сотрудника' : 'Новый сотрудник'}</DialogTitle>
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
            <TextField
              select size="small" label="Закреплённое авто" fullWidth
              value={employeeEdit?.assignedVehicleId ?? ''}
              onChange={(event) => setEmployeeEdit((prev) => ({ ...prev, assignedVehicleId: event.target.value || null }))}
            >
              <MenuItem value="">— не закреплено —</MenuItem>
              {vehicles.map((vehicle) => (
                <MenuItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate}{vehicle.model ? ` · ${vehicle.model.brand}` : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Прицеп" fullWidth
              value={employeeEdit?.assignedTrailerId ?? ''}
              onChange={(event) => setEmployeeEdit((prev) => ({ ...prev, assignedTrailerId: event.target.value || null }))}
            >
              <MenuItem value="">— без прицепа —</MenuItem>
              {trailers.map((trailer) => (
                <MenuItem key={trailer.id} value={trailer.id}>{trailer.plate}</MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
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
          <Button onClick={() => setModelEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveModelEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Предпросмотр карточки ─── */}
      <Dialog open={Boolean(cardPreview)} onClose={() => setCardPreview(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Карточка · {cardPreview?.fullName}</DialogTitle>
        <DialogContent>
          <Box component="pre" sx={{ font: '13px/1.6 monospace', whiteSpace: 'pre-wrap', bgcolor: 'grey.50', p: 1.5, borderRadius: 1, m: 0 }}>
            {cardPreview?.text}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardPreview(null)}>Закрыть</Button>
          <Button
            variant="contained"
            startIcon={<ContentCopy />}
            onClick={() => {
              if (cardPreview) {
                void navigator.clipboard.writeText(cardPreview.text);
                setFeedback({ severity: 'success', text: 'Карточка скопирована в буфер обмена' });
              }
            }}
          >
            Скопировать
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
          {feedback?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
