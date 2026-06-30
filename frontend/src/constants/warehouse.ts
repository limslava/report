import { WarehouseVehicleType } from '../services/warehouse.api';

export const WAREHOUSE_VEHICLE_TYPES: WarehouseVehicleType[] = [
  'passenger',
  'light_commercial',
  'truck',
  'trailer',
  'special',
  'motorcycle',
];

export const WAREHOUSE_VEHICLE_TYPE_LABELS: Record<WarehouseVehicleType, string> = {
  passenger: 'Легковой автомобиль',
  light_commercial: 'Легковой коммерческий автомобиль',
  truck: 'Грузовая техника',
  trailer: 'Прицеп / полуприцеп',
  special: 'Спецтехника',
  motorcycle: 'Мото-техника',
};

export const warehouseVehicleTypeLabel = (vehicleType: WarehouseVehicleType): string =>
  WAREHOUSE_VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType;

export const WAREHOUSE_PHOTO_CHECKLIST_ITEMS = [
  ['front', 'Фото спереди'],
  ['frontLeft', 'Фото спереди слева'],
  ['frontRight', 'Фото спереди справа'],
  ['leftSide', 'Фото сбоку слева'],
  ['rightSide', 'Фото сбоку справа'],
  ['rearLeft', 'Фото сзади слева'],
  ['rearRight', 'Фото сзади справа'],
  ['rear', 'Фото сзади'],
  ['interiorWindshield', 'Фото салона и лобового стекла'],
  ['wheels', 'Фото всех колес'],
  ['dashboardOdometer', 'Фото приборной панели с пробегом'],
  ['defects', 'Фото всех дефектов'],
] as const;

export type WarehousePhotoChecklistItem = typeof WAREHOUSE_PHOTO_CHECKLIST_ITEMS[number][0];
