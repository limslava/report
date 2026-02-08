export const ROLE_VALUES = [
  'admin',
  'director',
  'financer',
  'sales',
  'manager_sales',
  'manager_ktk_vvo',
  'manager_ktk_mow',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
  'container_vladivostok',
  'container_moscow',
  'railway',
  'autotruck',
  'additional',
  'to_auto',
] as const;

export type RoleValue = typeof ROLE_VALUES[number];
