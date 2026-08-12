import api from './api';

export type FleetLocation = 'vvo' | 'mow';

export type VehicleModelItem = {
  id: string;
  brand: string;
  name: string;
  fuelNormWinter: string | null;
  fuelNormSummer: string | null;
  vehicleCount?: number;
};

export type FleetVehicleItem = {
  id: string;
  location: FleetLocation;
  plate: string;
  vehicleKind: string;
  modelId: string | null;
  model: VehicleModelItem | null;
  color: string;
  vin: string;
  status: 'active' | 'repair' | 'archived';
  note: string;
};

/** При сохранении техники модель передаётся текстом — бэкенд найдёт существующую или создаст новую. */
export type FleetVehiclePayload = Partial<FleetVehicleItem> & { modelLabel?: string };

export type TrailerItem = {
  id: string;
  location: FleetLocation;
  plate: string;
  status: 'active' | 'archived';
  note: string;
};

export type EmployeeItem = {
  id: string;
  location: FleetLocation;
  fullName: string;
  position: string;
  phone: string;
  status: 'active' | 'fired';
  birthDate: string | null;
  birthPlace: string;
  passportNumber: string;
  passportIssueDate: string | null;
  passportIssuedBy: string;
  registrationAddress: string;
  licenseNumber: string;
  licenseIssueDate: string | null;
  note: string;
};

export type EmployeePayload = Partial<Omit<EmployeeItem, 'id'>> & {
  location: FleetLocation;
  fullName: string;
};

// Модели и нормы
export const getVehicleModels = () => api.get<VehicleModelItem[]>('/directories/models');
export const createVehicleModel = (data: Partial<VehicleModelItem>) => api.post<VehicleModelItem>('/directories/models', data);
export const updateVehicleModel = (id: string, data: Partial<VehicleModelItem>) =>
  api.put<VehicleModelItem>(`/directories/models/${id}`, data);
export const deleteVehicleModel = (id: string) => api.delete(`/directories/models/${id}`);

// Техника
export const getFleetVehicles = (location: FleetLocation) =>
  api.get<FleetVehicleItem[]>('/directories/vehicles', { params: { location } });
export const createFleetVehicle = (data: FleetVehiclePayload) => api.post<FleetVehicleItem>('/directories/vehicles', data);
export const updateFleetVehicle = (id: string, data: FleetVehiclePayload) =>
  api.put<FleetVehicleItem>(`/directories/vehicles/${id}`, data);
export const deleteFleetVehicle = (id: string) => api.delete(`/directories/vehicles/${id}`);

// Прицепы
export const getTrailers = (location: FleetLocation) =>
  api.get<TrailerItem[]>('/directories/trailers', { params: { location } });
export const createTrailer = (data: Partial<TrailerItem>) => api.post<TrailerItem>('/directories/trailers', data);
export const updateTrailer = (id: string, data: Partial<TrailerItem>) => api.put<TrailerItem>(`/directories/trailers/${id}`, data);
export const deleteTrailer = (id: string) => api.delete(`/directories/trailers/${id}`);

// Сотрудники (ПДн)
export const getEmployees = (location: FleetLocation) =>
  api.get<EmployeeItem[]>('/directories/employees', { params: { location } });
export const createEmployee = (data: EmployeePayload) => api.post<EmployeeItem>('/directories/employees', data);
export const updateEmployee = (id: string, data: EmployeePayload) => api.put<EmployeeItem>(`/directories/employees/${id}`, data);
export const deleteEmployee = (id: string) => api.delete(`/directories/employees/${id}`);
export const getEmployeeCardText = (id: string) => api.get<{ text: string }>(`/directories/employees/${id}/card-text`);
export const findEmployeeCardByName = (location: FleetLocation, fullName: string) =>
  api.get<{ employeeId: string; text: string }>('/directories/employees/card-by-name', { params: { location, fullName } });

/** Одноразовое наполнение справочников из графиков (только админ, идемпотентно). */
export const bootstrapDirectories = () =>
  api.post<{ createdEmployees: number; createdVehicles: number }>('/directories/bootstrap-from-schedules');

// Подсказки для диалогов графиков (без ПДн)
export type DirectoryOptions = {
  employees: Array<{ fullName: string; position: string }>;
  vehicles: string[];
  trailers: string[];
};
export const getDirectoryOptions = (location: FleetLocation) =>
  api.get<DirectoryOptions>('/directories/options', { params: { location } });

// Топливо
export type FuelRow = {
  vehicleId: string;
  plate: string;
  vehicleKind: string;
  modelLabel: string;
  status: string;
  odometer: number | null;
  fuelEnd: number | null;
  fuelFilled: number | null;
  mileageManual: number | null;
  fuelStartManual: number | null;
  prevOdometer: number | null;
  prevFuelEnd: number | null;
  mileage: number | null;
  fuelStart: number | null;
  consumption: number | null;
  per100: number | null;
  norm: number | null;
  deviationPct: number | null;
  hasBaseline: boolean;
};

export type FuelState = {
  location: FleetLocation;
  monthValue: string;
  isWinter: boolean;
  filledCount: number;
  totalCount: number;
  rows: FuelRow[];
};

export type FuelRowPayload = {
  vehicleId: string;
  odometer: number | null;
  fuelEnd: number | null;
  fuelFilled: number | null;
  mileageManual: number | null;
  fuelStartManual: number | null;
};

export const getFuelState = (location: FleetLocation, month: string) =>
  api.get<FuelState>('/fuel/state', { params: { location, month } });
export const saveFuelState = (location: FleetLocation, monthValue: string, rows: FuelRowPayload[]) =>
  api.put<FuelState>('/fuel/state', { location, monthValue, rows });
export const setFuelBaseline = (data: {
  location: FleetLocation;
  monthValue: string;
  vehicleId: string;
  startOdometer: number | null;
  startFuelLevel: number | null;
}) => api.post('/fuel/baseline', data);
export const addFuelRows = (location: FleetLocation, monthValue: string, vehicleIds: string[]) =>
  api.post<FuelState>('/fuel/rows', { location, monthValue, vehicleIds });
export const removeFuelRow = (location: FleetLocation, monthValue: string, vehicleId: string) =>
  api.post<FuelState>('/fuel/rows/remove', { location, monthValue, vehicleId });
export const copyFuelRowsFromPrevMonth = (location: FleetLocation, monthValue: string) =>
  api.post<FuelState & { added: number }>('/fuel/rows/copy-prev', { location, monthValue });
export const getFuelSeasons = () => api.get<{ winterStartMonth: number; winterEndMonth: number }>('/fuel/seasons');
export const saveFuelSeasons = (data: { winterStartMonth: number; winterEndMonth: number }) => api.put('/fuel/seasons', data);
export const downloadFuelExcel = (location: FleetLocation, month: string) =>
  api.get('/fuel/export', { params: { location, month }, responseType: 'blob' });
export const downloadFuelYearExcel = (location: FleetLocation, year: number) =>
  api.get('/fuel/export-year', { params: { location, year }, responseType: 'blob' });
