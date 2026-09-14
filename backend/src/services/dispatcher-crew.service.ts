/**
 * Экипажи для реестра диспетчеров: пары «водитель — госномер» из графика
 * работы контейнеровозов КТК Владивосток на дату заявки.
 *
 * На одной машине может быть два водителя (строки name/secondName). Какой из
 * них на линии в этот день — видно по коду ячейки: сначала факт, затем план.
 */

type SchedulePerson = {
  id: string;
  name?: string;
  secondName?: string;
  plate?: string;
  department?: string;
};

type ScheduleState = {
  peopleByMonth?: Record<string, SchedulePerson[]>;
  overrides?: Record<string, Record<string, string>>;
};

export type DispatcherCrewEntry = {
  driverName: string;
  plate: string;
  /** водитель на линии в этот день (код «1» или «пол дня») */
  onLine: boolean;
};

const WORKING_CODES = new Set(['W', 'H']);

export function buildDispatcherCrew(state: ScheduleState | null | undefined, date: string): DispatcherCrewEntry[] {
  if (!state || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const monthKey = date.slice(0, 7);
  const day = Number(date.slice(8, 10));
  const people = (state.peopleByMonth?.[monthKey] ?? []).filter((person) => person.department === 'Контейнеры');
  const fact = state.overrides?.[`fact|${monthKey}`] ?? {};
  const plan = state.overrides?.[`plan|${monthKey}`] ?? {};
  const entries: DispatcherCrewEntry[] = [];
  people.forEach((person) => {
    const plate = (person.plate ?? '').trim();
    const lanes: Array<['1' | '2', string | undefined]> = [
      ['1', person.name],
      ['2', person.secondName],
    ];
    lanes.forEach(([lane, rawName]) => {
      const driverName = (rawName ?? '').trim();
      if (!driverName) return;
      const key = `${person.id}-${lane}-${day}`;
      const code = fact[key] ?? plan[key] ?? '';
      entries.push({ driverName, plate, onLine: WORKING_CODES.has(code) });
    });
  });
  return entries;
}
