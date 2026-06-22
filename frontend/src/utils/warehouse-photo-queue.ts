const DB_NAME = 'report-warehouse-photo-queue';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';

export interface WarehousePhotoQueueItem {
  id?: number;
  vehicleId: string;
  name: string;
  blob: Blob;
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
