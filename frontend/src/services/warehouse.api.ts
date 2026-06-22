import api from './api';

export type WarehouseVehicleType = 'passenger' | 'truck';
export type WarehouseVehicleStatus = 'expected' | 'on_site' | 'issued';
export type WarehouseServiceUnit = 'operation' | 'liter' | 'day';

export interface WarehouseCounterparty {
  id: string;
  inn: string;
  nameFull: string;
  nameShort: string | null;
}

export interface WarehouseClient {
  id: string;
  counterpartyId: string;
  inn: string;
  nameFull: string;
  nameShort: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  serviceStartDate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseClientPayload {
  inn: string;
  nameFull: string;
  nameShort?: string | null;
  contractNumber?: string | null;
  contractDate?: string | null;
  serviceStartDate?: string | null;
  isActive?: boolean;
  notes?: string | null;
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
  receivedAt: string;
  issuedDate: string | null;
  issuedAt: string | null;
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
  receivedDate?: string;
  fuelLevelPercent?: number | null;
  notes?: string | null;
}

export interface WarehouseTariff {
  id: string;
  vehicleType: WarehouseVehicleType;
  price: number;
  validFrom: string;
  validTo: string | null;
}

export interface WarehouseServiceDefinition {
  id: string;
  code: string;
  name: string;
  unit: WarehouseServiceUnit;
  defaultQuantity: number | null;
  isRepeatable: boolean;
  isOperational: boolean;
  isActive: boolean;
  currentTariffs: {
    passenger: WarehouseTariff | null;
    truck: WarehouseTariff | null;
  };
}

export interface WarehousePerformedService {
  id: string;
  vehicleId: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  performedAt: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  unit: WarehouseServiceUnit;
  performedByName: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseBillingServiceLine {
  id: string;
  name: string;
  performedAt: string;
  quantity: number;
  unit: WarehouseServiceUnit;
  unitPrice: number;
  amount: number;
  performedByName: string;
  comment: string | null;
}

export interface WarehouseBillingVehicleLine {
  vehicleId: string;
  warehouseNumber: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyInn: string;
  vehicleType: WarehouseVehicleType;
  vehicleName: string;
  vin: string | null;
  registrationNumber: string | null;
  storageFrom: string;
  storageTo: string;
  storageDays: number;
  storageAmount: number;
  storageRates: Array<{ price: number; days: number; amount: number }>;
  services: WarehouseBillingServiceLine[];
  servicesAmount: number;
  totalAmount: number;
}

export interface WarehouseBillingReport {
  periodFrom: string;
  periodTo: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  status: 'preview' | 'closed';
  closedPeriodId: string | null;
  closedAt: string | null;
  lines: WarehouseBillingVehicleLine[];
  totals: {
    vehicleCount: number;
    storageDays: number;
    storageAmount: number;
    servicesAmount: number;
    totalAmount: number;
  };
  warnings: string[];
}

export interface WarehousePhoto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  phase: 'reception' | 'issue';
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

export const correctWarehouseVehicleDates = (
  id: string,
  payload: { receivedAt: string; issuedAt?: string | null; reason: string },
) => api.patch<WarehouseVehicle>(`/warehouse/vehicles/${id}/operation-times`, payload);

export const issueWarehouseVehicle = (
  id: string,
  issuePhotoIds: string[],
  issuedDate?: string,
) => api.post<WarehouseVehicle>(`/warehouse/vehicles/${id}/issue`, {
  issuePhotoIds,
  ...(issuedDate ? { issuedDate } : {}),
});

export const getWarehouseVehiclePhotos = (vehicleId: string) =>
  api.get<WarehousePhoto[]>(`/warehouse/vehicles/${vehicleId}/photos`);

export const uploadWarehouseVehiclePhoto = (
  vehicleId: string,
  file: Blob,
  originalName: string,
  phase: 'reception' | 'issue' = 'reception',
) => api.post<WarehousePhoto>(`/warehouse/vehicles/${vehicleId}/photos`, file, {
  headers: {
    'Content-Type': file.type || 'image/jpeg',
    'X-File-Name': encodeURIComponent(originalName),
    'X-Photo-Phase': phase,
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

export const getWarehouseClients = (includeInactive = false, q = '') =>
  api.get<WarehouseClient[]>('/warehouse/clients', {
    params: { includeInactive, q: q || undefined },
  });

export const getAvailableWarehouseCounterparties = (q = '') =>
  api.get<WarehouseCounterparty[]>('/warehouse/clients/available-counterparties', {
    params: { q: q || undefined },
  });

export const createWarehouseClient = (payload: WarehouseClientPayload) =>
  api.post<WarehouseClient>('/warehouse/clients', payload);

export const updateWarehouseClient = (
  clientId: string,
  payload: Partial<Omit<WarehouseClientPayload, 'inn' | 'nameFull' | 'nameShort'>>,
) => api.patch<WarehouseClient>(`/warehouse/clients/${clientId}`, payload);

export const getWarehouseServices = (onDate?: string) =>
  api.get<WarehouseServiceDefinition[]>('/warehouse/services', {
    params: { onDate: onDate || undefined },
  });

export const updateWarehouseService = (
  serviceId: string,
  payload: { defaultQuantity?: number | null; isActive?: boolean },
) => api.patch(`/warehouse/services/${serviceId}`, payload);

export const createWarehouseTariff = (
  serviceId: string,
  payload: { vehicleType: WarehouseVehicleType; price: number; validFrom: string },
) => api.post<WarehouseTariff>(`/warehouse/services/${serviceId}/tariffs`, payload);

export const getWarehousePerformedServices = (vehicleId: string) =>
  api.get<WarehousePerformedService[]>(`/warehouse/vehicles/${vehicleId}/services`);

export const performWarehouseService = (
  vehicleId: string,
  payload: { serviceId: string; performedAt: string; quantity?: number; comment?: string | null },
) => api.post<WarehousePerformedService>(`/warehouse/vehicles/${vehicleId}/services`, payload);

export const correctWarehousePerformedService = (
  vehicleId: string,
  performedServiceId: string,
  payload: { quantity?: number; comment?: string | null },
) => api.patch<WarehousePerformedService>(
  `/warehouse/vehicles/${vehicleId}/services/${performedServiceId}`,
  payload,
);

export interface WarehouseBillingFilters {
  periodFrom: string;
  periodTo: string;
  counterpartyId?: string;
  vehicleType?: WarehouseVehicleType | '';
}

export const getWarehouseBilling = (filters: WarehouseBillingFilters) =>
  api.get<WarehouseBillingReport>('/warehouse/billing', { params: filters });

export const closeWarehouseBilling = (payload: {
  periodFrom: string;
  periodTo: string;
  counterpartyId: string;
}) => api.post<WarehouseBillingReport>('/warehouse/billing/close', payload);

export const exportWarehouseBilling = (
  format: 'xlsx' | 'pdf',
  filters: WarehouseBillingFilters,
) => api.get<Blob>(`/warehouse/billing/export.${format}`, {
  params: filters,
  responseType: 'blob',
  timeout: 60_000,
});
