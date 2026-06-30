import {
  ArrowBack,
  Logout,
  MiscellaneousServices,
  PhotoCamera,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WarehousePhotoDialog from '../components/warehouse/WarehousePhotoDialog';
import WarehouseServicesDialog from '../components/warehouse/WarehouseServicesDialog';
import {
  getWarehouseVehicles,
  uploadWarehouseVehiclePhoto,
  WarehouseVehicle,
} from '../services/warehouse.api';
import { warehouseVehicleTypeLabel } from '../constants/warehouse';
import {
  listAllWarehousePhotoQueue,
  listWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
} from '../utils/warehouse-photo-queue';

const formatOperationDateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось загрузить технику на стоянке.';
};

export default function WarehouseOnSitePage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [photoVehicle, setPhotoVehicle] = useState<WarehouseVehicle | null>(null);
  const [servicesVehicle, setServicesVehicle] = useState<WarehouseVehicle | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, number>>({});
  const [uploadingVehicleId, setUploadingVehicleId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const loadVehicles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await getWarehouseVehicles({ status: 'on_site' });
      setVehicles(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
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
  }, [loadVehicles]);

  const loadPendingUploads = useCallback(async (items: WarehouseVehicle[] = vehicles) => {
    const queued = await listAllWarehousePhotoQueue().catch(() => []);
    const vehicleIds = new Set(items.map((vehicle) => vehicle.id));
    const next: Record<string, number> = {};
    for (const item of queued) {
      if (!vehicleIds.has(item.vehicleId)) continue;
      next[item.vehicleId] = (next[item.vehicleId] ?? 0) + 1;
    }
    setPendingUploads(next);
  }, [vehicles]);

  useEffect(() => {
    if (vehicles.length === 0) return;
    void loadPendingUploads(vehicles);
  }, [loadPendingUploads, vehicles]);

  const uploadPendingPhotos = async (vehicle: WarehouseVehicle) => {
    setUploadingVehicleId(vehicle.id);
    setError(null);
    try {
      const queue = await listWarehousePhotoQueue(vehicle.id);
      let done = 0;
      setUploadProgress({ done, total: queue.length });
      for (const item of queue) {
        if (!item.id) continue;
        await uploadWarehouseVehiclePhoto(vehicle.id, item.blob, item.name, 'reception', item.checklistItem);
        await removeWarehousePhotoQueueItem(item.id);
        done += 1;
        setUploadProgress({ done, total: queue.length });
      }
      await loadPendingUploads();
      await loadVehicles();
    } catch (uploadError) {
      setError(messageFromError(uploadError));
      await loadPendingUploads();
    } finally {
      setUploadingVehicleId(null);
    }
  };

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

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 980, mx: 'auto' }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box>
            <Typography variant="h4" component="h1">Техника на стоянке</Typography>
            <Typography color="text.secondary">Поиск, услуги, фото и выдача ТС</Typography>
          </Box>
          <Button startIcon={<ArrowBack />} onClick={() => navigate('/warehouse/operations')}>
            Назад
          </Button>
        </Stack>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <TextField
          autoFocus
          placeholder="Складской номер, VIN, госномер"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredVehicles.length === 1) {
              setServicesVehicle(filteredVehicles[0]);
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><Search /></InputAdornment>
            ),
          }}
          helperText={
            search.trim() && filteredVehicles.length === 1
              ? 'Нажмите Enter, чтобы открыть услуги найденного ТС'
              : 'Поиск по складскому номеру, VIN, госномеру, марке или контрагенту'
          }
        />

        <Button
          variant="contained"
          startIcon={<MiscellaneousServices />}
          disabled={filteredVehicles.length !== 1}
          onClick={() => setServicesVehicle(filteredVehicles[0])}
        >
          Открыть услуги
        </Button>

        {loading ? (
          <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
        ) : filteredVehicles.length === 0 ? (
          <Alert severity="info">На стоянке нет подходящих ТС.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {filteredVehicles.map((vehicle) => (
              <Card key={vehicle.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="h6">{vehicle.warehouseNumber}</Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={warehouseVehicleTypeLabel(vehicle.vehicleType)}
                        />
                        <Chip size="small" color="success" label={`${vehicle.storageDays} сут.`} />
                      </Stack>
                      <Typography>{vehicle.brand} {vehicle.model}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {vehicle.vin || 'VIN не указан'} · {vehicle.registrationNumber || 'без госномера'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {vehicle.counterparty.nameShort || vehicle.counterparty.nameFull}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Принято: {formatOperationDateTime(vehicle.receivedAt)}
                      </Typography>
                    </Box>
                    {pendingUploads[vehicle.id] > 0 && (
                      <Alert severity="warning">
                        Осталось загрузить фото: {pendingUploads[vehicle.id]}.
                        {uploadingVehicleId === vehicle.id && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="body2">
                              Загружено {uploadProgress.done} из {uploadProgress.total}
                            </Typography>
                            <LinearProgress
                              variant={uploadProgress.total > 0 ? 'determinate' : 'indeterminate'}
                              value={uploadProgress.total > 0 ? uploadProgress.done / uploadProgress.total * 100 : 0}
                            />
                          </Box>
                        )}
                      </Alert>
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      {pendingUploads[vehicle.id] > 0 && (
                        <Button
                          variant="contained"
                          color="warning"
                          disabled={Boolean(uploadingVehicleId)}
                          onClick={() => void uploadPendingPhotos(vehicle)}
                        >
                          Догрузить фото
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        startIcon={<MiscellaneousServices />}
                        onClick={() => setServicesVehicle(vehicle)}
                      >
                        Услуги
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<PhotoCamera />}
                        onClick={() => setPhotoVehicle(vehicle)}
                      >
                        Фото
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={<Logout />}
                        onClick={() => navigate(`/warehouse/issue?vehicleId=${vehicle.id}`)}
                      >
                        Выдать
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>

      <WarehousePhotoDialog
        open={Boolean(photoVehicle)}
        vehicle={photoVehicle}
        onClose={() => setPhotoVehicle(null)}
      />
      <WarehouseServicesDialog
        open={Boolean(servicesVehicle)}
        vehicle={servicesVehicle}
        onClose={() => setServicesVehicle(null)}
      />
    </Box>
  );
}
