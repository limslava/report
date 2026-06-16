export const ROLE_VALUES = [
  'admin',
  'director',
  'financer',
  'security',
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'head_ktk_mow',
  'head_hr',
  'hr_specialist',
  'garage_head_vvo',
  'garage_head',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
] as const;

export type RoleValue = typeof ROLE_VALUES[number];
