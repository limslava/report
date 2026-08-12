import { AppDataSource } from '../config/data-source';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { OperationsPreviewState } from '../models/operations-preview-state.model';

const vehicleRepo = AppDataSource.getRepository(FleetVehicle);
const previewRepo = AppDataSource.getRepository(OperationsPreviewState);

const SCHEDULE_SCOPE_BY_LOCATION: Record<FleetLocation, string> = {
  vvo: 'ktk_vvo_preview_v1',
  mow: 'ktk_mow_preview_v1',
};

const KIND_BY_DEPARTMENT: Record<string, string> = {
  'Контейнеры': 'контейнеровоз',
  'Авто': 'автовоз',
};

type PreviewPersonRow = {
  plate?: string;
  department?: string;
};

type PreviewPayload = {
  peopleByMonth?: Record<string, PreviewPersonRow[]>;
};

/** Тот же принцип, что resolvePeopleForMonth в графике: точный месяц, иначе предыдущий. */
const prevMonthValue = (monthValue: string): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const resolvePeople = (targetMonth: string, source: Record<string, PreviewPersonRow[]>): PreviewPersonRow[] => {
  if (Array.isArray(source[targetMonth]) && source[targetMonth].length > 0) return source[targetMonth];
  const prev = prevMonthValue(targetMonth);
  if (Array.isArray(source[prev]) && source[prev].length > 0) return source[prev];
  return [];
};

/**
 * Синхронизация техники из графика работы (контейнеровозы/автовозы региона):
 * госномера из строк графика автоматически появляются в справочнике техники
 * и, как следствие, в учёте топлива. Существующие записи не трогаются
 * (в т.ч. если машина числится в другом регионе — историю не переносим).
 */
export async function syncVehiclesFromSchedule(location: FleetLocation, monthValue: string): Promise<number> {
  const row = await previewRepo.findOne({ where: { scopeKey: SCHEDULE_SCOPE_BY_LOCATION[location] } });
  if (!row) return 0;
  const payload = (row.payload ?? {}) as PreviewPayload;
  const people = resolvePeople(monthValue, payload.peopleByMonth ?? {});
  if (people.length === 0) return 0;

  const plateKinds = new Map<string, string>();
  for (const person of people) {
    const department = person.department ?? '';
    if (!KIND_BY_DEPARTMENT[department]) continue;
    const plate = (person.plate ?? '').trim();
    if (!plate) continue;
    if (!plateKinds.has(plate.toLowerCase())) {
      plateKinds.set(plate.toLowerCase(), plate);
    }
  }
  if (plateKinds.size === 0) return 0;

  const existing = await vehicleRepo.find();
  const existingPlates = new Set(existing.map((vehicle) => vehicle.plate.toLowerCase()));

  let created = 0;
  for (const person of people) {
    const department = person.department ?? '';
    const kind = KIND_BY_DEPARTMENT[department];
    if (!kind) continue;
    const plate = (person.plate ?? '').trim();
    if (!plate || existingPlates.has(plate.toLowerCase())) continue;
    existingPlates.add(plate.toLowerCase());
    await vehicleRepo.save(vehicleRepo.create({ location, plate, vehicleKind: kind }));
    created += 1;
  }
  return created;
}
