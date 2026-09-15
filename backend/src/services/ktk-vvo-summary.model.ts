/**
 * Excel «Вариант 2» ежедневного отчёта «Контейнерные перевозки — Владивосток»:
 * сводная по месяцам, лист на каждый месяц по дням и машины на отчётную дату.
 * Здесь — чистый расчёт без базы и Excel (данные собирает ktk-vvo-summary-export.service).
 *
 * Откуда что берётся:
 * - план, собственные ТС, частники — ежедневный отчёт системы с SYSTEM_FROM, раньше — история
 *   из google-таблицы отдела (assets/planning/ktk-vvo-history.json);
 * - ТС на линии — из графика контейнеровозов с ON_LINE_FROM_SCHEDULE (как в ежедневном
 *   отчёте), между SYSTEM_FROM и ним — введённые вручную значения, раньше — история;
 * - ТС в парке — машины контейнеровозов в графике месяца, если графика нет — история;
 * - план на месяц — базовый план («План на месяц», без переноса), если он пуст — история.
 */

export type KtkVvoHistory = {
  days: Array<{ date: string; fleet?: number; onLine?: number; plan?: number; own?: number; hired?: number }>;
  months: Array<{ month: string; basePlan: number }>;
};

export type SchedulePerson = { id: string; name?: string; plate?: string; secondName?: string; department: string };

export type SystemDayValues = { plan?: number | null; own?: number | null; hired?: number | null; onLine?: number | null };

export type KtkVvoSummaryInput = {
  /** отчётная дата YYYY-MM-DD: последний месяц выгрузки и дата листа «ТС» */
  asOfDate: string;
  history: KtkVvoHistory;
  /** YYYY-MM, с которого план и факт берутся из системы */
  systemFrom: string;
  /** YYYY-MM, с которого «ТС на линии» считается по графику */
  onLineFromSchedule: string;
  /** значения ежедневного отчёта по датам YYYY-MM-DD */
  systemValues: Map<string, SystemDayValues>;
  /** базовый план на месяц YYYY-MM */
  basePlans: Map<string, number>;
  /** график контейнеровозов: люди по месяцам и отметки факта «fact|YYYY-MM» */
  peopleByMonth: Record<string, SchedulePerson[]>;
  factOverrides: Record<string, Record<string, string>>;
};

export type SummaryDay = {
  date: string;
  fleet: number | null;
  onLine: number | null;
  plan: number | null;
  own: number | null;
  hired: number | null;
};

export type SummaryMonth = {
  month: string;
  days: SummaryDay[];
  fleetAvg: number | null;
  onLineAvg: number | null;
  loadFactor: number | null;
  basePlan: number | null;
  planSum: number;
  ownSum: number;
  hiredSum: number;
  factSum: number;
};

export type VehicleStatus = { plate: string; status: string; onLine: 0 | 1 };

export type KtkVvoSummary = { asOfDate: string; months: SummaryMonth[]; vehicles: VehicleStatus[] };

export const KTK_VVO_SUMMARY_SYSTEM_FROM = '2026-02';
export const KTK_VVO_ON_LINE_FROM_SCHEDULE = '2026-05';

const CONTAINERS = 'Контейнеры';

const pad2 = (value: number): string => String(value).padStart(2, '0');
const monthOf = (date: string): string => date.slice(0, 7);
const daysInMonth = (month: string): number => {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
};
const nextMonth = (month: string): string => {
  const [year, monthNo] = month.split('-').map(Number);
  return monthNo === 12 ? `${year + 1}-01` : `${year}-${pad2(monthNo + 1)}`;
};
const prevMonth = (month: string): string => {
  const [year, monthNo] = month.split('-').map(Number);
  return monthNo === 1 ? `${year - 1}-12` : `${year}-${pad2(monthNo - 1)}`;
};

/** Люди графика на месяц; если месяц ещё не заведён — список прошлого месяца (как в ежедневном отчёте). */
export function schedulePeopleForMonth(peopleByMonth: Record<string, SchedulePerson[]>, month: string): SchedulePerson[] {
  const own = peopleByMonth[month];
  if (Array.isArray(own) && own.length) return own.filter((person) => person.department === CONTAINERS);
  const previous = peopleByMonth[prevMonth(month)];
  if (Array.isArray(previous) && previous.length) return previous.filter((person) => person.department === CONTAINERS);
  return [];
}

/** Отметки дня у человека графика (обе смены). */
const dayCodes = (person: SchedulePerson, factScope: Record<string, string>, day: number): string[] => {
  const codes = [factScope[`${person.id}-1-${day}`] ?? 'E'];
  if (person.secondName) codes.push(factScope[`${person.id}-2-${day}`] ?? 'E');
  return codes;
};

/** «ТС на линии» за день по графику — те же правила, что в ежедневном отчёте: «1» или «П» хотя бы в одной смене. */
export function countTrucksOnLine(people: SchedulePerson[], factScope: Record<string, string>, day: number): number {
  return people.filter((person) => dayCodes(person, factScope, day).some((code) => code === 'W' || code === 'H')).length;
}

/** Статус машины на день для листа «ТС»: самая «рабочая» отметка среди её людей и смен. */
const STATUS_BY_PRIORITY: Array<[string[], string]> = [
  [['W', 'H', 'S'], 'на линии'],
  [['R'], 'ремонт'],
  [['N'], 'нет водителя'],
  [['B'], 'больничный'],
  [['V'], 'отпуск'],
  [['O'], 'выходной'],
];

/** В графике машину без водителя заводят строкой с именем «нет водителя» (или без имени) и без отметок. */
const hasNoDriver = (people: SchedulePerson[]): boolean =>
  people.every((person) => !(person.name ?? '').trim() || /нет\s+водител/i.test(person.name ?? ''));

export function vehicleStatuses(people: SchedulePerson[], factScope: Record<string, string>, day: number): VehicleStatus[] {
  const byPlate = new Map<string, { codes: string[]; people: SchedulePerson[] }>();
  people.forEach((person) => {
    const plate = (person.plate ?? '').trim();
    if (!plate) return;
    const entry = byPlate.get(plate) ?? { codes: [], people: [] };
    entry.codes.push(...dayCodes(person, factScope, day));
    entry.people.push(person);
    byPlate.set(plate, entry);
  });
  return [...byPlate.entries()]
    .map(([plate, entry]) => {
      let status = STATUS_BY_PRIORITY.find(([variants]) => entry.codes.some((code) => variants.includes(code)))?.[1] ?? '';
      if (!status && hasNoDriver(entry.people)) status = 'нет водителя';
      return { plate, status, onLine: (status === 'на линии' ? 1 : 0) as 0 | 1 };
    })
    // по статусу (как в таблице отдела), машины без отметки — в конце
    .sort((a, b) => (!a.status ? 1 : 0) - (!b.status ? 1 : 0)
      || a.status.localeCompare(b.status, 'ru')
      || a.plate.localeCompare(b.plate, 'ru'));
}

const average = (values: Array<number | null>): number | null => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
};
const sum = (values: Array<number | null>): number => values.reduce<number>((total, value) => total + (value ?? 0), 0);
const orNull = (value: number | null | undefined): number | null => (value === undefined || value === null || Number.isNaN(value) ? null : value);

export function buildKtkVvoSummary(input: KtkVvoSummaryInput): KtkVvoSummary {
  const lastMonth = monthOf(input.asOfDate);
  const historyByDate = new Map(input.history.days.map((day) => [day.date, day]));
  const historyPlanByMonth = new Map(input.history.months.map((item) => [item.month, item.basePlan]));
  const firstHistoryMonth = input.history.days.length ? monthOf(input.history.days[0].date) : lastMonth;
  const firstMonth = firstHistoryMonth < input.systemFrom ? firstHistoryMonth : input.systemFrom;

  const months: SummaryMonth[] = [];
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    const fromSystem = month >= input.systemFrom;
    const onLineFromSchedule = month >= input.onLineFromSchedule;
    const people = schedulePeopleForMonth(input.peopleByMonth, month);
    const plates = new Set(people.map((person) => (person.plate ?? '').trim()).filter(Boolean));
    const factScope = input.factOverrides[`fact|${month}`] ?? {};
    const days: SummaryDay[] = [];
    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const date = `${month}-${pad2(day)}`;
      const past = date <= input.asOfDate;
      const history = historyByDate.get(date);
      const system = input.systemValues.get(date);
      let onLine: number | null = null;
      if (past) {
        if (onLineFromSchedule) onLine = people.length ? countTrucksOnLine(people, factScope, day) : null;
        else if (fromSystem) onLine = orNull(system?.onLine);
        else onLine = orNull(history?.onLine);
      }
      days.push({
        date,
        fleet: plates.size ? plates.size : orNull(history?.fleet),
        onLine,
        plan: fromSystem ? orNull(system?.plan) : orNull(history?.plan),
        own: past ? (fromSystem ? orNull(system?.own) : orNull(history?.own)) : null,
        hired: past ? (fromSystem ? orNull(system?.hired) : orNull(history?.hired)) : null,
      });
    }
    const counted = days.filter((day) => day.date <= input.asOfDate);
    const fleetAvg = average(counted.map((day) => day.fleet));
    const onLineAvg = average(counted.map((day) => day.onLine));
    const systemPlan = input.basePlans.get(month);
    const ownSum = sum(days.map((day) => day.own));
    const hiredSum = sum(days.map((day) => day.hired));
    months.push({
      month,
      days,
      fleetAvg,
      onLineAvg,
      loadFactor: fleetAvg && onLineAvg !== null ? onLineAvg / fleetAvg : null,
      basePlan: systemPlan && systemPlan > 0 ? systemPlan : orNull(historyPlanByMonth.get(month)),
      planSum: sum(days.map((day) => day.plan)),
      ownSum,
      hiredSum,
      factSum: ownSum + hiredSum,
    });
  }

  const asOfPeople = schedulePeopleForMonth(input.peopleByMonth, lastMonth);
  const vehicles = vehicleStatuses(asOfPeople, input.factOverrides[`fact|${lastMonth}`] ?? {}, Number(input.asOfDate.slice(8, 10)));
  return { asOfDate: input.asOfDate, months, vehicles };
}
