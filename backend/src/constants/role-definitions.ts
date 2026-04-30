export const ROLE_VALUES = [
  'admin',
  'director',
  'financer',
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
] as const;

export type RoleValue = typeof ROLE_VALUES[number];
