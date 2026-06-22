import api from './api';

export type WarehouseVehicleType = 'passenger' | 'truck';
export type WarehouseVehicleStatus = 'expected' | 'on_site' | 'issued';

export interface WarehouseCounterparty {
  id: string;
  inn: string;
  nameFull: string;
  nameShort: string | null;
}

export interface WarehouseVehicle {
  id: string;
  warehouseNumber: string;
  counterpartyId: string;
  counterparty: WarehouseCounterparty;
  storageRequestId: string | null;
  requestNumber: string | null;
  requestDate: string | null;
  vehicleType: WarehouseVehicleType;
  vin: string | null;
  chassisNumber: string | null;
  brand: string;
  model: string;
  registrationNumber: string | null;
  receivedDate: string;
  issuedDate: string | null;
  fuelLevelPercent: number | null;
  status: WarehouseVehicleStatus;
  notes: string | null;
  storageDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseVehiclePayload {
  counterpartyId: string;
  requestNumber?: string | null;
  requestDate?: string | null;
  vehicleType: WarehouseVehicleType;
  vin?: string | null;
  chassisNumber?: string | null;
  brand: string;
  model: string;
  registrationNumber?: string | null;
  receivedDate: string;
  fuelLevelPercent?: number | null;
  notes?: string | null;
}

export interface WarehousePhoto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
}

export interface WarehouseVehicleFilters {
  q?: string;
  status?: WarehouseVehicleStatus | '';
  vehicleType?: WarehouseVehicleType | '';
  counterpartyId?: string;
}

export const getWarehouseVehicles = (filters: WarehouseVehicleFilters = {}) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  );
  return api.get<WarehouseVehicle[]>('/warehouse/vehicles', { params });
};

export const createWarehouseVehicle = (payload: WarehouseVehiclePayload) =>
  api.post<WarehouseVehicle>('/warehouse/vehicles', payload);

export const updateWarehouseVehicle = (
  id: string,
  payload: Partial<Omit<WarehouseVehiclePayload, 'counterpartyId' | 'requestNumber' | 'requestDate'>>,
) => api.patch<WarehouseVehicle>(`/warehouse/vehicles/${id}`, payload);

export const issueWarehouseVehicle = (id: string, issuedDate: string) =>
  api.post<WarehouseVehicle>(`/warehouse/vehicles/${id}/issue`, { issuedDate });

export const getWarehouseVehiclePhotos = (vehicleId: string) =>
  api.get<WarehousePhoto[]>(`/warehouse/vehicles/${vehicleId}/photos`);

export const uploadWarehouseVehiclePhoto = (
  vehicleId: string,
  file: Blob,
  originalName: string,
) => api.post<WarehousePhoto>(`/warehouse/vehicles/${vehicleId}/photos`, file, {
  headers: {
    'Content-Type': file.type || 'image/jpeg',
    'X-File-Name': encodeURIComponent(originalName),
  },
  timeout: 60_000,
});

export const downloadWarehouseVehiclePhoto = (vehicleId: string, photoId: string) =>
  api.get<Blob>(`/warehouse/vehicles/${vehicleId}/photos/${photoId}`, {
    responseType: 'blob',
    timeout: 60_000,
  });

export const deleteWarehouseVehiclePhoto = (vehicleId: string, photoId: string) =>
  api.delete(`/warehouse/vehicles/${vehicleId}/photos/${photoId}`);

export const getWarehouseCounterparties = (q = '') =>
  api.get<WarehouseCounterparty[]>('/warehouse/counterparties', { params: { q, limit: 50 } });

export const importWarehouseCounterparty = (inn: string) =>
  api.post<WarehouseCounterparty>('/warehouse/counterparties/import', { inn });
