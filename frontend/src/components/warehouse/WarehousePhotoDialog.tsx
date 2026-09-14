import {
  AddPhotoAlternate,
  BrokenImage,
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
  Modal,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
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
  createWarehousePhotoClientHash,
  enqueueWarehousePhoto,
  listWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
  updateWarehousePhotoQueueItem,
} from '../../utils/warehouse-photo-queue';
import { prepareWarehousePhoto } from '../../utils/warehouse-photo-processing';
import { logUploadEvent } from '../../utils/warehouse-upload-log';
import UploadReportButton from './UploadReportButton';

interface WarehousePhotoDialogProps {
  open: boolean;
  vehicle: WarehouseVehicle | null;
  readOnly?: boolean;
  onClose: () => void;
  /** без окна-диалога: содержимое встраивается во вкладку «Фото» карточки ТС */
  embedded?: boolean;
  /** удаление зафиксированных фото — только администратор */
  canDelete?: boolean;
}

interface PhotoPreview extends WarehousePhoto {
  url: string;
  thumbFailed?: boolean;
  triedFull?: boolean;
}

// Миниатюры показываем через data:-URL, а не blob: — по полевому отчёту
// 10.09 iOS Safari отказывался декодировать валидные JPEG по blob-ссылкам
// (гонка отзыва URL при обновлении списка + капризы Safari в долгоживущих
// вкладках). data-URL ни от чего не зависит и живёт вместе с состоянием.
const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(blob);
});

/** Лимит фото на одно ТС (как MAX_WAREHOUSE_PHOTOS_PER_VEHICLE на сервере). */
const MAX_PHOTOS_PER_VEHICLE = 100;

const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

export default function WarehousePhotoDialog({
  open,
  vehicle,
  readOnly = false,
  onClose,
  embedded = false,
  canDelete = false,
}: WarehousePhotoDialogProps) {
  const fullScreenDialog = useMediaQuery('(max-width:600px)');
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoPreview | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'reception' | 'issue'>('all');
  const [fullPhotoUrl, setFullPhotoUrl] = useState<string | null>(null);
  const processingRef = useRef(false);
  const photosRef = useRef<PhotoPreview[]>([]);
  photosRef.current = photos;
  // Реестр склада перечитывает список ТС каждые 5 с — объект vehicle приходит
  // новый, хотя ТС то же. Все загрузки завязаны на id, иначе вкладка «Фото»
  // перекачивала все миниатюры по кругу (баг 14.09).
  const vehicleId = vehicle?.id ?? null;

  // Полноразмерное фото качаем только при открытии просмотра (в сетке — миниатюры).
  useEffect(() => {
    if (!selectedPhoto || !vehicle) {
      setFullPhotoUrl(null);
      return undefined;
    }
    let cancelled = false;
    downloadWarehouseVehiclePhoto(vehicle.id, selectedPhoto.id)
      .then((response) => blobToDataUrl(response.data))
      .then((url) => {
        if (!cancelled) setFullPhotoUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      setFullPhotoUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhoto, vehicleId]);

  const loadGenerationRef = useRef(0);

  // Список показываем сразу по метаданным, а картинки подтягиваем лениво
  // маленькими миниатюрами по 2 параллельно: раньше при открытии качались
  // ВСЕ фото в полном размере разом — на плохой связи это не заканчивалось
  // никогда, а на телефоне ещё и убивало вкладку по памяти.
  const loadPhotos = useCallback(async () => {
    if (!vehicleId) return;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setLoading(true);
    setError(null);
    try {
      const listResponse = await getWarehouseVehiclePhotos(vehicleId);
      if (loadGenerationRef.current !== generation) return;
      // уже показанные миниатюры не сбрасываем — после загрузки новых фото
      // сетка не мигает, докачиваются только новые
      const known = new Map(photosRef.current.filter((item) => item.url).map((item) => [item.id, item.url]));
      setPhotos(listResponse.data.map((photo) => ({ ...photo, url: known.get(photo.id) ?? '' })));
      setLoading(false);

      const queue = listResponse.data.filter((photo) => !known.has(photo.id));
      const worker = async () => {
        while (queue.length > 0) {
          if (loadGenerationRef.current !== generation) return;
          const photo = queue.shift();
          if (!photo) return;
          try {
            const imageResponse = await downloadWarehouseVehiclePhoto(vehicleId, photo.id, 'thumb');
            if (loadGenerationRef.current !== generation) return;
            const blob = imageResponse.data;
            // первые байты — в журнал: по ним видно, JPEG это или чужое тело
            const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
            const magic = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
            logUploadEvent('dialog:thumb:ok', { photoId: photo.id, size: blob.size, type: blob.type, magic });
            const url = await blobToDataUrl(blob);
            if (loadGenerationRef.current !== generation) return;
            setPhotos((current) => current.map((item) => (
              item.id === photo.id ? { ...item, url } : item
            )));
          } catch (thumbError) {
            // Миниатюра не доехала (сеть или файл утерян на сервере) —
            // карточка честно помечается, а не крутит спиннер вечно.
            logUploadEvent('dialog:thumb:failed', {
              photoId: photo.id,
              status: (thumbError as { response?: { status?: number } })?.response?.status,
            });
            setPhotos((current) => current.map((item) => (
              item.id === photo.id ? { ...item, thumbFailed: true } : item
            )));
          }
        }
      };
      await Promise.all([worker(), worker()]);
    } catch (loadError) {
      if (loadGenerationRef.current !== generation) return;
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить фотографии.');
      setLoading(false);
    }
  }, [vehicleId]);

  const processQueue = useCallback(async () => {
    if (!vehicleId || processingRef.current || !navigator.onLine) return;
    processingRef.current = true;
    setUploading(true);
    try {
      const queue = await listWarehousePhotoQueue(vehicleId);
      setProgress({ done: 0, total: queue.length });
      let done = 0;
      let failed = 0;
      let lastFailure: unknown = null;
      for (const item of queue) {
        if (!item.id) continue;
        // Хеш фиксируем до отправки: повтор после обрыва не создаст дубль.
        let clientHash = item.clientHash;
        if (!clientHash) {
          clientHash = createWarehousePhotoClientHash();
          await updateWarehousePhotoQueueItem(item.id, { clientHash });
        }
        let uploaded = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await uploadWarehouseVehiclePhoto(vehicleId, item.blob, item.name, 'reception', item.checklistItem, clientHash);
            uploaded = true;
            break;
          } catch (uploadError) {
            lastFailure = uploadError;
            const status = (uploadError as { response?: { status?: number } })?.response?.status;
            logUploadEvent('dialog:upload:retry', { name: item.name, attempt: attempt + 1, status });
            if (status === 409) break; // лимит фотографий — повтор не поможет
            await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
          }
        }
        if (uploaded) {
          logUploadEvent('dialog:upload:done', { name: item.name });
          await removeWarehousePhotoQueueItem(item.id);
          done += 1;
        } else {
          logUploadEvent('dialog:upload:failed', { name: item.name });
          failed += 1;
        }
        setProgress({ done, total: queue.length });
      }
      if (failed > 0) {
        const reason = lastFailure instanceof Error ? lastFailure.message : 'сеть недоступна';
        setError(`Загружено ${done} из ${queue.length}, не удалось ${failed} (${reason}). Нажмите «Повторить очередь» — загрузка продолжится.`);
      }
      if (done > 0) await loadPhotos();
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
  }, [loadPhotos, vehicleId]);

  useEffect(() => {
    if (!open || !vehicleId) return;
    void loadPhotos();
    void processQueue();
  }, [loadPhotos, open, processQueue, vehicleId]);

  useEffect(() => {
    const handleOnline = () => void processQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processQueue]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!vehicle) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS_PER_VEHICLE) {
      setError(`Для одного ТС разрешено не более ${MAX_PHOTOS_PER_VEHICLE} фотографий.`);
      return;
    }
    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: files.length });
    try {
      let done = 0;
      for (const file of files) {
        const prepared = await prepareWarehousePhoto(file);
        await enqueueWarehousePhoto({
          vehicleId: vehicle.id,
          name: prepared.name,
          blob: prepared.blob,
          clientHash: createWarehousePhotoClientHash(),
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
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить фотографию.');
    }
  };

  const canUpload = vehicle?.status === 'on_site' && !readOnly;
  const busy = processing || uploading;
  const receptionCount = photos.filter((photo) => photo.phase !== 'issue').length;
  const issueCount = photos.filter((photo) => photo.phase === 'issue').length;
  const visiblePhotos = phaseFilter === 'all'
    ? photos
    : photos.filter((photo) => (phaseFilter === 'issue' ? photo.phase === 'issue' : photo.phase !== 'issue'));

  const content = (
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} action={<UploadReportButton />}>
              {error}
            </Alert>
          )}
          {vehicle?.status === 'issued' && !loading && photos.length === 0 && (
            <Alert severity="info">
              ТС выдано. Фотографии удалены по истечении срока хранения (3 месяца после выдачи).
            </Alert>
          )}
          {vehicle?.status === 'issued' && photos.length > 0 && (
            <Alert severity="info">
              ТС выдано. Фотографии хранятся 3 месяца после выдачи, затем удаляются автоматически.
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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              Фотографий: {photos.length} из {MAX_PHOTOS_PER_VEHICLE}. Фото сжимаются автоматически.
            </Typography>
            {issueCount > 0 && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={phaseFilter}
                onChange={(_event, value) => value && setPhaseFilter(value)}
              >
                <ToggleButton value="all">Все · {photos.length}</ToggleButton>
                <ToggleButton value="reception">Приёмка · {receptionCount}</ToggleButton>
                <ToggleButton value="issue">Выдача · {issueCount}</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>

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
              {visiblePhotos.map((photo, index) => (
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
                  {photo.url ? (
                    <Box
                      component="img"
                      src={photo.url}
                      alt={`Фото ${index + 1}`}
                      // без loading="lazy": iOS Safari не грузит lazy-картинки
                      // в скролл-области диалога, миниатюры оставались пустыми;
                      // ленивость и так обеспечивает наш загрузчик (по 2)
                      onError={() => {
                        logUploadEvent('dialog:thumb:img-decode-error', { photoId: photo.id, triedFull: Boolean(photo.triedFull) });
                        if (photo.triedFull || !vehicle) {
                          setPhotos((current) => current.map((item) => (
                            item.id === photo.id ? { ...item, url: '', thumbFailed: true } : item
                          )));
                          return;
                        }
                        // миниатюра не декодится — фолбэк на полный размер:
                        // медленнее, но кладовщик видит фото
                        void downloadWarehouseVehiclePhoto(vehicle.id, photo.id)
                          .then((response) => blobToDataUrl(response.data))
                          .then((url) => {
                            setPhotos((current) => current.map((item) => (
                              item.id === photo.id ? { ...item, url, triedFull: true } : item
                            )));
                          })
                          .catch(() => {
                            setPhotos((current) => current.map((item) => (
                              item.id === photo.id ? { ...item, url: '', thumbFailed: true } : item
                            )));
                          });
                      }}
                      onClick={() => setSelectedPhoto(photo)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        cursor: 'zoom-in',
                      }}
                    />
                  ) : (
                    <Box
                      onClick={() => setSelectedPhoto(photo)}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '4 / 3',
                        color: 'text.disabled',
                        cursor: 'zoom-in',
                        px: 1,
                        textAlign: 'center',
                      }}
                    >
                      {photo.thumbFailed ? (
                        <>
                          <BrokenImage fontSize="medium" />
                          <Typography variant="caption">Файл не загрузился</Typography>
                        </>
                      ) : (
                        <CircularProgress size={22} />
                      )}
                    </Box>
                  )}
                  <Box sx={{ px: 1, py: 0.75 }}>
                    <Typography variant="caption" noWrap display="block">{photo.originalName}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatBytes(photo.sizeBytes)}</Typography>
                  </Box>
                  {canDelete && (
                    <Tooltip title="Удалить фотографию (только администратор)">
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
  );

  const viewer = (
      <Modal open={Boolean(selectedPhoto)} onClose={() => setSelectedPhoto(null)}>
        <Box
          onClick={() => setSelectedPhoto(null)}
          sx={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0, 0, 0, 0.9)',
            p: { xs: 1, md: 3 },
            cursor: 'zoom-out',
          }}
        >
          {selectedPhoto && (
            <>
              {(fullPhotoUrl || selectedPhoto.url) ? (
                <Box
                  component="img"
                  src={fullPhotoUrl || selectedPhoto.url}
                  alt={selectedPhoto.originalName}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : null}
              {!fullPhotoUrl && (
                <CircularProgress
                  size={32}
                  sx={{ position: 'absolute', top: 16, right: 16, color: 'common.white' }}
                />
              )}
            </>
          )}
        </Box>
      </Modal>
  );

  if (embedded) {
    return (
      <>
        {content}
        {viewer}
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      // на телефоне — во весь экран: обрезанный модал со своим внутренним
      // скроллом был неудобен (замечание тестирования 09.09)
      fullScreen={fullScreenDialog}
    >
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
        {content}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Закрыть</Button>
      </DialogActions>
      {viewer}
    </Dialog>
  );
}
