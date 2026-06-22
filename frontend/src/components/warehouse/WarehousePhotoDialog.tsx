import {
  AddPhotoAlternate,
  CameraAlt,
  Close,
  Delete,
  Refresh,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteWarehouseVehiclePhoto,
  downloadWarehouseVehiclePhoto,
  getWarehouseVehiclePhotos,
  uploadWarehouseVehiclePhoto,
  WarehousePhoto,
  WarehouseVehicle,
} from '../../services/warehouse.api';
import {
  enqueueWarehousePhoto,
  listWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
} from '../../utils/warehouse-photo-queue';

interface WarehousePhotoDialogProps {
  open: boolean;
  vehicle: WarehouseVehicle | null;
  onClose: () => void;
}

interface PhotoPreview extends WarehousePhoto {
  url: string;
}

const MAX_IMAGE_SIDE = 1920;
const JPEG_QUALITY = 0.82;

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`Не удалось прочитать ${file.name}`));
  };
  image.src = url;
});

const compressPhoto = async (file: File): Promise<{ blob: Blob; name: string }> => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает обработку фотографий');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error(`Не удалось сжать ${file.name}`)),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'photo';
  return { blob, name: `${baseName}.jpg` };
};

const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

export default function WarehousePhotoDialog({
  open,
  vehicle,
  onClose,
}: WarehousePhotoDialogProps) {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);
  const processingRef = useRef(false);

  const clearObjectUrls = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!vehicle) return;
    setLoading(true);
    setError(null);
    try {
      const listResponse = await getWarehouseVehiclePhotos(vehicle.id);
      const nextPhotos = await Promise.all(listResponse.data.map(async (photo) => {
        const imageResponse = await downloadWarehouseVehiclePhoto(vehicle.id, photo.id);
        const url = URL.createObjectURL(imageResponse.data);
        return { ...photo, url };
      }));
      clearObjectUrls();
      objectUrls.current = nextPhotos.map((photo) => photo.url);
      setPhotos(nextPhotos);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить фотографии.');
    } finally {
      setLoading(false);
    }
  }, [clearObjectUrls, vehicle]);

  const processQueue = useCallback(async () => {
    if (!vehicle || processingRef.current || !navigator.onLine) return;
    processingRef.current = true;
    setUploading(true);
    try {
      const queue = await listWarehousePhotoQueue(vehicle.id);
      setProgress({ done: 0, total: queue.length });
      let done = 0;
      for (const item of queue) {
        if (!item.id) continue;
        await uploadWarehouseVehiclePhoto(vehicle.id, item.blob, item.name);
        await removeWarehousePhotoQueueItem(item.id);
        done += 1;
        setProgress({ done, total: queue.length });
      }
      if (queue.length > 0) await loadPhotos();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? `Загрузка приостановлена: ${uploadError.message}`
          : 'Загрузка фотографий приостановлена.',
      );
    } finally {
      processingRef.current = false;
      setUploading(false);
    }
  }, [loadPhotos, vehicle]);

  useEffect(() => {
    if (!open || !vehicle) return;
    void loadPhotos();
    void processQueue();
  }, [loadPhotos, open, processQueue, vehicle]);

  useEffect(() => {
    const handleOnline = () => void processQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processQueue]);

  useEffect(() => () => clearObjectUrls(), [clearObjectUrls]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!vehicle) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (photos.length + files.length > 60) {
      setError('Для одного ТС разрешено не более 60 фотографий.');
      return;
    }
    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: files.length });
    try {
      let done = 0;
      for (const file of files) {
        const prepared = await compressPhoto(file);
        await enqueueWarehousePhoto({
          vehicleId: vehicle.id,
          name: prepared.name,
          blob: prepared.blob,
        });
        done += 1;
        setProgress({ done, total: files.length });
      }
      await processQueue();
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : 'Не удалось обработать фотографии.',
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (photo: PhotoPreview) => {
    if (!vehicle) return;
    setError(null);
    try {
      await deleteWarehouseVehiclePhoto(vehicle.id, photo.id);
      URL.revokeObjectURL(photo.url);
      objectUrls.current = objectUrls.current.filter((url) => url !== photo.url);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить фотографию.');
    }
  };

  const canUpload = vehicle?.status === 'on_site';
  const busy = processing || uploading;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pr: 7 }}>
        Фотофиксация {vehicle?.warehouseNumber}
        <IconButton
          aria-label="Закрыть"
          onClick={onClose}
          disabled={busy}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {!canUpload && (
            <Alert severity="info">
              ТС выдано. Фотографии удалены согласно сроку хранения.
            </Alert>
          )}
          {canUpload && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button component="label" variant="contained" startIcon={<CameraAlt />} disabled={busy}>
                Сделать фото
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => void handleFiles(event)}
                />
              </Button>
              <Button component="label" variant="outlined" startIcon={<AddPhotoAlternate />} disabled={busy}>
                Выбрать из галереи
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void handleFiles(event)}
                />
              </Button>
              <Button
                variant="text"
                startIcon={<Refresh />}
                onClick={() => void processQueue()}
                disabled={busy}
              >
                Повторить очередь
              </Button>
            </Stack>
          )}

          {busy && (
            <Box>
              <Typography variant="body2" gutterBottom>
                {processing ? 'Подготовка фотографий' : 'Загрузка на сервер'}: {progress.done}/{progress.total}
              </Typography>
              <LinearProgress
                variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
                value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
              />
            </Box>
          )}

          <Typography variant="body2" color="text.secondary">
            Фотографий: {photos.length}. Перед загрузкой изображения уменьшаются до 1920 px и сохраняются в JPEG.
          </Typography>

          {loading ? (
            <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
          ) : photos.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
              Фотографий пока нет
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
                },
                gap: 1.5,
              }}
            >
              {photos.map((photo, index) => (
                <Box
                  key={photo.id}
                  sx={{
                    position: 'relative',
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.100',
                  }}
                >
                  <Box
                    component="img"
                    src={photo.url}
                    alt={`Фото ${index + 1}`}
                    loading="lazy"
                    sx={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }}
                  />
                  <Box sx={{ px: 1, py: 0.75 }}>
                    <Typography variant="caption" noWrap display="block">{photo.originalName}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatBytes(photo.sizeBytes)}</Typography>
                  </Box>
                  {canUpload && (
                    <Tooltip title="Удалить фотографию">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(photo)}
                        sx={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          bgcolor: 'rgba(255,255,255,0.9)',
                          '&:hover': { bgcolor: 'white' },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
