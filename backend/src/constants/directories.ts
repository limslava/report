import type { FleetLocation } from '../models/fleet-vehicle.model';

/**
 * Модель доступа справочников и учёта топлива.
 *
 * Справочники (сотрудники с ПДн, техника, прицепы, модели), решение 2026-08-14:
 * - ПРОСМОТР и копирование: менеджер КТК своего региона + все ведущие роли;
 * - ВЕДЕНИЕ (создание/редактирование): руководитель КТК своего региона,
 *   отдел кадров (оба региона) и админ — менеджеры КТК ведение потеряли;
 * - УДАЛЕНИЕ (только из открытой карточки): админ (везде) и руководитель КТК
 *   своего региона — отделу кадров удаление не даётся.
 * Роли БДД доступа к ПДн сотрудников НЕ имеют — это осознанное решение.
 *
 * Учёт топлива ведут: админ, специалист по БДД и руководитель КТК своего региона.
 * Нормы расхода моделей и границы сезонов правят те же роли топлива.
 */

export const DIRECTORY_LOCATIONS: readonly FleetLocation[] = ['vvo', 'mow'] as const;

export const isValidLocation = (value: unknown): value is FleetLocation =>
  value === 'vvo' || value === 'mow';

/** Регионы, которые роль ВИДИТ в справочниках (сотрудники/техника/прицепы). */
export function directoryLocationsForRole(role: string | undefined): FleetLocation[] {
  if (role === 'admin' || role === 'head_hr' || role === 'hr_specialist') return ['vvo', 'mow'];
  if (role === 'head_ktk_vvo' || role === 'manager_ktk_vvo') return ['vvo'];
  if (role === 'head_ktk_mow' || role === 'manager_ktk_mow') return ['mow'];
  return [];
}

/** Может ли роль СОЗДАВАТЬ/РЕДАКТИРОВАТЬ записи справочников (менеджеры КТК — нет). */
export function canEditDirectories(role: string | undefined): boolean {
  return (
    role === 'admin' ||
    role === 'head_hr' ||
    role === 'hr_specialist' ||
    role === 'head_ktk_vvo' ||
    role === 'head_ktk_mow'
  );
}

/** Может ли роль УДАЛЯТЬ записи справочников в данном регионе. */
export function canDeleteDirectoryEntry(
  role: string | undefined,
  location: FleetLocation
): boolean {
  if (role === 'admin') return true;
  if (role === 'head_ktk_vvo') return location === 'vvo';
  if (role === 'head_ktk_mow') return location === 'mow';
  return false;
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

/** Ведение справочников (без менеджеров КТК — у них просмотр и копирование). */
export const DIRECTORY_EDIT_ROLES = [
  'admin',
  'head_ktk_vvo',
  'head_ktk_mow',
  'head_hr',
  'hr_specialist',
] as const;

/** Кандидаты на удаление (регион проверяется в контроллере по записи). */
export const DIRECTORY_DELETE_ROLES = ['admin', 'head_ktk_vvo', 'head_ktk_mow'] as const;

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
