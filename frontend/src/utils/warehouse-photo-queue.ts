const DB_NAME = 'report-warehouse-photo-queue';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';

export interface WarehousePhotoQueueItem {
  id?: number;
  vehicleId: string;
  name: string;
  blob: Blob;
  previewDataUrl?: string | null;
  checklistItem?: string | null;
  uploadSessionId?: string | null;
  clientHash?: string | null;
  uploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'error';
  shouldResumeUpload?: boolean | null;
  uploadStartedAt?: number | null;
  uploadedAt?: number | null;
  errorMessage?: string | null;
  createdAt: number;
}

const openQueueDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, {
        keyPath: 'id',
        autoIncrement: true,
      });
      store.createIndex('vehicleId', 'vehicleId', { unique: false });
    }
  };
});

export const enqueueWarehousePhoto = async (
  item: Omit<WarehousePhotoQueueItem, 'id' | 'createdAt'>,
): Promise<number> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).add({
      ...item,
      createdAt: Date.now(),
    });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(Number(request.result));
    transaction.oncomplete = () => db.close();
  });
};

export const listWarehousePhotoQueue = async (
  vehicleId: string,
): Promise<WarehousePhotoQueueItem[]> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index('vehicleId').getAll(vehicleId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as WarehousePhotoQueueItem[]);
    transaction.oncomplete = () => db.close();
  });
};

export const listAllWarehousePhotoQueue = async (): Promise<WarehousePhotoQueueItem[]> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as WarehousePhotoQueueItem[]);
    transaction.oncomplete = () => db.close();
  });
};

export const removeWarehousePhotoQueueItem = async (id: number): Promise<void> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
};

export const updateWarehousePhotoQueueItem = async (
  id: number,
  patch: Partial<WarehousePhotoQueueItem>,
): Promise<void> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const current = request.result as WarehousePhotoQueueItem | undefined;
      if (!current) {
        resolve();
        return;
      }
      store.put({ ...current, ...patch });
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
};

export const reassignWarehousePhotoQueue = async (
  fromVehicleId: string,
  toVehicleId: string,
): Promise<void> => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('vehicleId').openCursor(IDBKeyRange.only(fromVehicleId));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.update({ ...cursor.value, vehicleId: toVehicleId });
      cursor.continue();
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
};

export const clearWarehousePhotoQueue = async (vehicleId: string): Promise<void> => {
  const items = await listWarehousePhotoQueue(vehicleId);
  await Promise.all(items.map((item) => item.id
    ? removeWarehousePhotoQueueItem(item.id)
    : Promise.resolve()));
};

export const recoverWarehousePhotoQueue = async (vehicleId: string): Promise<void> => {
  const items = await listWarehousePhotoQueue(vehicleId);
  await Promise.all(items.map((item) => {
    if (!item.id) return Promise.resolve();
    if (item.uploadStatus !== 'uploading' && item.uploadStatus !== 'error') return Promise.resolve();
    return updateWarehousePhotoQueueItem(item.id, {
      uploadStatus: 'pending',
      shouldResumeUpload: true,
      uploadStartedAt: null,
      errorMessage: null,
    });
  }));
};
