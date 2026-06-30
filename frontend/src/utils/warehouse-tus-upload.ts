import * as tus from 'tus-js-client';
import { useAuthStore } from '../store/auth-store';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
const CHUNK_SIZE_BYTES = 1 * 1024 * 1024;
const UPLOAD_INACTIVITY_TIMEOUT_MS = 60_000;
const UPLOAD_TOTAL_TIMEOUT_MS = 600_000;

const resolveTusEndpoint = (): string => {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
  if (normalizedBase.endsWith('/api')) {
    return `${normalizedBase}/warehouse/uploads`;
  }
  return `${normalizedBase}/api/warehouse/uploads`;
};

const buildFingerprint = (uploadSessionId: string, clientHash: string, file: Blob, phase: 'reception' | 'issue') =>
  `warehouse-tus::${window.location.origin}::${phase}::${uploadSessionId}::${clientHash}::${file.size}::${file.type || 'image/jpeg'}`;

interface UploadWarehousePhotoViaTusParams {
  file: Blob;
  originalName: string;
  uploadSessionId: string;
  clientHash: string;
  phase: 'reception' | 'issue';
  checklistItem?: string | null;
  resumeFromPrevious?: boolean;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
}

export const uploadWarehousePhotoViaTus = async ({
  file,
  originalName,
  uploadSessionId,
  clientHash,
  phase,
  checklistItem,
  resumeFromPrevious = false,
  onProgress,
}: UploadWarehousePhotoViaTusParams): Promise<void> => {
  const token = useAuthStore.getState().token;
  const user = useAuthStore.getState().user;
  if (!token) {
    throw new Error('Сессия истекла. Войдите заново.');
  }
  if (!user?.id || !user?.fullName || !user?.role) {
    throw new Error('Не удалось определить пользователя для загрузки фото.');
  }

  const endpoint = resolveTusEndpoint();
  const fingerprint = buildFingerprint(uploadSessionId, clientHash, file, phase);

  await new Promise<void>((resolve, reject) => {
    let retriedWithoutResume = false;
    let settled = false;

    const startUpload = (shouldResume = resumeFromPrevious) => {
      const upload = new tus.Upload(file, {
        endpoint,
        chunkSize: CHUNK_SIZE_BYTES,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        removeFingerprintOnSuccess: true,
        fingerprint: () => Promise.resolve(fingerprint),
        headers: {
          Authorization: `Bearer ${token}`,
        },
        metadata: {
          filename: originalName,
          filetype: file.type || 'image/jpeg',
          uploadSessionId,
          clientHash,
          phase,
          uploadedById: user.id,
          uploadedByName: user.fullName,
          uploadedByRole: user.role,
          ...(checklistItem ? { checklistItem } : {}),
        },
        onError: (error) => {
          if (settled) return;
          settled = true;
          clearTimers();
          const message = String(error?.message || '').toLowerCase();
          const isResumeError = message.includes('failed to resume upload')
            || message.includes('409')
            || message.includes('404')
            || (error as { originalRequest?: { getMethod?: () => string } })?.originalRequest?.getMethod?.() === 'HEAD';

          if (!retriedWithoutResume && shouldResume && isResumeError) {
            settled = false;
            retriedWithoutResume = true;
            startUpload(false);
            return;
          }

          reject(error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          resetInactivityTimer(upload);
          onProgress?.(bytesUploaded, bytesTotal);
        },
        onSuccess: () => {
          if (settled) return;
          settled = true;
          clearTimers();
          resolve();
        },
      });

      let inactivityTimer: number | null = null;
      let totalTimer: number | null = null;

      const abortWithTimeout = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimers();
        void upload.abort(true).catch(() => undefined);
        reject(new Error(message));
      };

      function clearTimers() {
        if (inactivityTimer != null) {
          window.clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
        if (totalTimer != null) {
          window.clearTimeout(totalTimer);
          totalTimer = null;
        }
      }

      function resetInactivityTimer(currentUpload: tus.Upload) {
        if (inactivityTimer != null) {
          window.clearTimeout(inactivityTimer);
        }
        inactivityTimer = window.setTimeout(() => {
          abortWithTimeout('Превышено время ожидания загрузки фото. Попробуйте ещё раз.');
        }, UPLOAD_INACTIVITY_TIMEOUT_MS);
        if (totalTimer == null) {
          totalTimer = window.setTimeout(() => {
            if (settled) return;
            void currentUpload.abort(true).catch(() => undefined);
            abortWithTimeout('Загрузка фото заняла слишком много времени. Попробуйте ещё раз.');
          }, UPLOAD_TOTAL_TIMEOUT_MS);
        }
      }

      resetInactivityTimer(upload);

      if (shouldResume) {
        upload.findPreviousUploads()
          .then((previousUploads) => {
            if (previousUploads.length > 0) {
              upload.resumeFromPreviousUpload(previousUploads[0]);
            }
            upload.start();
          })
          .catch(() => upload.start());
        return;
      }

      upload.start();
    };

    startUpload(resumeFromPrevious);
  });
};
