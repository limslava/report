export const WAREHOUSE_ACCESS_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'warehouse_manager',
  'warehouse_keeper',
  'counterparty_user',
] as const;

export const WAREHOUSE_STAFF_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'warehouse_manager',
  'warehouse_keeper',
] as const;

export const WAREHOUSE_CLIENT_MANAGEMENT_ROLES = [
  'admin',
  'warehouse_manager',
] as const;

export type WarehouseAccessRole = typeof WAREHOUSE_ACCESS_ROLES[number];
