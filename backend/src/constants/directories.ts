import type { FleetLocation } from '../models/fleet-vehicle.model';

/**
 * Модель доступа справочников и учёта топлива.
 *
 * Справочники (сотрудники с ПДн, техника, прицепы) ведут: руководитель и менеджер
 * КТК своего региона, отдел кадров (оба региона) и админ. Роли БДД доступа к ПДн
 * сотрудников НЕ имеют — это осознанное решение.
 *
 * Учёт топлива ведут: админ, специалист по БДД и руководитель КТК своего региона.
 * Нормы расхода моделей и границы сезонов правят те же роли топлива.
 */

export const DIRECTORY_LOCATIONS: readonly FleetLocation[] = ['vvo', 'mow'] as const;

export const isValidLocation = (value: unknown): value is FleetLocation =>
  value === 'vvo' || value === 'mow';

/** Регионы, в которых роль может вести справочники (сотрудники/техника/прицепы). */
export function directoryLocationsForRole(role: string | undefined): FleetLocation[] {
  if (role === 'admin' || role === 'head_hr' || role === 'hr_specialist') return ['vvo', 'mow'];
  if (role === 'head_ktk_vvo' || role === 'manager_ktk_vvo') return ['vvo'];
  if (role === 'head_ktk_mow' || role === 'manager_ktk_mow') return ['mow'];
  return [];
}

/** Регионы, в которых роль ведёт учёт топлива. */
export function fuelLocationsForRole(role: string | undefined): FleetLocation[] {
  if (role === 'admin') return ['vvo', 'mow'];
  if (role === 'bdd_specialist_vvo' || role === 'head_ktk_vvo') return ['vvo'];
  if (role === 'bdd_specialist_mow' || role === 'head_ktk_mow') return ['mow'];
  return [];
}

/** Нормы моделей и сезоны: БДД + руководители КТК + админ. */
export function canManageFuelNorms(role: string | undefined): boolean {
  return (
    role === 'admin' ||
    role === 'bdd_specialist_vvo' ||
    role === 'bdd_specialist_mow' ||
    role === 'head_ktk_vvo' ||
    role === 'head_ktk_mow'
  );
}

export const DIRECTORY_ROLES = [
  'admin',
  'head_ktk_vvo',
  'manager_ktk_vvo',
  'head_ktk_mow',
  'manager_ktk_mow',
  'head_hr',
  'hr_specialist',
] as const;

export const FUEL_ROLES = [
  'admin',
  'bdd_specialist_vvo',
  'bdd_specialist_mow',
  'head_ktk_vvo',
  'head_ktk_mow',
] as const;

/** Просмотр техники/моделей нужен и справочным ролям, и ролям топлива. */
export const FLEET_VIEW_ROLES = [...new Set([...DIRECTORY_ROLES, ...FUEL_ROLES])];

const FUEL_SEASONS_SETTING_KEY = 'fuel_seasons';

export type FuelSeasons = {
  /** Месяц начала зимнего периода (1–12), по умолчанию ноябрь. */
  winterStartMonth: number;
  /** Месяц конца зимнего периода (1–12), по умолчанию март. */
  winterEndMonth: number;
};

export const DEFAULT_FUEL_SEASONS: FuelSeasons = { winterStartMonth: 11, winterEndMonth: 3 };

export { FUEL_SEASONS_SETTING_KEY };

export function isWinterMonth(month: number, seasons: FuelSeasons): boolean {
  const { winterStartMonth: from, winterEndMonth: to } = seasons;
  if (from <= to) return month >= from && month <= to;
  return month >= from || month <= to;
}
