/**
 * Логика дашборда «Парк автовозов»: статус машины (в пути / на базе) по
 * фактическому графику работы. Статус определяется по последней «машинной»
 * отметке, двигаясь от сегодняшнего дня назад (в том числе в прошлые месяцы):
 *  - 1 или С  -> в пути;
 *  - П (погрузка), К (Кневичи), Р (ремонт), Н (нет водителя) -> на базе;
 *  - О/В/Б говорят только о водителе -> запоминаем как кандидата «на базе
 *    (отдых водителя)» и продолжаем искать машинную отметку глубже.
 */

export type FleetPerson = {
  id: string;
  name: string;
  secondName?: string;
  plate: string;
  department: string;
};

export type FleetSubstate = 'transit' | 'loading' | 'knevichi' | 'repair' | 'noDriver' | 'rest' | 'unknown';

export type FleetVehicleStatus = {
  plate: string;
  driver: string;
  hasDriver: boolean;
  substate: FleetSubstate;
  /** Русская буква решающего кода — для подписи «код · дата». */
  codeLabel: string;
  /** Дата решающей отметки (null, если отметок не нашли вовсе). */
  markDate: Date | null;
  staleDays: number | null;
  repairDays: number | null;
  planBadge: { label: string; date: Date } | null;
};

export type FleetSummary = {
  today: Date;
  total: number;
  transit: FleetVehicleStatus[];
  base: FleetVehicleStatus[];
  repairCount: number;
  noDriverCount: number;
  freeVehicles: FleetVehicleStatus[];
  freeReasons: string[];
};

export const FLEET_LOOKBACK_DAYS = 62;
export const FLEET_LOOKAHEAD_DAYS = 21;
export const FLEET_STALE_BADGE_DAYS = 4;
export const FLEET_STALE_DIM_DAYS = 7;
export const FLEET_LONG_REPAIR_DAYS = 14;

export const FLEET_REST_LABEL: Record<string, string> = { О: 'отпуск', Б: 'больничный', В: 'выходной' };

const SUBSTATE_ORDER: Record<FleetSubstate, number> = {
  transit: 0,
  loading: 1,
  knevichi: 2,
  rest: 3,
  unknown: 4,
  repair: 5,
  noDriver: 6,
};

const monthKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const normalizePlate = (plate: string): string => plate.trim().toUpperCase();

type DayKind = Exclude<FleetSubstate, 'unknown'> | null;

export const classifyFleetDayCodes = (codes: string[]): { kind: DayKind; codeLabel: string } => {
  if (codes.includes('W')) return { kind: 'transit', codeLabel: '1' };
  if (codes.includes('S')) return { kind: 'transit', codeLabel: 'С' };
  if (codes.includes('H')) return { kind: 'loading', codeLabel: 'П' };
  if (codes.includes('K')) return { kind: 'knevichi', codeLabel: 'К' };
  if (codes.includes('R')) return { kind: 'repair', codeLabel: 'Р' };
  if (codes.includes('N')) return { kind: 'noDriver', codeLabel: 'Н' };
  if (codes.includes('V')) return { kind: 'rest', codeLabel: 'О' };
  if (codes.includes('B')) return { kind: 'rest', codeLabel: 'Б' };
  if (codes.includes('O')) return { kind: 'rest', codeLabel: 'В' };
  return { kind: null, codeLabel: '' };
};

export function computeFleetSummary(
  peopleByMonth: Record<string, FleetPerson[]>,
  allOverrides: Record<string, Record<string, string>>,
  now: Date = new Date()
): FleetSummary | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMonthKey = monthKeyOf(today);

  const resolvePeople = (monthKey: string): FleetPerson[] => peopleByMonth[monthKey] ?? [];

  // Машины берём из графика текущего месяца (или прошлого, если текущий ещё не заведён).
  let basePeople = resolvePeople(todayMonthKey).filter((person) => person.department === 'Авто');
  if (!basePeople.length) {
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    basePeople = resolvePeople(monthKeyOf(prev)).filter((person) => person.department === 'Авто');
  }
  const vehicles: FleetPerson[] = [];
  const seenPlates = new Set<string>();
  basePeople.forEach((person) => {
    const plate = normalizePlate(person.plate);
    if (!plate || seenPlates.has(plate)) return;
    seenPlates.add(plate);
    vehicles.push(person);
  });
  if (!vehicles.length) return null;

  // Кэш: месяц -> госномер -> строки графика этого месяца.
  const rowsCache = new Map<string, Map<string, FleetPerson[]>>();
  const rowsForPlate = (monthKey: string, plate: string): FleetPerson[] => {
    let monthMap = rowsCache.get(monthKey);
    if (!monthMap) {
      const built = new Map<string, FleetPerson[]>();
      resolvePeople(monthKey).forEach((person) => {
        if (person.department !== 'Авто') return;
        const key = normalizePlate(person.plate);
        if (!key) return;
        const list = built.get(key) ?? [];
        list.push(person);
        built.set(key, list);
      });
      rowsCache.set(monthKey, built);
      monthMap = built;
    }
    return monthMap.get(plate) ?? [];
  };

  const codesForDay = (plate: string, date: Date): string[] => {
    const monthKey = monthKeyOf(date);
    const day = date.getDate();
    const factScope = allOverrides[`fact|${monthKey}`] ?? {};
    const codes: string[] = [];
    rowsForPlate(monthKey, plate).forEach((row) => {
      const lanes: Array<'1' | '2'> = row.secondName ? ['1', '2'] : ['1'];
      lanes.forEach((lane) => {
        const code = factScope[`${row.id}-${lane}-${day}`];
        if (code && code !== 'E') codes.push(code);
      });
    });
    return codes;
  };

  const dayDiff = (from: Date, to: Date): number =>
    Math.round((to.getTime() - from.getTime()) / 86_400_000);

  const statuses: FleetVehicleStatus[] = vehicles.map((vehicle) => {
    const plate = normalizePlate(vehicle.plate);
    const driver = vehicle.name.trim() || vehicle.secondName?.trim() || '';

    let substate: FleetSubstate = 'unknown';
    let codeLabel = '';
    let markDate: Date | null = null;
    let candidate: { codeLabel: string; date: Date } | null = null;

    for (let offset = 0; offset <= FLEET_LOOKBACK_DAYS; offset += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      const { kind, codeLabel: label } = classifyFleetDayCodes(codesForDay(plate, date));
      if (kind === null) continue;
      if (kind === 'rest') {
        if (!candidate) candidate = { codeLabel: label, date };
        continue;
      }
      substate = kind;
      codeLabel = label;
      markDate = date;
      break;
    }
    if (substate === 'unknown' && candidate) {
      substate = 'rest';
      codeLabel = candidate.codeLabel;
      markDate = candidate.date;
    }

    const staleDays = markDate ? dayDiff(markDate, today) : null;

    // Для ремонта считаем, сколько подряд дней машина стоит с «Р».
    let repairDays: number | null = null;
    if (substate === 'repair' && markDate) {
      repairDays = 1;
      for (let offset = 1; offset <= FLEET_LOOKBACK_DAYS; offset += 1) {
        const date = new Date(markDate.getFullYear(), markDate.getMonth(), markDate.getDate() - offset);
        const { kind } = classifyFleetDayCodes(codesForDay(plate, date));
        if (kind !== 'repair') break;
        repairDays += 1;
      }
    }

    // Для машин в пути смотрим план вперёд: отпуск/ремонт с даты N — сигнал расхождения.
    let planBadge: { label: string; date: Date } | null = null;
    if (substate === 'transit') {
      for (let offset = 1; offset <= FLEET_LOOKAHEAD_DAYS; offset += 1) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        const codes = codesForDay(plate, date);
        if (codes.includes('W') || codes.includes('S')) break;
        if (codes.includes('V')) {
          planBadge = { label: 'отпуск', date };
          break;
        }
        if (codes.includes('R')) {
          planBadge = { label: 'ремонт', date };
          break;
        }
      }
    }

    return {
      plate,
      driver,
      hasDriver: Boolean(driver) && substate !== 'noDriver',
      substate,
      codeLabel,
      markDate,
      staleDays,
      repairDays,
      planBadge,
    };
  });

  const transit = statuses.filter((status) => status.substate === 'transit');
  const base = statuses.filter((status) => status.substate !== 'transit');
  const repairCount = base.filter((status) => status.substate === 'repair').length;
  const noDriverCount = base.filter((status) => status.substate === 'noDriver' || !status.hasDriver).length;
  const freeVehicles = base.filter((status) => status.substate === 'knevichi' || status.substate === 'rest');
  const freeReasons: string[] = [];
  if (freeVehicles.some((status) => status.substate === 'knevichi')) freeReasons.push('Кневичи');
  if (freeVehicles.some((status) => status.substate === 'rest')) freeReasons.push('выходные');

  transit.sort((a, b) => (a.staleDays ?? 0) - (b.staleDays ?? 0) || a.plate.localeCompare(b.plate, 'ru'));
  base.sort(
    (a, b) => SUBSTATE_ORDER[a.substate] - SUBSTATE_ORDER[b.substate] || a.plate.localeCompare(b.plate, 'ru')
  );

  return {
    today,
    total: statuses.length,
    transit,
    base,
    repairCount,
    noDriverCount,
    freeVehicles,
    freeReasons,
  };
}
