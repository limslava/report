export const WAREHOUSE_ACCESS_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'chief_accountant',
  'deputy_chief_accountant',
  'warehouse_manager_vvo',
  'warehouse_keeper',
  'counterparty_user',
] as const;

export const WAREHOUSE_STAFF_ROLES = [
  'admin',
  'warehouse_manager_vvo',
  'warehouse_keeper',
] as const;

/**
 * Данные, зафиксированные при приёмке и выдаче (карточка ТС, осмотры, даты,
 * удаление фото), меняет только администратор (решение 2026-09-14).
 * Складские роли пишут их только в момент самой приёмки / выдачи; добавлять
 * фото и услуги, пока ТС на стоянке, им по-прежнему можно.
 */
export const WAREHOUSE_RECORDED_DATA_ROLES = ['admin'] as const;

export const WAREHOUSE_DATE_CORRECTION_ROLES = WAREHOUSE_RECORDED_DATA_ROLES;

export const WAREHOUSE_CLIENT_MANAGEMENT_ROLES = [
  'admin',
  'warehouse_manager_vvo',
] as const;

export const WAREHOUSE_TARIFF_MANAGEMENT_ROLES = [
  'admin',
  'warehouse_manager_vvo',
  'financer',
] as const;

/** Индивидуальные тарифы клиентов склада заводят только админ и финансист (решение 2026-09-14). */
export const WAREHOUSE_CLIENT_TARIFF_MANAGEMENT_ROLES = [
  'admin',
  'financer',
] as const;

/** Просмотр клиентов, тарифов (в т.ч. индивидуальных) и начислений без права правки. */
export const WAREHOUSE_FINANCE_VIEW_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'chief_accountant',
  'deputy_chief_accountant',
  'warehouse_manager_vvo',
] as const;

export const WAREHOUSE_SERVICE_EXECUTION_ROLES = [
  'admin',
  'warehouse_manager_vvo',
  'warehouse_keeper',
  'financer',
] as const;

export const WAREHOUSE_BILLING_MANAGEMENT_ROLES = [
  'admin',
  'warehouse_manager_vvo',
  'financer',
] as const;

export const WAREHOUSE_BILLING_VIEW_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'chief_accountant',
  'deputy_chief_accountant',
  'warehouse_manager_vvo',
  'counterparty_user',
] as const;

export const WAREHOUSE_VEHICLE_TYPES = [
  'passenger',
  'light_commercial',
  'truck',
  'trailer',
  'special',
  'motorcycle',
] as const;

export type WarehouseVehicleTypeCode = typeof WAREHOUSE_VEHICLE_TYPES[number];

export const WAREHOUSE_VEHICLE_TYPE_LABELS: Record<WarehouseVehicleTypeCode, string> = {
  passenger: 'Легковой автомобиль',
  light_commercial: 'Легковой коммерческий автомобиль',
  truck: 'Грузовая техника',
  trailer: 'Прицеп / полуприцеп',
  special: 'Спецтехника',
  motorcycle: 'Мото-техника',
};

export type WarehouseAccessRole = typeof WAREHOUSE_ACCESS_ROLES[number];
