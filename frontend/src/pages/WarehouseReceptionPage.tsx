import {
  ArrowBack,
  ArrowForward,
  CheckCircle,
  Delete,
  DirectionsCar,
  ExpandMore,
  Refresh,
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
  Dialog,
  DialogContent,
  DialogTitle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachWarehousePendingPhotos,
  createWarehouseVehicle,
  downloadWarehouseVehicleInspectionAct,
  getWarehouseClients,
  getWarehousePendingPhotos,
  saveWarehouseVehicleInspection,
  WarehouseCounterparty,
  WarehouseVehicleInspectionPayload,
  WarehouseVehicle,
  WarehouseVehiclePayload,
  WarehouseVehicleType,
} from '../services/warehouse.api';
import WarehouseInspectionForm, {
  emptyWarehouseInspection,
} from '../components/warehouse/WarehouseInspectionForm';
import WarehouseDamageScheme from '../components/warehouse/WarehouseDamageScheme';
import WarehousePhotoChecklist, {
  buildPhotoChecklistState,
} from '../components/warehouse/WarehousePhotoChecklist';
import {
  WAREHOUSE_VEHICLE_TYPES,
  WarehousePhotoChecklistItem,
  warehouseVehicleTypeLabel,
} from '../constants/warehouse';
import {
  clearWarehousePhotoQueue,
  enqueueWarehousePhoto,
  listWarehousePhotoQueue,
  recoverWarehousePhotoQueue,
  removeWarehousePhotoQueueItem,
  updateWarehousePhotoQueueItem,
  WarehousePhotoQueueItem,
} from '../utils/warehouse-photo-queue';
import { prepareWarehousePhoto } from '../utils/warehouse-photo-processing';
import { uploadWarehousePhotoViaTus } from '../utils/warehouse-tus-upload';

const DRAFT_KEY = 'warehouse-reception-draft-v1';
const DRAFT_PHOTO_KEY = 'draft:warehouse-reception';
const STEPS = ['Основа', 'ТС', 'Осмотр', 'Повреждения', 'Фото', 'Проверка'];
const MAX_PARALLEL_PENDING_UPLOADS = 2;

const createUploadSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createClientHash = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}${Math.random().toString(16).slice(2)}`.replace(/[^a-zA-Z0-9]/g, '');
};

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

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

interface DraftState {
  form: WarehouseVehiclePayload;
  inspection: WarehouseVehicleInspectionPayload;
  uploadSessionId: string;
  activeStep: number;
  savedAt: string;
}

interface DraftPhoto extends WarehousePhotoQueueItem {
  previewUrl: string;
}

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Не удалось подготовить превью фотографии'));
  reader.readAsDataURL(blob);
});

const dataUrlToBlob = (dataUrl?: string | null): Blob | null => {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const [header, payload] = dataUrl.split(',');
  if (!header || !payload) return null;
  const mimeMatch = header.match(/^data:([^;]+);base64$/);
  if (!mimeMatch) return null;
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeMatch[1] });
  } catch {
    return null;
  }
};

const mergeDraftPhotosWithPreviews = (
  current: DraftPhoto[],
  queued: WarehousePhotoQueueItem[],
  blobById?: Map<number, Blob>,
): DraftPhoto[] => {
  const previewById = new Map<number, string>();
  const blobByCurrentId = new Map<number, Blob>();
  current.forEach((photo) => {
    if (photo.id) previewById.set(photo.id, photo.previewUrl);
    if (photo.id) blobByCurrentId.set(photo.id, photo.blob);
  });

  const next = queued.map((photo) => {
    const liveBlob = photo.id
      ? blobById?.get(photo.id)
        || blobByCurrentId.get(photo.id)
        || dataUrlToBlob(photo.previewDataUrl)
        || photo.blob
      : photo.blob;
    if (photo.id && liveBlob) {
      blobById?.set(photo.id, liveBlob);
    }

    return {
      ...photo,
      blob: liveBlob,
      previewUrl: photo.previewDataUrl || (
        photo.id && previewById.has(photo.id)
          ? previewById.get(photo.id)!
          : URL.createObjectURL(liveBlob)
      ),
    };
  });

  const nextIds = new Set(next.map((photo) => photo.id).filter((id): id is number => Boolean(id)));
  current.forEach((photo) => {
    if (!photo.id || nextIds.has(photo.id)) return;
    if (!photo.previewDataUrl) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  });

  return next;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isRetriablePhotoUploadError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    const status = response?.status;
    return !status || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: string }).code || '').toUpperCase() === 'ECONNABORTED';
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('network error')
      || message.includes('internet')
      || message.includes('disconnected')
      || message.includes('failed to fetch')
      || message.includes('fetch')
      || message.includes('timeout')
      || message.includes('время ожидания')
      || message.includes('слишком много времени');
  }
  return false;
};

export default function WarehouseReceptionPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<WarehouseVehiclePayload>(emptyForm);
  const [inspection, setInspection] = useState<WarehouseVehicleInspectionPayload>(emptyWarehouseInspection);
  const [uploadSessionId, setUploadSessionId] = useState(createUploadSessionId);
  const [counterparties, setCounterparties] = useState<WarehouseCounterparty[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [completedVehicle, setCompletedVehicle] = useState<WarehouseVehicle | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [inspectionWarning, setInspectionWarning] = useState<string | null>(null);
  const [photoUploadStatus, setPhotoUploadStatus] = useState({ uploaded: 0, total: 0, pending: 0 });
  const [photoLimitWarning, setPhotoLimitWarning] = useState<string | null>(null);
  const [acceptanceModalOpen, setAcceptanceModalOpen] = useState(false);
  const [pendingSubmitAfterUpload, setPendingSubmitAfterUpload] = useState(false);
  const [counterpartyPickerOpen, setCounterpartyPickerOpen] = useState(false);
  const [basisOpen, setBasisOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const activeUploadsRef = useRef<Set<number>>(new Set());
  const activeUploadStartedAtRef = useRef<Map<number, number>>(new Map());
  const livePhotoBlobsRef = useRef<Map<number, Blob>>(new Map());

  useEffect(() => {
    if (!error) return;
    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [error]);

  const loadDraftPhotos = useCallback(async () => {
    const queued = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    setPhotos((current) => mergeDraftPhotosWithPreviews(current, queued, livePhotoBlobsRef.current));
  }, []);

  const syncPendingPhotosFromServer = useCallback(async (sessionId = uploadSessionId) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const queued = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    const effectiveSessionId = queued.find((photo) => photo.uploadSessionId)?.uploadSessionId || sessionId;
    const response = await getWarehousePendingPhotos(effectiveSessionId, 'reception');
    const uploadedHashes = new Set(response.data.map((photo) => photo.clientHash).filter(Boolean));
    await Promise.all(queued.map((photo) => {
      if (!photo.id || !photo.clientHash) return Promise.resolve();
      if (!uploadedHashes.has(photo.clientHash)) {
        if (!photo.shouldResumeUpload) return Promise.resolve();
        return updateWarehousePhotoQueueItem(photo.id, {
          shouldResumeUpload: false,
          errorMessage: null,
        });
      }
      if (photo.uploadStatus === 'uploaded' && photo.shouldResumeUpload === false) return Promise.resolve();
      return updateWarehousePhotoQueueItem(photo.id, {
        uploadStatus: 'uploaded',
        shouldResumeUpload: false,
        uploadedAt: photo.uploadedAt ?? Date.now(),
        errorMessage: null,
      });
    }));
  }, [uploadSessionId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const clientsResponse = await getWarehouseClients(false);
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
          if (draft?.inspection) setInspection({ ...emptyWarehouseInspection(), ...draft.inspection });
          if (draft?.uploadSessionId) setUploadSessionId(draft.uploadSessionId);
          if (Number.isInteger(draft?.activeStep)) {
            setActiveStep(Math.max(0, Math.min(STEPS.length - 1, draft.activeStep)));
          }
        }
        await recoverWarehousePhotoQueue(DRAFT_PHOTO_KEY);
        const restoredSessionId = rawDraft
          ? (JSON.parse(rawDraft) as DraftState)?.uploadSessionId || uploadSessionId
          : uploadSessionId;
        await syncPendingPhotosFromServer(restoredSessionId).catch(() => undefined);
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
    const resyncDraftPhotos = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      void recoverWarehousePhotoQueue(DRAFT_PHOTO_KEY)
        .then(() => syncPendingPhotosFromServer())
        .then(() => loadDraftPhotos())
        .catch(() => undefined);
    };

    window.addEventListener('focus', resyncDraftPhotos);
    window.addEventListener('pageshow', resyncDraftPhotos);
    document.addEventListener('visibilitychange', resyncDraftPhotos);

    return () => {
      window.removeEventListener('focus', resyncDraftPhotos);
      window.removeEventListener('pageshow', resyncDraftPhotos);
      document.removeEventListener('visibilitychange', resyncDraftPhotos);
    };
  }, [loadDraftPhotos, syncPendingPhotosFromServer]);

  useEffect(() => {
    if (loading || completedVehicle) return;
    const timer = window.setTimeout(() => {
      const draft: DraftState = {
        form,
        inspection,
        uploadSessionId,
        activeStep,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeStep, completedVehicle, form, inspection, loading, uploadSessionId]);

  useEffect(() => () => {
    photos.forEach((photo) => {
      if (!photo.previewDataUrl) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    });
  }, [photos]);

  const selectedCounterparty = useMemo(
    () => counterparties.find((item) => item.id === form.counterpartyId) ?? null,
    [counterparties, form.counterpartyId],
  );
  const photoUploadSummary = useMemo(() => {
    const uploaded = photos.filter((photo) => photo.uploadStatus === 'uploaded').length;
    const uploading = photos.filter((photo) => photo.uploadStatus === 'uploading').length;
    const failed = photos.filter((photo) => photo.uploadStatus === 'error').length;
    const pending = Math.max(0, photos.length - uploaded - uploading - failed);
    return {
      total: photos.length,
      uploaded,
      uploading,
      failed,
      pending,
      ready: photos.length === 0 || (uploaded === photos.length && failed === 0),
    };
  }, [photos]);

  const damageMarksCount = useMemo(() => {
    const marks = inspection.technicalCondition?.damageMarks;
    return Array.isArray(marks) ? marks.length : 0;
  }, [inspection.technicalCondition]);
  const stepErrors = useMemo(() => [
    !form.counterpartyId,
    !form.brand.trim() || !form.model.trim(),
    form.fuelLevelPercent != null
      && (form.fuelLevelPercent < 0 || form.fuelLevelPercent > 100),
    false,
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
    if (step === 4 && photos.length === 0) return 'Добавьте хотя бы одну фотографию.';
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

  const uploadDraftPhotoToPending = useCallback(async (photo: DraftPhoto) => {
    if (!photo.id) return;
    if (photo.uploadStatus === 'uploaded') return;
    if (activeUploadsRef.current.has(photo.id)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const clientHash = photo.clientHash || createClientHash();
    activeUploadsRef.current.add(photo.id);
    activeUploadStartedAtRef.current.set(photo.id, Date.now());
    await updateWarehousePhotoQueueItem(photo.id, {
      uploadSessionId,
      clientHash,
      uploadStatus: 'uploading',
      errorMessage: null,
    });
    await loadDraftPhotos();
    try {
      let uploaded = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await uploadWarehousePhotoViaTus({
            uploadSessionId,
            clientHash,
            file: photo.blob,
            originalName: photo.name,
            phase: 'reception',
            checklistItem: photo.checklistItem,
            resumeFromPrevious: Boolean(photo.shouldResumeUpload),
          });
          uploaded = true;
          break;
        } catch (uploadError) {
          lastError = uploadError;
          if (!isRetriablePhotoUploadError(uploadError) || attempt === 2) break;
          await wait(700 * (attempt + 1));
        }
      }
      if (!uploaded) throw lastError;
      await updateWarehousePhotoQueueItem(photo.id, {
        uploadSessionId,
        clientHash,
        uploadStatus: 'uploaded',
        shouldResumeUpload: false,
        uploadedAt: Date.now(),
        errorMessage: null,
      });
    } catch (uploadError) {
      const retriable = isRetriablePhotoUploadError(uploadError);
      await updateWarehousePhotoQueueItem(photo.id, {
        uploadSessionId,
        clientHash,
        uploadStatus: retriable ? 'pending' : 'error',
        shouldResumeUpload: retriable,
        errorMessage: messageFromError(uploadError),
      });
    } finally {
      activeUploadsRef.current.delete(photo.id!);
      activeUploadStartedAtRef.current.delete(photo.id!);
      await loadDraftPhotos();
    }
  }, [loadDraftPhotos, uploadSessionId]);

  const pumpPhotoUploadQueue = useCallback(() => {
    if (completedVehicle || loading || processingPhotos) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    const uploadingPhotoIds = new Set(
      photos
        .filter((photo) => photo.id && photo.uploadStatus === 'uploading')
        .map((photo) => photo.id!),
    );
    activeUploadsRef.current.forEach((photoId) => {
      const startedAt = activeUploadStartedAtRef.current.get(photoId) ?? 0;
      const isStaleActiveSlot = startedAt > 0 && now - startedAt > 150_000;
      if (!uploadingPhotoIds.has(photoId) || isStaleActiveSlot) {
        activeUploadsRef.current.delete(photoId);
        activeUploadStartedAtRef.current.delete(photoId);
      }
    });
    const freeSlots = Math.max(0, MAX_PARALLEL_PENDING_UPLOADS - activeUploadsRef.current.size);
    if (freeSlots === 0) return;
    const nextBatch = photos.filter((photo) => (
      photo.id
      && (!photo.uploadStatus || photo.uploadStatus === 'pending')
      && !activeUploadsRef.current.has(photo.id)
    )).slice(0, freeSlots);
    nextBatch.forEach((photo) => {
      void uploadDraftPhotoToPending(photo);
    });
  }, [completedVehicle, loading, photos, processingPhotos, uploadDraftPhotoToPending]);

  useEffect(() => {
    pumpPhotoUploadQueue();
  }, [pumpPhotoUploadQueue]);

  useEffect(() => {
    if (completedVehicle || loading || processingPhotos || photoUploadSummary.ready) return;
    const timer = window.setInterval(() => {
      pumpPhotoUploadQueue();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [
    completedVehicle,
    loading,
    photoUploadSummary.ready,
    processingPhotos,
    pumpPhotoUploadQueue,
  ]);

  useEffect(() => {
    const resumeUploads = () => {
      pumpPhotoUploadQueue();
    };
    window.addEventListener('focus', resumeUploads);
    window.addEventListener('pageshow', resumeUploads);
    window.addEventListener('online', resumeUploads);
    document.addEventListener('visibilitychange', resumeUploads);
    return () => {
      window.removeEventListener('focus', resumeUploads);
      window.removeEventListener('pageshow', resumeUploads);
      window.removeEventListener('online', resumeUploads);
      document.removeEventListener('visibilitychange', resumeUploads);
    };
  }, [pumpPhotoUploadQueue]);

  const processPhotoFiles = async (
    files: File[],
    checklistItem?: WarehousePhotoChecklistItem | null,
  ) => {
    if (files.length === 0) return;
    const availableSlots = Math.max(0, 60 - photos.length);
    if (availableSlots === 0) {
      setPhotoLimitWarning('Достигнут лимит: для одного ТС можно добавить не более 60 фотографий.');
      return;
    }
    if (files.length > availableSlots) {
      setPhotoLimitWarning(
        `Выбрано ${files.length} фотографий. Сейчас можно добавить ещё не более ${availableSlots}.`,
      );
      return;
    }
    setProcessingPhotos(true);
    setError(null);
    setPhotoLimitWarning(null);
    setProgress({ done: 0, total: files.length, label: 'Подготовка фотографий' });
    try {
      let done = 0;
      for (const file of files) {
        const prepared = await prepareWarehousePhoto(file);
        const previewDataUrl = await blobToDataUrl(prepared.blob);
        const queueId = await enqueueWarehousePhoto({
          vehicleId: DRAFT_PHOTO_KEY,
          name: prepared.name,
          blob: prepared.blob,
          previewDataUrl,
          checklistItem,
          uploadSessionId,
          clientHash: createClientHash(),
          uploadStatus: 'pending',
          shouldResumeUpload: false,
        });
        livePhotoBlobsRef.current.set(queueId, prepared.blob);
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

  const handleChecklistFiles = async (
    files: File[],
    checklistItem: WarehousePhotoChecklistItem,
  ) => {
    await processPhotoFiles(files, checklistItem);
  };

  const retryFailedPhotos = useCallback(async () => {
    const failed = photos.filter((photo) => photo.id && photo.uploadStatus === 'error');
    await Promise.all(failed.map((photo) => photo.id
      ? updateWarehousePhotoQueueItem(photo.id, {
        uploadStatus: 'pending',
        shouldResumeUpload: true,
        errorMessage: null,
      })
      : Promise.resolve()));
    await loadDraftPhotos();
  }, [loadDraftPhotos, photos]);

  const removePhoto = async (photo: DraftPhoto) => {
    if (!photo.id) return;
    await removeWarehousePhotoQueueItem(photo.id);
    livePhotoBlobsRef.current.delete(photo.id);
    setPhotoLimitWarning(null);
    await loadDraftPhotos();
  };

  const clearDraft = async () => {
    localStorage.removeItem(DRAFT_KEY);
    await clearWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    livePhotoBlobsRef.current.clear();
    setForm(emptyForm());
    setInspection(emptyWarehouseInspection());
    setUploadSessionId(createUploadSessionId());
    setActiveStep(0);
    await loadDraftPhotos();
  };

  const exitReception = () => {
    navigate('/warehouse/operations', { replace: true });
  };

  const uploadQueuedPhotos = async (vehicleId: string, total: number) => {
    const draftQueue = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    const readyHashes = draftQueue
      .filter((item) => item.uploadStatus === 'uploaded' && item.clientHash)
      .map((item) => item.clientHash!);
    if (readyHashes.length !== draftQueue.length) {
      throw new Error('Не все фотографии догружены на сервер. Дождитесь завершения загрузки и повторите приёмку.');
    }
    setProgress({ done: 0, total, label: 'Привязка фотографий' });
    const response = await attachWarehousePendingPhotos(vehicleId, uploadSessionId, readyHashes);
    const attachedCount = (response.data.attached || 0) + (response.data.alreadyAttached || 0);
    setPhotoUploadStatus({
      uploaded: attachedCount,
      total,
      pending: Math.max(0, total - attachedCount),
    });
    if (attachedCount === total) {
      await clearWarehousePhotoQueue(DRAFT_PHOTO_KEY);
    }
    setProgress({ done: attachedCount, total, label: 'Привязка фотографий' });
  };

  const retryPhotoUpload = async () => {
    if (!completedVehicle || saving) return;
    setSaving(true);
    setUploadWarning(null);
    try {
      await uploadQueuedPhotos(completedVehicle.id, photoUploadStatus.total);
    } catch {
      const draftQueue = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY).catch(() => []);
      const pending = draftQueue.filter((item) => item.uploadStatus !== 'uploaded').length;
      setPhotoUploadStatus((current) => ({
        ...current,
        uploaded: draftQueue.filter((item) => item.uploadStatus === 'uploaded').length,
        pending,
      }));
      setUploadWarning('Не удалось привязать все фотографии. Проверьте интернет и повторите попытку.');
    } finally {
      setSaving(false);
    }
  };

  const performSubmit = useCallback(async () => {
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
    setInspectionWarning(null);
    setAcceptanceModalOpen(false);
    setPendingSubmitAfterUpload(false);
    let vehicle: WarehouseVehicle | null = null;
    try {
      setProgress({ done: 0, total: 1, label: 'Создание карточки ТС' });
      const { receivedDate: _ignoredReceivedDate, ...automaticReceptionPayload } = form;
      const vehicleResponse = await createWarehouseVehicle(automaticReceptionPayload);
      vehicle = vehicleResponse.data;
      const totalPhotos = photos.length;
      localStorage.removeItem(DRAFT_KEY);
      setCompletedVehicle(vehicle);
      setPhotoUploadStatus({ uploaded: 0, total: totalPhotos, pending: totalPhotos });

      try {
        await saveWarehouseVehicleInspection(vehicle.id, 'reception', {
          ...inspection,
          photoChecklist: buildPhotoChecklistState(photos),
        });
      } catch (inspectionError) {
        setInspectionWarning(
          `Карточка создана, но акт осмотра не сохранился: ${messageFromError(inspectionError)}`,
        );
      }

      try {
        await uploadQueuedPhotos(vehicle.id, totalPhotos);
      } catch {
        const draftQueue = await listWarehousePhotoQueue(DRAFT_PHOTO_KEY).catch(() => []);
        const uploadedCount = draftQueue.filter((item) => item.uploadStatus === 'uploaded').length;
        const pending = Math.max(0, totalPhotos - uploadedCount);
        setPhotoUploadStatus({
          uploaded: uploadedCount,
          total: totalPhotos,
          pending,
        });
        setUploadWarning('Карточка создана, но не все фотографии удалось привязать. Повторите привязку.');
      }
    } catch (submitError) {
      if (!vehicle) {
        setError(messageFromError(submitError));
      } else {
        setCompletedVehicle(vehicle);
        setInspectionWarning(
          `Карточка создана, но часть данных приёмки не сохранилась: ${messageFromError(submitError)}`,
        );
      }
    } finally {
      setSaving(false);
    }
  }, [
    form,
    inspection,
    photos,
    uploadSessionId,
  ]);

  const submit = async () => {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const validationError = validateStep(index);
      if (validationError) {
        setActiveStep(index);
        setError(validationError);
        return;
      }
    }

    if (!photoUploadSummary.ready || processingPhotos) {
      setError(null);
      setAcceptanceModalOpen(true);
      setPendingSubmitAfterUpload(true);
      return;
    }

    await performSubmit();
  };

  useEffect(() => {
    if (!pendingSubmitAfterUpload || saving) return;
    if (!photoUploadSummary.ready || processingPhotos) return;
    void performSubmit();
  }, [pendingSubmitAfterUpload, performSubmit, photoUploadSummary.ready, processingPhotos, saving]);

  const downloadReceptionAct = async () => {
    if (!completedVehicle) return;
    try {
      const response = await downloadWarehouseVehicleInspectionAct(completedVehicle.id, 'reception');
      downloadBlob(response.data, `Акт_передачи_${completedVehicle.warehouseNumber}.pdf`);
    } catch (downloadError) {
      setError(messageFromError(downloadError));
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
              {photoUploadStatus.total > 0 && (
                <Alert
                  severity={photoUploadStatus.pending === 0 ? 'success' : 'warning'}
                  sx={{ width: '100%' }}
                >
                  Фотографии: загружено {photoUploadStatus.uploaded} из {photoUploadStatus.total}.
                  {photoUploadStatus.pending > 0 && ` Осталось: ${photoUploadStatus.pending}.`}
                </Alert>
              )}
              {uploadWarning && <Alert severity="warning" sx={{ width: '100%' }}>{uploadWarning}</Alert>}
              {inspectionWarning && (
                <Alert severity="warning" sx={{ width: '100%' }}>
                  {inspectionWarning}
                </Alert>
              )}
              {(photoUploadStatus.pending > 0 || uploadWarning) && (
                <Button
                  fullWidth
                  variant="contained"
                  color="warning"
                  startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
                  disabled={saving}
                  onClick={() => void retryPhotoUpload()}
                >
                  {saving ? 'Загрузка фотографий…' : 'Повторить загрузку фото'}
                </Button>
              )}
              <Alert severity="success">
                Приёмка зафиксирована автоматически: {formatOperationDateTime(completedVehicle.receivedAt)}.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="outlined"
                  onClick={() => void downloadReceptionAct()}
                >
                  Скачать акт передачи
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setCompletedVehicle(null);
                    setForm(emptyForm());
                    setInspection(emptyWarehouseInspection());
                    setUploadSessionId(createUploadSessionId());
                    setActiveStep(0);
                    livePhotoBlobsRef.current.clear();
                    setPhotos([]);
                    setPhotoUploadStatus({ uploaded: 0, total: 0, pending: 0 });
                    setUploadWarning(null);
                    setInspectionWarning(null);
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
        minHeight: { xs: 'calc(100dvh - 56px)', sm: '100%' },
        bgcolor: 'grey.50',
        p: { xs: 0.5, sm: 1, md: 3 },
        pb: { xs: 'calc(68px + env(safe-area-inset-bottom))', sm: 1, md: 3 },
        overflowX: 'clip',
        overflowY: 'visible',
      }}
    >
      <Stack
        spacing={{ xs: 0.75, sm: 1, md: 2.5 }}
        sx={{
          maxWidth: 980,
          mx: 'auto',
          '& .MuiAlert-root': {
            px: { xs: 1.25, sm: 2 },
            py: { xs: 0.5, sm: 0.75 },
            alignItems: 'center',
          },
          '& .MuiAlert-icon': {
            mr: { xs: 1, sm: 1.5 },
            py: { xs: 0.25, sm: 0.5 },
          },
          '& .MuiAlert-message': {
            py: { xs: 0.5, sm: 0.75 },
            fontSize: { xs: 14, sm: 15, md: 16 },
            lineHeight: { xs: 1.35, sm: 1.45 },
          },
          '& .MuiInputBase-root:not(.MuiInputBase-multiline)': {
            minHeight: { xs: 50, sm: 56 },
          },
          '& .MuiInputBase-input, & .MuiSelect-select': {
            fontSize: { xs: 16, sm: 16 },
          },
        }}
      >
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

        <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1.5, md: 3 } }}>
          <Stack spacing={{ xs: 1.25, sm: 1.5, md: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  variant="overline"
                  color="primary"
                  sx={{ fontSize: { xs: 12, sm: 13 }, lineHeight: 1.2 }}
                >
                  Шаг {activeStep + 1} из {STEPS.length}
                </Typography>
                <Typography
                  variant="h5"
                  sx={{ fontSize: { xs: 24, sm: 26, md: 30 }, lineHeight: 1.1 }}
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
                    onOpen={() => setCounterpartyPickerOpen(true)}
                    onClose={() => setCounterpartyPickerOpen(false)}
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
                      px: { xs: 1.25, sm: 2 },
                      py: { xs: 1, sm: 1.5 },
                      textAlign: 'left',
                      lineHeight: 1.25,
                      fontSize: { xs: 14, sm: 15 },
                    }}
                  >
                    Основание приёмки — необязательно
                  </Button>
                  <Collapse in={basisOpen}>
                    <Stack spacing={{ xs: 1.25, sm: 2 }} sx={{ px: { xs: 1.25, sm: 2 }, pb: { xs: 1.25, sm: 2 } }}>
                      <Alert severity="info">
                        Только при наличии заявки клиента. Складской номер и время приёмки
                        система сформирует автоматически.
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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 2 }}>
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
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.25, sm: 2 }}>
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
              <Stack spacing={2}>
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
                  label="Комментарий к осмотру"
                  placeholder="Царапины, вмятины, состояние салона, комплектность и другие замечания"
                  value={form.notes || ''}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
                <WarehouseInspectionForm value={inspection} onChange={setInspection} />
              </Stack>
            )}

            {activeStep === 3 && (
              <Stack spacing={2}>
                <WarehouseDamageScheme
                  value={inspection}
                  vehicleType={form.vehicleType}
                  onChange={setInspection}
                />
              </Stack>
            )}

            {activeStep === 4 && (
              <>
                <Chip
                  label={`Количество фотографий — ${photos.length} из 60`}
                  color={photos.length > 0 ? 'success' : 'default'}
                  variant="outlined"
                  sx={{
                    width: '100%',
                    justifyContent: 'center',
                    '& .MuiChip-label': {
                      width: '100%',
                      textAlign: 'center',
                    },
                  }}
                />
                {photos.length > 0 && (
                  <Alert
                    severity={
                      photoUploadSummary.failed > 0
                        ? 'error'
                        : photoUploadSummary.ready
                          ? 'success'
                          : 'info'
                    }
                  >
                    Фото на сервере: {photoUploadSummary.uploaded}/{photoUploadSummary.total}.
                    {photoUploadSummary.uploading > 0 && ` Загружается: ${photoUploadSummary.uploading}.`}
                    {photoUploadSummary.pending > 0 && ` В очереди: ${photoUploadSummary.pending}.`}
                    {photoUploadSummary.failed > 0 && ` Ошибок: ${photoUploadSummary.failed}.`}
                  </Alert>
                )}
                {photos.length > 0 && !photoUploadSummary.ready && photoUploadSummary.failed === 0 && (
                  <LinearProgress
                    variant="determinate"
                    value={photoUploadSummary.total > 0
                      ? photoUploadSummary.uploaded / photoUploadSummary.total * 100
                      : 0}
                  />
                )}
                {photoUploadSummary.failed > 0 && (
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<Refresh />}
                    onClick={() => void retryFailedPhotos()}
                  >
                    Повторить загрузку фото
                  </Button>
                )}
                {photoLimitWarning && (
                  <Alert severity="warning" onClose={() => setPhotoLimitWarning(null)}>
                    {photoLimitWarning}
                  </Alert>
                )}
                <WarehousePhotoChecklist
                  photos={photos}
                  disabled={saving || processingPhotos || photos.length >= 60}
                  onFiles={(files, checklistItem) => void handleChecklistFiles(files, checklistItem)}
                  onRemove={(photo) => {
                    const target = photos.find((item) => item.id === photo.id);
                    if (target) void removePhoto(target);
                  }}
                />
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
              </>
            )}

            {activeStep === 5 && (
              <Stack spacing={2}>
                <Alert severity="info">Проверьте данные перед созданием складской карточки.</Alert>
                {[
                  ['Контрагент', selectedCounterparty?.nameShort || selectedCounterparty?.nameFull || '—'],
                  ['Входящая заявка клиента', form.requestNumber
                    ? `${form.requestNumber}${form.requestDate ? ` от ${form.requestDate}` : ''}`
                    : 'Не указана'],
                  ['Тип ТС', warehouseVehicleTypeLabel(form.vehicleType)],
                  ['ТС', `${form.brand} ${form.model}`],
                  ['VIN / шасси', form.vin || form.chassisNumber || '—'],
                  ['Госномер', form.registrationNumber || '—'],
                  ['Дата и время приёмки', 'Автоматически при подтверждении'],
                  ['Топливо', form.fuelLevelPercent === null ? 'Не указано' : `${form.fuelLevelPercent}%`],
                  ['Фотографии', String(photos.length)],
                  ['Отметки на схеме', damageMarksCount > 0 ? String(damageMarksCount) : 'Нет'],
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
            p: { xs: 0.75, sm: 1.5 },
            pb: { xs: 'calc(6px + env(safe-area-inset-bottom))', sm: 1.5 },
            display: { xs: counterpartyPickerOpen ? 'none' : 'block', sm: 'block' },
            position: 'sticky',
            left: { xs: 4, sm: 'auto' },
            right: { xs: 4, sm: 'auto' },
            bottom: { xs: 0, sm: 0 },
            zIndex: (theme) => theme.zIndex.modal + 1,
            boxShadow: { xs: 3, md: 0 },
          }}
        >
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Button
              size="small"
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
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<ArrowForward />}
                  onClick={goNext}
                  disabled={saving}
                >
                  Далее
                </Button>
              ) : (
                <Button
                  size="small"
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

        <Dialog open={acceptanceModalOpen} fullWidth maxWidth="xs">
          <DialogTitle>Подготовка фото к приёмке</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Карточка ТС будет создана автоматически, как только все фотографии догрузятся на сервер.
              </Typography>
              <Alert severity={photoUploadSummary.failed > 0 ? 'warning' : 'info'}>
                Фото на сервере: {photoUploadSummary.uploaded}/{photoUploadSummary.total}.
                {photoUploadSummary.uploading > 0 && ` Загружается: ${photoUploadSummary.uploading}.`}
                {photoUploadSummary.pending > 0 && ` В очереди: ${photoUploadSummary.pending}.`}
                {photoUploadSummary.failed > 0 && ` Ошибок: ${photoUploadSummary.failed}.`}
              </Alert>
              <LinearProgress
                variant={photoUploadSummary.total > 0 ? 'determinate' : 'indeterminate'}
                value={photoUploadSummary.total > 0
                  ? photoUploadSummary.uploaded / photoUploadSummary.total * 100
                  : 0}
              />
              {photoUploadSummary.failed > 0 && (
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<Refresh />}
                  onClick={() => void retryFailedPhotos()}
                >
                  Повторить загрузку фото
                </Button>
              )}
              <Button
                variant="text"
                disabled={saving}
                onClick={() => {
                  setPendingSubmitAfterUpload(false);
                  setAcceptanceModalOpen(false);
                }}
              >
                Вернуться к редактированию
              </Button>
            </Stack>
          </DialogContent>
        </Dialog>
      </Stack>
    </Box>
  );
}
