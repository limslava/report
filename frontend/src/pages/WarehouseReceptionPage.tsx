import {
  AddPhotoAlternate,
  ArrowBack,
  ArrowForward,
  CameraAlt,
  CheckCircle,
  Delete,
  DirectionsCar,
  ExpandMore,
  Save,
} from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepButton,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createWarehouseVehicle,
  getWarehouseClients,
  uploadWarehouseVehiclePhoto,
  WarehouseClient,
  WarehouseCounterparty,
  WarehouseVehicle,
  WarehouseVehiclePayload,
  WarehouseVehicleType,
} from '../services/warehouse.api';
import {
  clearWarehousePhotoQueue,
  enqueueWarehousePhoto,
  listWarehousePhotoQueue,
  reassignWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
  WarehousePhotoQueueItem,
} from '../utils/warehouse-photo-queue';
import { prepareWarehousePhoto } from '../utils/warehouse-photo-processing';

const DRAFT_KEY = 'warehouse-reception-draft-v1';
const DRAFT_PHOTO_KEY = 'draft:warehouse-reception';
const STEPS = ['Основа', 'ТС', 'Осмотр', 'Фото', 'Проверка'];

const today = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const formatOperationDateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

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

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string; errors?: Array<{ msg?: string }> } };
    }).response;
    return response?.data?.message || response?.data?.errors?.[0]?.msg || 'Не удалось выполнить приёмку.';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить приёмку.';
};

interface DraftState {
  form: WarehouseVehiclePayload;
  activeStep: number;
  savedAt: string;
}

interface DraftPhoto extends WarehousePhotoQueueItem {
  previewUrl: string;
}

export default function WarehouseReceptionPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<WarehouseVehiclePayload>(emptyForm);
  const [counterparties, setCounterparties] = useState<WarehouseCounterparty[]>([]);
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [completedVehicle, setCompletedVehicle] = useState<WarehouseVehicle | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [basisOpen, setBasisOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) return;
    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [error]);

  const loadDraftPhotos = useCallback(async () => {
    const queued = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return queued.map((photo) => ({
        ...photo,
        previewUrl: URL.createObjectURL(photo.blob),
      }));
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const clientsResponse = await getWarehouseClients(false);
        setClients(clientsResponse.data);
        setCounterparties(clientsResponse.data.map((client) => ({
          id: client.counterpartyId,
          inn: client.inn,
          nameFull: client.nameFull,
          nameShort: client.nameShort,
        })));
        const rawDraft = localStorage.getItem(DRAFT_KEY);
        if (rawDraft) {
          const draft = JSON.parse(rawDraft) as DraftState;
          if (draft?.form) setForm({ ...emptyForm(), ...draft.form });
          if (Number.isInteger(draft?.activeStep)) {
            setActiveStep(Math.max(0, Math.min(STEPS.length - 1, draft.activeStep)));
          }
        }
        await loadDraftPhotos();
      } catch (loadError) {
        setError(messageFromError(loadError));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [loadDraftPhotos]);

  useEffect(() => {
    if (loading || completedVehicle) return;
    const timer = window.setTimeout(() => {
      const draft: DraftState = {
        form,
        activeStep,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeStep, completedVehicle, form, loading]);

  useEffect(() => () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, [photos]);

  const selectedCounterparty = useMemo(
    () => counterparties.find((item) => item.id === form.counterpartyId) ?? null,
    [counterparties, form.counterpartyId],
  );
  const selectedClient = useMemo(
    () => clients.find((item) => item.counterpartyId === form.counterpartyId) ?? null,
    [clients, form.counterpartyId],
  );

  const stepErrors = useMemo(() => [
    !form.counterpartyId,
    !form.brand.trim() || !form.model.trim(),
    form.fuelLevelPercent != null
      && (form.fuelLevelPercent < 0 || form.fuelLevelPercent > 100),
    photos.length === 0,
    false,
  ], [form, photos.length]);

  const validateStep = (step: number): string | null => {
    if (step === 0 && !form.counterpartyId) return 'Выберите контрагента.';
    if (step === 1 && (!form.brand.trim() || !form.model.trim())) {
      return 'Заполните марку и модель.';
    }
    if (
      step === 2
      && form.fuelLevelPercent != null
      && (form.fuelLevelPercent < 0 || form.fuelLevelPercent > 100)
    ) {
      return 'Уровень топлива должен быть от 0 до 100%.';
    }
    if (step === 3 && photos.length === 0) return 'Добавьте хотя бы одну фотографию.';
    return null;
  };

  const goNext = () => {
    const validationError = validateStep(activeStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setActiveStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (photos.length + files.length > 60) {
      setError('Для одного ТС разрешено не более 60 фотографий.');
      return;
    }
    setProcessingPhotos(true);
    setError(null);
    setProgress({ done: 0, total: files.length, label: 'Подготовка фотографий' });
    try {
      let done = 0;
      for (const file of files) {
        const prepared = await prepareWarehousePhoto(file);
        await enqueueWarehousePhoto({
          vehicleId: DRAFT_PHOTO_KEY,
          name: prepared.name,
          blob: prepared.blob,
        });
        done += 1;
        setProgress({ done, total: files.length, label: 'Подготовка фотографий' });
      }
      await loadDraftPhotos();
    } catch (photoError) {
      setError(messageFromError(photoError));
    } finally {
      setProcessingPhotos(false);
    }
  };

  const removePhoto = async (photo: DraftPhoto) => {
    if (!photo.id) return;
    await removeWarehousePhotoQueueItem(photo.id);
    await loadDraftPhotos();
  };

  const clearDraft = async () => {
    localStorage.removeItem(DRAFT_KEY);
    await clearWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    setForm(emptyForm());
    setActiveStep(0);
    await loadDraftPhotos();
  };

  const exitReception = () => {
    navigate('/warehouse/operations', { replace: true });
  };

  const submit = async () => {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const validationError = validateStep(index);
      if (validationError) {
        setActiveStep(index);
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setUploadWarning(null);
    try {
      setProgress({ done: 0, total: 1, label: 'Создание карточки ТС' });
      const { receivedDate: _ignoredReceivedDate, ...automaticReceptionPayload } = form;
      const vehicleResponse = await createWarehouseVehicle(automaticReceptionPayload);
      const vehicle = vehicleResponse.data;
      await reassignWarehousePhotoQueue(DRAFT_PHOTO_KEY, vehicle.id);
      const queue = await listWarehousePhotoQueue(vehicle.id);
      setProgress({ done: 0, total: queue.length, label: 'Загрузка фотографий' });
      let uploaded = 0;
      try {
        for (const item of queue) {
          if (!item.id) continue;
          await uploadWarehouseVehiclePhoto(vehicle.id, item.blob, item.name);
          await removeWarehousePhotoQueueItem(item.id);
          uploaded += 1;
          setProgress({ done: uploaded, total: queue.length, label: 'Загрузка фотографий' });
        }
      } catch (uploadError) {
        setUploadWarning(
          `Карточка создана, но часть фото осталась в очереди: ${messageFromError(uploadError)}`,
        );
      }
      localStorage.removeItem(DRAFT_KEY);
      setCompletedVehicle(vehicle);
    } catch (submitError) {
      setError(messageFromError(submitError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ py: 12, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  if (completedVehicle) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 760, mx: 'auto' }}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2.5} alignItems="center" textAlign="center">
              <CheckCircle color="success" sx={{ fontSize: 72 }} />
              <Typography variant="h4">ТС принято</Typography>
              <Typography variant="h5">{completedVehicle.warehouseNumber}</Typography>
              <Typography>
                {completedVehicle.brand} {completedVehicle.model}
              </Typography>
              {uploadWarning && <Alert severity="warning">{uploadWarning}</Alert>}
              <Alert severity="success">
                Приёмка зафиксирована автоматически: {formatOperationDateTime(completedVehicle.receivedAt)}.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setCompletedVehicle(null);
                    setForm(emptyForm());
                    setActiveStep(0);
                    setPhotos([]);
                  }}
                >
                  Принять ещё одно ТС
                </Button>
                <Button variant="contained" onClick={() => navigate('/warehouse/operations', { replace: true })}>
                  Вернуться на рабочую станцию
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        bgcolor: 'grey.50',
        p: { xs: 1, md: 3 },
        overflowX: 'hidden',
      }}
    >
      <Stack spacing={{ xs: 1, md: 2.5 }} sx={{ maxWidth: 980, mx: 'auto' }}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.25, md: 2.5 },
            display: { xs: 'none', md: 'block' },
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'flex-start' }}
            gap={2}
          >
            <Box>
              <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 30, md: 34 } }}>
                Приёмка транспортного средства
              </Typography>
              <Typography color="text.secondary">
                Черновик сохраняется автоматически на этом устройстве
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button fullWidth color="inherit" onClick={() => void clearDraft()}>
                Очистить черновик
              </Button>
              <Button fullWidth startIcon={<ArrowBack />} onClick={exitReception}>
                Выйти
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {error && (
          <Box ref={errorRef}>
            <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
          </Box>
        )}

        <Paper
          variant="outlined"
          sx={{ px: 2, py: 2, display: { xs: 'none', md: 'block' } }}
        >
          <Stepper nonLinear activeStep={activeStep} alternativeLabel>
            {STEPS.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepButton onClick={() => {
                    if (index <= activeStep) setActiveStep(index);
                  }}
                >
                  <StepLabel error={stepErrors[index] && index <= activeStep}>
                    {label}
                  </StepLabel>
                </StepButton>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 3 } }}>
          <Stack spacing={{ xs: 1.5, md: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" color="primary">
                  Шаг {activeStep + 1} из {STEPS.length}
                </Typography>
                <Typography
                  variant="h5"
                  sx={{ fontSize: { xs: 26, md: 30 }, lineHeight: 1.15 }}
                >
                  {STEPS[activeStep]}
                </Typography>
              </Box>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ display: { xs: 'flex', md: 'none' } }}
              >
                <IconButton
                  size="small"
                  aria-label="Очистить черновик"
                  onClick={() => void clearDraft()}
                >
                  <Delete fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label="Выйти из приёмки" onClick={exitReception}>
                  <ArrowBack fontSize="small" />
                </IconButton>
              </Stack>
              <Chip
                label="Складская площадка"
                variant="outlined"
                size="small"
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              />
            </Stack>

            {activeStep === 0 && (
              <>
                <Stack spacing={0.75}>
                  <Typography
                    component="label"
                    variant="body2"
                    fontWeight={600}
                    color="text.secondary"
                  >
                    Контрагент *
                  </Typography>
                  <Autocomplete
                    options={counterparties}
                    value={selectedCounterparty}
                    onChange={(_event, value) => setForm((current) => ({
                      ...current,
                      counterpartyId: value?.id ?? '',
                    }))}
                    getOptionLabel={(option) => `${option.nameShort || option.nameFull} — ${option.inn}`}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Выберите клиента склада"
                        inputProps={{
                          ...params.inputProps,
                          'aria-label': 'Контрагент',
                        }}
                      />
                    )}
                  />
                </Stack>
                {selectedClient?.contractStatus === 'expired' && (
                  <Alert severity="error">
                    Договор хранения истёк {selectedClient.contractEndDate}.
                    Приёмка не заблокирована системой, но требует подтверждения руководителя склада.
                  </Alert>
                )}
                {selectedClient?.contractStatus === 'expiring' && (
                  <Alert severity="warning">
                    До окончания договора хранения осталось {selectedClient.contractDaysRemaining} дн.
                    Дата окончания: {selectedClient.contractEndDate}.
                  </Alert>
                )}
                {selectedClient?.contractStatus === 'not_set' && (
                  <Alert severity="warning">
                    Для клиента не указана дата окончания договора хранения.
                  </Alert>
                )}
                <Paper variant="outlined">
                  <Button
                    fullWidth
                    color="inherit"
                    endIcon={(
                      <ExpandMore
                        sx={{
                          transform: basisOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 150ms',
                        }}
                      />
                    )}
                    onClick={() => setBasisOpen((current) => !current)}
                    sx={{
                      justifyContent: 'space-between',
                      px: { xs: 1.5, sm: 2 },
                      py: { xs: 1.25, sm: 1.5 },
                      textAlign: 'left',
                      lineHeight: 1.25,
                    }}
                  >
                    Основание приёмки — необязательно
                  </Button>
                  <Collapse in={basisOpen}>
                    <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
                      <Alert severity="info">
                        Заполняйте только при наличии бумажной или входящей заявки контрагента.
                        Складской номер и время приёмки система сформирует автоматически.
                      </Alert>
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
                  </Collapse>
                </Paper>
              </>
            )}

            {activeStep === 1 && (
              <>
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
                  <Alert severity="info" sx={{ width: '100%', alignItems: 'center' }}>
                    Дата и время приёмки будут зафиксированы сервером при подтверждении.
                    Изменить их в рабочей станции кладовщика нельзя.
                  </Alert>
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
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label="VIN"
                    value={form.vin || ''}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      vin: event.target.value.toUpperCase(),
                    }))}
                  />
                  <TextField
                    fullWidth
                    label="Номер шасси"
                    value={form.chassisNumber || ''}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      chassisNumber: event.target.value,
                    }))}
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
              </>
            )}

            {activeStep === 2 && (
              <>
                <Alert severity="info">
                  Зафиксируйте состояние ТС на момент приёмки. Подробные повреждения должны быть видны на фотографиях.
                </Alert>
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
                  minRows={4}
                  label="Комментарий к осмотру"
                  placeholder="Царапины, вмятины, состояние салона, комплектность и другие замечания"
                  value={form.notes || ''}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </>
            )}

            {activeStep === 3 && (
              <>
                <Alert severity={photos.length > 0 ? 'success' : 'warning'}>
                  Добавлено фотографий: {photos.length}. Для техники ориентир — 30–40 снимков.
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button component="label" variant="contained" startIcon={<CameraAlt />} disabled={processingPhotos}>
                    Сделать фото
                    <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => void handleFiles(event)} />
                  </Button>
                  <Button component="label" variant="outlined" startIcon={<AddPhotoAlternate />} disabled={processingPhotos}>
                    Выбрать из галереи
                    <input hidden type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event)} />
                  </Button>
                </Stack>
                {processingPhotos && (
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      {progress.label}: {progress.done}/{progress.total}
                    </Typography>
                    <LinearProgress
                      variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
                      value={progress.total > 0 ? progress.done / progress.total * 100 : 0}
                    />
                  </Box>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                  {photos.map((photo, index) => (
                    <Box key={photo.id} sx={{ position: 'relative', aspectRatio: '4 / 3' }}>
                      <Box
                        component="img"
                        src={photo.previewUrl}
                        alt={`Фото ${index + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void removePhoto(photo)}
                        sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {activeStep === 4 && (
              <Stack spacing={2}>
                <Alert severity="info">Проверьте данные перед созданием складской карточки.</Alert>
                {[
                  ['Контрагент', selectedCounterparty?.nameShort || selectedCounterparty?.nameFull || '—'],
                  ['Входящая заявка клиента', form.requestNumber
                    ? `${form.requestNumber}${form.requestDate ? ` от ${form.requestDate}` : ''}`
                    : 'Не указана'],
                  ['Тип ТС', form.vehicleType === 'truck' ? 'Грузовой' : 'Легковой'],
                  ['ТС', `${form.brand} ${form.model}`],
                  ['VIN / шасси', form.vin || form.chassisNumber || '—'],
                  ['Госномер', form.registrationNumber || '—'],
                  ['Дата и время приёмки', 'Автоматически при подтверждении'],
                  ['Топливо', form.fuelLevelPercent === null ? 'Не указано' : `${form.fuelLevelPercent}%`],
                  ['Фотографии', String(photos.length)],
                ].map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between" gap={2} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                    <Typography color="text.secondary">{label}</Typography>
                    <Typography fontWeight={600} textAlign="right">{value}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        {saving && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" gutterBottom>
              {progress.label}: {progress.done}/{progress.total}
            </Typography>
            <LinearProgress
              variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
              value={progress.total > 0 ? progress.done / progress.total * 100 : 0}
            />
          </Paper>
        )}

        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1, sm: 1.5 },
            pb: { xs: 'calc(8px + env(safe-area-inset-bottom))', sm: 1.5 },
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            boxShadow: { xs: 3, md: 0 },
          }}
        >
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Button
              startIcon={<ArrowBack />}
              disabled={activeStep === 0 || saving}
              onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
            >
              Назад
            </Button>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<Save />}
                disabled={saving}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    form,
                    activeStep,
                    savedAt: new Date().toISOString(),
                  }));
                }}
              >
                Сохранить черновик
              </Button>
              {activeStep < STEPS.length - 1 ? (
                <Button variant="contained" endIcon={<ArrowForward />} onClick={goNext}>
                  Далее
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<DirectionsCar />}
                  disabled={saving}
                  onClick={() => void submit()}
                >
                  Принять ТС
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
