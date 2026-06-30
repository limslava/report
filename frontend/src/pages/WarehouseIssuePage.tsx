import {
  ArrowBack,
  ArrowForward,
  CheckCircle,
  Refresh,
  ExpandMore,
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
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getWarehousePerformedServices,
  downloadWarehouseVehicleInspectionAct,
  getWarehousePendingPhotos,
  getWarehouseVehicleInspection,
  getWarehouseVehiclePhotos,
  getWarehouseVehicles,
  issueWarehouseVehicle,
  saveWarehouseVehicleInspection,
  attachWarehousePendingPhotos,
  WarehousePerformedService,
  WarehousePhoto,
  WarehouseVehicleInspectionPayload,
  WarehouseVehicle,
} from '../services/warehouse.api';
import WarehouseInspectionForm, {
  emptyWarehouseInspection,
} from '../components/warehouse/WarehouseInspectionForm';
import WarehousePhotoChecklist, {
  buildPhotoChecklistState,
} from '../components/warehouse/WarehousePhotoChecklist';
import { WarehousePhotoChecklistItem } from '../constants/warehouse';
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

const STEPS = ['Выбор ТС', 'Проверка', 'Фото выдачи', 'Подтверждение'];
const ISSUE_QUEUE_PREFIX = 'draft:warehouse-issue:';
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });

const MAX_PARALLEL_PENDING_UPLOADS = 3;

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

const hasInspectionValues = (inspection: WarehouseVehicleInspectionPayload) => [
  inspection.vehicleDetails,
  inspection.documentsAndKeys,
  inspection.equipment,
  inspection.technicalCondition,
].some((group) => Object.values(group ?? {}).some((value) => (
  value !== null
  && value !== undefined
  && value !== ''
  && value !== false
)));

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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isRetriablePhotoUploadError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    const status = response?.status;
    return !status || status === 408 || status === 425 || status === 429 || status >= 500;
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
  const [uploadSessionId, setUploadSessionId] = useState(createUploadSessionId);
  const [inspection, setInspection] = useState<WarehouseVehicleInspectionPayload>(emptyWarehouseInspection);
  const [inspectionSource, setInspectionSource] = useState<'issue' | 'reception' | 'empty'>('empty');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [completedVehicle, setCompletedVehicle] = useState<WarehouseVehicle | null>(null);
  const [acceptanceModalOpen, setAcceptanceModalOpen] = useState(false);
  const [pendingSubmitAfterUpload, setPendingSubmitAfterUpload] = useState(false);
  const activeUploadsRef = useRef<Set<number>>(new Set());
  const activeUploadStartedAtRef = useRef<Map<number, number>>(new Map());
  const livePhotoBlobsRef = useRef<Map<number, Blob>>(new Map());

  const queueKey = selectedVehicle ? `${ISSUE_QUEUE_PREFIX}${selectedVehicle.id}` : null;

  const loadDraftPhotos = useCallback(async () => {
    if (!queueKey) {
      setDraftPhotos([]);
      return;
    }
    const queued = await listWarehousePhotoQueue(queueKey);
    if (queued[0]?.uploadSessionId) {
      setUploadSessionId(queued[0].uploadSessionId);
    }
    setDraftPhotos((current) => mergeDraftPhotosWithPreviews(current, queued, livePhotoBlobsRef.current));
  }, [queueKey]);

  const syncPendingPhotosFromServer = useCallback(async (sessionId = uploadSessionId) => {
    if (!queueKey) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const queued = await listWarehousePhotoQueue(queueKey);
    const effectiveSessionId = queued.find((photo) => photo.uploadSessionId)?.uploadSessionId || sessionId;
    const response = await getWarehousePendingPhotos(effectiveSessionId, 'issue');
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
  }, [queueKey, uploadSessionId]);

  const loadVehicleDetails = useCallback(async (vehicle: WarehouseVehicle) => {
    const [
      servicesResponse,
      photosResponse,
      issueInspectionResponse,
      receptionInspectionResponse,
    ] = await Promise.all([
      getWarehousePerformedServices(vehicle.id),
      getWarehouseVehiclePhotos(vehicle.id),
      getWarehouseVehicleInspection(vehicle.id, 'issue'),
      getWarehouseVehicleInspection(vehicle.id, 'reception'),
    ]);
    setServices(servicesResponse.data);
    setStoredPhotos(photosResponse.data);
    if (issueInspectionResponse.data) {
      setInspection(issueInspectionResponse.data);
      setInspectionSource('issue');
    } else if (receptionInspectionResponse.data) {
      setInspection({
        vehicleDetails: receptionInspectionResponse.data.vehicleDetails,
        documentsAndKeys: receptionInspectionResponse.data.documentsAndKeys,
        equipment: receptionInspectionResponse.data.equipment,
        technicalCondition: receptionInspectionResponse.data.technicalCondition,
        photoChecklist: {},
        damageNotes: receptionInspectionResponse.data.damageNotes,
        personalItemsNotes: receptionInspectionResponse.data.personalItemsNotes,
        responsibilityAmount: receptionInspectionResponse.data.responsibilityAmount,
      });
      setInspectionSource('reception');
    } else {
      setInspection(emptyWarehouseInspection());
      setInspectionSource('empty');
    }
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
            const existingQueue = await listWarehousePhotoQueue(`${ISSUE_QUEUE_PREFIX}${vehicle.id}`).catch(() => []);
            if (existingQueue.length > 0) {
              setActiveStep(2);
            }
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
    if (!queueKey) return;
    void recoverWarehousePhotoQueue(queueKey)
      .then(() => syncPendingPhotosFromServer())
      .then(() => loadDraftPhotos())
      .catch(() => loadDraftPhotos());
  }, [loadDraftPhotos, queueKey, syncPendingPhotosFromServer]);

  useEffect(() => {
    const resyncDraftPhotos = () => {
      if (!queueKey) return;
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      void recoverWarehousePhotoQueue(queueKey)
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
  }, [loadDraftPhotos, queueKey, syncPendingPhotosFromServer]);

  useEffect(() => () => {
    draftPhotos.forEach((photo) => {
      if (!photo.previewDataUrl) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    });
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
  const hasReceptionInspectionValues = inspectionSource === 'reception' && hasInspectionValues(inspection);
  const photoUploadSummary = useMemo(() => {
    const uploaded = draftPhotos.filter((photo) => photo.uploadStatus === 'uploaded').length;
    const uploading = draftPhotos.filter((photo) => photo.uploadStatus === 'uploading').length;
    const failed = draftPhotos.filter((photo) => photo.uploadStatus === 'error').length;
    const pending = Math.max(0, draftPhotos.length - uploaded - uploading - failed);
    return {
      uploaded,
      uploading,
      failed,
      pending,
      total: draftPhotos.length,
      ready: draftPhotos.length > 0 && uploaded === draftPhotos.length,
    };
  }, [draftPhotos]);

  const selectVehicle = async (vehicle: WarehouseVehicle) => {
    setSelectedVehicle(vehicle);
    setUploadSessionId(createUploadSessionId());
    setError(null);
    setLoading(true);
    try {
      navigate(`/warehouse/issue?vehicleId=${vehicle.id}`, { replace: true });
      await loadVehicleDetails(vehicle);
      setActiveStep(1);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  };

  const uploadDraftPhotoToPending = useCallback(async (photo: DraftPhoto) => {
    if (!photo.id || photo.uploadStatus === 'uploaded' || activeUploadsRef.current.has(photo.id)) return;
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
            phase: 'issue',
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
      activeUploadsRef.current.delete(photo.id);
      activeUploadStartedAtRef.current.delete(photo.id);
      await loadDraftPhotos();
    }
  }, [loadDraftPhotos, uploadSessionId]);

  const pumpPhotoUploadQueue = useCallback(() => {
    if (!selectedVehicle || processing || loading || completedVehicle) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    const uploadingPhotoIds = new Set(
      draftPhotos
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
    draftPhotos
      .filter((photo) => (
        photo.id
        && (!photo.uploadStatus || photo.uploadStatus === 'pending')
        && !activeUploadsRef.current.has(photo.id)
      ))
      .slice(0, freeSlots)
      .forEach((photo) => {
        void uploadDraftPhotoToPending(photo);
      });
  }, [completedVehicle, draftPhotos, loading, processing, selectedVehicle, uploadDraftPhotoToPending]);

  useEffect(() => {
    pumpPhotoUploadQueue();
  }, [pumpPhotoUploadQueue]);

  useEffect(() => {
    if (!selectedVehicle || completedVehicle || loading || processing || photoUploadSummary.ready) return;
    const timer = window.setInterval(() => {
      pumpPhotoUploadQueue();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [
    completedVehicle,
    loading,
    photoUploadSummary.ready,
    processing,
    pumpPhotoUploadQueue,
    selectedVehicle,
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
    if (!queueKey) return;
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
        const previewDataUrl = await blobToDataUrl(prepared.blob);
        const queueId = await enqueueWarehousePhoto({
          vehicleId: queueKey,
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
      setProcessing(false);
    }
  };

  const handleChecklistFiles = async (
    files: File[],
    checklistItem: WarehousePhotoChecklistItem,
  ) => {
    await processPhotoFiles(files, checklistItem);
  };

  const removeDraftPhoto = async (photo: DraftPhoto) => {
    if (!photo.id) return;
    await removeWarehousePhotoQueueItem(photo.id);
    livePhotoBlobsRef.current.delete(photo.id);
    await loadDraftPhotos();
  };

  const retryFailedPhotos = useCallback(async () => {
    const failed = draftPhotos.filter((photo) => photo.id && photo.uploadStatus === 'error');
    await Promise.all(failed.map((photo) => (
      photo.id
        ? updateWarehousePhotoQueueItem(photo.id, {
          uploadStatus: 'pending',
          shouldResumeUpload: true,
          errorMessage: null,
        })
        : Promise.resolve()
    )));
    await loadDraftPhotos();
  }, [draftPhotos, loadDraftPhotos]);

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
    if ((draftPhotos.length > 0 && !photoUploadSummary.ready) || processing) {
      setError(null);
      setAcceptanceModalOpen(true);
      setPendingSubmitAfterUpload(true);
      return;
    }
    setSaving(true);
    setError(null);
    setAcceptanceModalOpen(false);
    setPendingSubmitAfterUpload(false);
    try {
      if (draftPhotos.length > 0) {
        setProgress({ done: 0, total: draftPhotos.length, label: 'Привязка фотографий выдачи' });
        const readyHashes = draftPhotos
          .filter((photo) => photo.clientHash)
          .map((photo) => photo.clientHash!);
        const attachResponse = await attachWarehousePendingPhotos(selectedVehicle.id, uploadSessionId, readyHashes);
        const attachedCount = (attachResponse.data.attached || 0) + (attachResponse.data.alreadyAttached || 0);
        setProgress({ done: attachedCount, total: draftPhotos.length, label: 'Привязка фотографий выдачи' });
      }
      const latestPhotosResponse = await getWarehouseVehiclePhotos(selectedVehicle.id);
      const issuePhotoIds = latestPhotosResponse.data
        .filter((photo) => photo.phase === 'issue')
        .map((photo) => photo.id);
      setProgress({ done: 0, total: 1, label: 'Подтверждение выдачи' });
      await saveWarehouseVehicleInspection(selectedVehicle.id, 'issue', {
        ...inspection,
        photoChecklist: buildPhotoChecklistState([
          ...latestPhotosResponse.data.filter((photo) => photo.phase === 'issue'),
        ]),
      });
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

  useEffect(() => {
    if (!pendingSubmitAfterUpload || saving || processing) return;
    if (draftPhotos.length > 0 && !photoUploadSummary.ready) return;
    void submit();
  }, [draftPhotos.length, pendingSubmitAfterUpload, photoUploadSummary.ready, processing, saving]);

  const downloadIssueAct = async () => {
    if (!completedVehicle) return;
    try {
      const response = await downloadWarehouseVehicleInspectionAct(completedVehicle.id, 'issue');
      downloadBlob(response.data, `Акт_возврата_${completedVehicle.warehouseNumber}.pdf`);
    } catch (downloadError) {
      setError(messageFromError(downloadError));
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
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="outlined" onClick={() => void downloadIssueAct()}>
                  Скачать акт возврата
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
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Button
                  fullWidth
                  color="inherit"
                  endIcon={(
                    <ExpandMore
                      sx={{
                        transform: inspectionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 150ms',
                      }}
                    />
                  )}
                  onClick={() => setInspectionOpen((current) => !current)}
                  sx={{ justifyContent: 'space-between', px: 0, textAlign: 'left' }}
                >
                  Изменения к акту возврата
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Машина уже выбрана. Этот блок нужен только для отличий от приёмки:
                  новые повреждения, комплектность или замечания.
                </Typography>
                {inspectionSource === 'empty' && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    В базе нет сохранённого акта приёмки по этому ТС. Можно продолжить выдачу
                    по фото и карточке, а изменения заполнить вручную при необходимости.
                  </Alert>
                )}
                {inspectionSource === 'reception' && !hasReceptionInspectionValues && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Акт приёмки найден, но реквизиты техники в нём не заполнены.
                    Подтянуть можно только те данные, которые были внесены при приёмке.
                  </Alert>
                )}
                <Collapse in={inspectionOpen}>
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {inspectionSource === 'reception' && (
                      <Alert severity="info">
                        Данные подтянуты из акта приёмки. Исправьте только изменения.
                      </Alert>
                    )}
                    {inspectionSource === 'issue' && (
                      <Alert severity="success">
                        Черновик акта возврата уже сохранён. Можно проверить и продолжить выдачу.
                      </Alert>
                    )}
                    <WarehouseInspectionForm value={inspection} onChange={setInspection} />
                  </Stack>
                </Collapse>
              </Paper>
            </Stack>
          )}

          {activeStep === 2 && selectedVehicle && (
            <Stack spacing={2}>
              <Typography variant="h5">Фотофиксация при выдаче</Typography>
              <Alert severity={issuePhotoCount > 0 ? 'success' : 'warning'}>
                Добавлено фотографий выдачи: {issuePhotoCount}. Сделайте снимки общего состояния и выявленных повреждений.
              </Alert>
              {draftPhotos.length > 0 && (
                <Alert severity={photoUploadSummary.failed > 0 ? 'warning' : 'info'}>
                  Фото на сервере: {photoUploadSummary.uploaded}/{photoUploadSummary.total}.
                  {photoUploadSummary.uploading > 0 && ` Загружается: ${photoUploadSummary.uploading}.`}
                  {photoUploadSummary.pending > 0 && ` В очереди: ${photoUploadSummary.pending}.`}
                  {photoUploadSummary.failed > 0 && ` Ошибок: ${photoUploadSummary.failed}.`}
                </Alert>
              )}
              {draftPhotos.length > 0 && photoUploadSummary.failed === 0 && !photoUploadSummary.ready && (
                <LinearProgress
                  variant={photoUploadSummary.total > 0 ? 'determinate' : 'indeterminate'}
                  value={photoUploadSummary.total > 0
                    ? photoUploadSummary.uploaded / photoUploadSummary.total * 100
                    : 0}
                />
              )}
              {photoUploadSummary.failed > 0 && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Refresh />}
                  onClick={() => void retryFailedPhotos()}
                >
                  Повторить загрузку фото
                </Button>
              )}
              <WarehousePhotoChecklist
                photos={[
                  ...existingIssuePhotos,
                  ...draftPhotos,
                ]}
                disabled={processing || issuePhotoCount >= 60}
                onFiles={(files, checklistItem) => void handleChecklistFiles(files, checklistItem)}
                onRemove={(photo) => {
                  const target = draftPhotos.find((item) => item.id === photo.id);
                  if (target) void removeDraftPhoto(target);
                }}
              />
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

        <Dialog open={acceptanceModalOpen} fullWidth maxWidth="xs">
          <DialogTitle>Подготовка фото к выдаче</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography color="text.secondary">
                Выдача подтвердится автоматически, как только все фотографии догрузятся на сервер.
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
                  variant="outlined"
                  color="warning"
                  startIcon={<Refresh />}
                  onClick={() => void retryFailedPhotos()}
                >
                  Повторить загрузку фото
                </Button>
              )}
              <Button variant="text" onClick={() => {
                setAcceptanceModalOpen(false);
                setPendingSubmitAfterUpload(false);
              }}>
                Вернуться к редактированию
              </Button>
            </Stack>
          </DialogContent>
        </Dialog>
      </Stack>
    </Box>
  );
}
