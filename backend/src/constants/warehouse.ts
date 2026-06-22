export const WAREHOUSE_ACCESS_ROLES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'warehouse_manager',
  'warehouse_keeper',
] as const;

export type WarehouseAccessRole = typeof WAREHOUSE_ACCESS_ROLES[number];
