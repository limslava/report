import {
  AddPhotoAlternate,
  ArrowBack,
  ArrowForward,
  CameraAlt,
  CheckCircle,
  Delete,
  Logout,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  Step,
  StepButton,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getWarehousePerformedServices,
  getWarehouseVehiclePhotos,
  getWarehouseVehicles,
  issueWarehouseVehicle,
  uploadWarehouseVehiclePhoto,
  WarehousePerformedService,
  WarehousePhoto,
  WarehouseVehicle,
} from '../services/warehouse.api';
import {
  clearWarehousePhotoQueue,
  enqueueWarehousePhoto,
  listWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
  WarehousePhotoQueueItem,
} from '../utils/warehouse-photo-queue';
import { prepareWarehousePhoto } from '../utils/warehouse-photo-processing';

const STEPS = ['Выбор ТС', 'Проверка', 'Фото выдачи', 'Подтверждение'];
const ISSUE_QUEUE_PREFIX = 'draft:warehouse-issue:';
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });

const formatDateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить выдачу.';
};

interface DraftPhoto extends WarehousePhotoQueueItem {
  previewUrl: string;
}

export default function WarehouseIssuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVehicleId = searchParams.get('vehicleId');
  const [activeStep, setActiveStep] = useState(initialVehicleId ? 1 : 0);
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<WarehouseVehicle | null>(null);
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<WarehousePerformedService[]>([]);
  const [storedPhotos, setStoredPhotos] = useState<WarehousePhoto[]>([]);
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [completedVehicle, setCompletedVehicle] = useState<WarehouseVehicle | null>(null);

  const queueKey = selectedVehicle ? `${ISSUE_QUEUE_PREFIX}${selectedVehicle.id}` : null;

  const loadDraftPhotos = useCallback(async () => {
    if (!queueKey) {
      setDraftPhotos([]);
      return;
    }
    const queued = await listWarehousePhotoQueue(queueKey);
    setDraftPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return queued.map((photo) => ({ ...photo, previewUrl: URL.createObjectURL(photo.blob) }));
    });
  }, [queueKey]);

  const loadVehicleDetails = useCallback(async (vehicle: WarehouseVehicle) => {
    const [servicesResponse, photosResponse] = await Promise.all([
      getWarehousePerformedServices(vehicle.id),
      getWarehouseVehiclePhotos(vehicle.id),
    ]);
    setServices(servicesResponse.data);
    setStoredPhotos(photosResponse.data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getWarehouseVehicles({ status: 'on_site' });
        setVehicles(response.data);
        if (initialVehicleId) {
          const vehicle = response.data.find((item) => item.id === initialVehicleId);
          if (vehicle) {
            setSelectedVehicle(vehicle);
            await loadVehicleDetails(vehicle);
          } else {
            setActiveStep(0);
            setError('Выбранное ТС не найдено на стоянке.');
          }
        }
      } catch (loadError) {
        setError(messageFromError(loadError));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [initialVehicleId, loadVehicleDetails]);

  useEffect(() => {
    void loadDraftPhotos();
  }, [loadDraftPhotos]);

  useEffect(() => () => {
    draftPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, [draftPhotos]);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vehicles;
    return vehicles.filter((vehicle) => [
      vehicle.warehouseNumber,
      vehicle.vin,
      vehicle.registrationNumber,
      vehicle.brand,
      vehicle.model,
      vehicle.counterparty.nameShort,
      vehicle.counterparty.nameFull,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [search, vehicles]);

  const existingIssuePhotos = storedPhotos.filter((photo) => photo.phase === 'issue');
  const receptionPhotoCount = storedPhotos.filter((photo) => photo.phase === 'reception').length;
  const servicesTotal = services.reduce((sum, service) => sum + service.totalAmount, 0);
  const issuePhotoCount = existingIssuePhotos.length + draftPhotos.length;

  const selectVehicle = async (vehicle: WarehouseVehicle) => {
    setSelectedVehicle(vehicle);
    setError(null);
    setLoading(true);
    try {
      await loadVehicleDetails(vehicle);
      setActiveStep(1);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!queueKey) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (issuePhotoCount + files.length > 60) {
      setError('Для одного ТС разрешено не более 60 фотографий.');
      return;
    }
    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: files.length, label: 'Подготовка фотографий' });
    try {
      let done = 0;
      for (const file of files) {
        const prepared = await prepareWarehousePhoto(file);
        await enqueueWarehousePhoto({ vehicleId: queueKey, name: prepared.name, blob: prepared.blob });
        done += 1;
        setProgress({ done, total: files.length, label: 'Подготовка фотографий' });
      }
      await loadDraftPhotos();
    } catch (photoError) {
      setError(messageFromError(photoError));
    } finally {
      setProcessing(false);
    }
  };

  const removeDraftPhoto = async (photo: DraftPhoto) => {
    if (!photo.id) return;
    await removeWarehousePhotoQueueItem(photo.id);
    await loadDraftPhotos();
  };

  const goNext = () => {
    if (activeStep === 0 && !selectedVehicle) {
      setError('Выберите ТС.');
      return;
    }
    if (activeStep === 2 && issuePhotoCount === 0) {
      setError('Добавьте хотя бы одну фотографию состояния ТС при выдаче.');
      return;
    }
    setError(null);
    setActiveStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const submit = async () => {
    if (!selectedVehicle || !queueKey || issuePhotoCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const issuePhotoIds = existingIssuePhotos.map((photo) => photo.id);
      const queue = await listWarehousePhotoQueue(queueKey);
      setProgress({ done: 0, total: queue.length, label: 'Загрузка фотографий выдачи' });
      let done = 0;
      for (const item of queue) {
        if (!item.id) continue;
        const response = await uploadWarehouseVehiclePhoto(
          selectedVehicle.id,
          item.blob,
          item.name,
          'issue',
        );
        issuePhotoIds.push(response.data.id);
        await removeWarehousePhotoQueueItem(item.id);
        done += 1;
        setProgress({ done, total: queue.length, label: 'Загрузка фотографий выдачи' });
      }
      setProgress({ done: 0, total: 1, label: 'Подтверждение выдачи' });
      const response = await issueWarehouseVehicle(selectedVehicle.id, issuePhotoIds);
      await clearWarehousePhotoQueue(queueKey);
      setCompletedVehicle(response.data);
    } catch (submitError) {
      setError(messageFromError(submitError));
      if (selectedVehicle) await loadVehicleDetails(selectedVehicle).catch(() => undefined);
      await loadDraftPhotos();
    } finally {
      setSaving(false);
    }
  };

  if (loading && vehicles.length === 0) {
    return <Box sx={{ py: 12, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  if (completedVehicle) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 760, mx: 'auto' }}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2.5} alignItems="center" textAlign="center">
              <CheckCircle color="success" sx={{ fontSize: 72 }} />
              <Typography variant="h4">ТС выдано</Typography>
              <Typography variant="h5">{completedVehicle.warehouseNumber}</Typography>
              <Typography>{completedVehicle.brand} {completedVehicle.model}</Typography>
              <Alert severity="success">
                Выдача зафиксирована автоматически: {formatDateTime(completedVehicle.issuedAt!)}.
              </Alert>
              <Alert severity="info">
                Фотографии удалены после выдачи согласно регламенту. Сведения о фото выдачи сохранены в аудите.
              </Alert>
              <Button variant="contained" onClick={() => navigate('/warehouse/operations', { replace: true })}>
                Вернуться на рабочую станцию
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100%', bgcolor: 'grey.50', p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5} sx={{ maxWidth: 980, mx: 'auto' }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h4" component="h1">Выдача транспортного средства</Typography>
              <Typography color="text.secondary">
                Проверка ТС, обязательная фотофиксация и автоматическое время выдачи
              </Typography>
            </Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate('/warehouse/operations')}>
              Выйти
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <Paper variant="outlined" sx={{ px: { xs: 1, md: 2 }, py: 2, overflowX: 'auto' }}>
          <Stepper activeStep={activeStep} alternativeLabel nonLinear>
            {STEPS.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepButton
                  onClick={() => {
                    if (index === 0 || selectedVehicle) setActiveStep(index);
                  }}
                >
                  <StepLabel>{label}</StepLabel>
                </StepButton>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          {activeStep === 0 && (
            <Stack spacing={2}>
              <Typography variant="h5">Найдите ТС на стоянке</Typography>
              <TextField
                autoFocus
                placeholder="Складской номер, VIN, госномер, марка или контрагент"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Search /></InputAdornment>,
                }}
              />
              {filteredVehicles.length === 0 ? (
                <Alert severity="info">На стоянке нет подходящих ТС.</Alert>
              ) : (
                <Stack spacing={1}>
                  {filteredVehicles.map((vehicle) => (
                    <Card key={vehicle.id} variant="outlined">
                      <CardActionArea onClick={() => void selectVehicle(vehicle)}>
                        <CardContent>
                          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                            <Box>
                              <Typography variant="h6">{vehicle.warehouseNumber}</Typography>
                              <Typography>{vehicle.brand} {vehicle.model}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {vehicle.vin || 'VIN не указан'} · {vehicle.registrationNumber || 'без госномера'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {vehicle.counterparty.nameShort || vehicle.counterparty.nameFull}
                              </Typography>
                            </Box>
                            <Chip label={`${vehicle.storageDays} сут.`} color="success" />
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          )}

          {activeStep === 1 && selectedVehicle && (
            <Stack spacing={2}>
              <Typography variant="h5">Проверка карточки</Typography>
              {[
                ['Складской номер', selectedVehicle.warehouseNumber],
                ['Контрагент', selectedVehicle.counterparty.nameShort || selectedVehicle.counterparty.nameFull],
                ['ТС', `${selectedVehicle.brand} ${selectedVehicle.model}`],
                ['VIN / госномер', selectedVehicle.vin || selectedVehicle.registrationNumber || '—'],
                ['Принято', formatDateTime(selectedVehicle.receivedAt)],
                ['На хранении', `${selectedVehicle.storageDays} сут.`],
                ['Фото приёмки', String(receptionPhotoCount)],
                ['Выполнено услуг', String(services.length)],
                ['Сумма услуг', money.format(servicesTotal)],
              ].map(([label, value]) => (
                <Stack key={label} direction="row" justifyContent="space-between" gap={2} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                  <Typography color="text.secondary">{label}</Typography>
                  <Typography fontWeight={600} textAlign="right">{value}</Typography>
                </Stack>
              ))}
              {services.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography fontWeight={600} mb={1}>Дополнительные услуги</Typography>
                  {services.map((service) => (
                    <Typography key={service.id} variant="body2">
                      {service.serviceName}: {service.quantity} × {money.format(service.unitPrice)}
                      {' = '}{money.format(service.totalAmount)}
                    </Typography>
                  ))}
                </Paper>
              )}
            </Stack>
          )}

          {activeStep === 2 && selectedVehicle && (
            <Stack spacing={2}>
              <Typography variant="h5">Фотофиксация при выдаче</Typography>
              <Alert severity={issuePhotoCount > 0 ? 'success' : 'warning'}>
                Добавлено фотографий выдачи: {issuePhotoCount}. Сделайте снимки общего состояния и выявленных повреждений.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button component="label" variant="contained" startIcon={<CameraAlt />} disabled={processing}>
                  Сделать фото
                  <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => void handleFiles(event)} />
                </Button>
                <Button component="label" variant="outlined" startIcon={<AddPhotoAlternate />} disabled={processing}>
                  Выбрать из галереи
                  <input hidden type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event)} />
                </Button>
              </Stack>
              {processing && (
                <Box>
                  <Typography variant="body2">{progress.label}: {progress.done}/{progress.total}</Typography>
                  <LinearProgress
                    variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
                    value={progress.total > 0 ? progress.done / progress.total * 100 : 0}
                  />
                </Box>
              )}
              {existingIssuePhotos.length > 0 && (
                <Alert severity="info">
                  На сервере уже сохранено фото выдачи: {existingIssuePhotos.length}. Оно будет учтено при подтверждении.
                </Alert>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                {draftPhotos.map((photo, index) => (
                  <Box key={photo.id} sx={{ position: 'relative', aspectRatio: '4 / 3' }}>
                    <Box
                      component="img"
                      src={photo.previewUrl}
                      alt={`Фото выдачи ${index + 1}`}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }}
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => void removeDraftPhoto(photo)}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </Stack>
          )}

          {activeStep === 3 && selectedVehicle && (
            <Stack spacing={2}>
              <Typography variant="h5">Подтверждение выдачи</Typography>
              <Alert severity="warning">
                После подтверждения сервер автоматически зафиксирует дату и время выдачи.
                Кладовщик не сможет изменить их. Все фотографии ТС будут удалены согласно регламенту.
              </Alert>
              {[
                ['ТС', selectedVehicle.warehouseNumber],
                ['Наименование', `${selectedVehicle.brand} ${selectedVehicle.model}`],
                ['Контрагент', selectedVehicle.counterparty.nameShort || selectedVehicle.counterparty.nameFull],
                ['Фото выдачи', String(issuePhotoCount)],
                ['Время выдачи', 'Автоматически при подтверждении'],
              ].map(([label, value]) => (
                <Stack key={label} direction="row" justifyContent="space-between" gap={2} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                  <Typography color="text.secondary">{label}</Typography>
                  <Typography fontWeight={600} textAlign="right">{value}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

        {saving && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2">{progress.label}: {progress.done}/{progress.total}</Typography>
            <LinearProgress
              variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
              value={progress.total > 0 ? progress.done / progress.total * 100 : 0}
            />
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 1.5, position: 'sticky', bottom: 0, zIndex: 2 }}>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Button
              startIcon={<ArrowBack />}
              disabled={activeStep === 0 || saving}
              onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
            >
              Назад
            </Button>
            {activeStep < STEPS.length - 1 ? (
              <Button variant="contained" endIcon={<ArrowForward />} onClick={goNext} disabled={saving}>
                Далее
              </Button>
            ) : (
              <Button
                variant="contained"
                color="warning"
                startIcon={<Logout />}
                onClick={() => void submit()}
                disabled={saving || issuePhotoCount === 0}
              >
                Подтвердить выдачу
              </Button>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
