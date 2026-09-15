import { buildKtkVvoSummary, countTrucksOnLine, vehicleStatuses, type KtkVvoSummaryInput } from './ktk-vvo-summary.model';

const baseInput = (overrides: Partial<KtkVvoSummaryInput> = {}): KtkVvoSummaryInput => ({
  asOfDate: '2026-05-02',
  history: {
    days: [
      { date: '2026-01-01', fleet: 17, onLine: 9, plan: 20, own: 25, hired: 1 },
      { date: '2026-01-02', fleet: 17, onLine: 11, plan: 30, own: 27, hired: 3 },
      { date: '2026-02-01', fleet: 17, onLine: 99, plan: 99, own: 99, hired: 99 },
    ],
    months: [{ month: '2026-01', basePlan: 800 }, { month: '2026-02', basePlan: 850 }],
  },
  systemFrom: '2026-02',
  onLineFromSchedule: '2026-05',
  systemValues: new Map([
    ['2026-02-01', { plan: 11, own: 31, hired: 2, onLine: 10 }],
    ['2026-05-01', { plan: 16, own: 31, hired: 0, onLine: 77 }],
  ]),
  basePlans: new Map([['2026-02', 1206], ['2026-05', 0]]),
  peopleByMonth: {
    '2026-05': [
      { id: 'a', plate: 'М590ХР 125', department: 'Контейнеры' },
      { id: 'b', plate: 'Н095СВ 125', department: 'Контейнеры', secondName: 'сменщик' },
      { id: 'c', plate: 'А001АА 125', department: 'Авто' },
    ],
  },
  factOverrides: { 'fact|2026-05': { 'a-1-1': 'W', 'b-1-1': 'O', 'b-2-1': 'H', 'a-1-2': 'B', 'b-1-2': 'V' } },
  ...overrides,
});

describe('Excel «Вариант 2» контейнерных перевозок Владивосток', () => {
  it('до данных системы берёт историю, с systemFrom — ежедневный отчёт, план месяца — базовый', () => {
    const summary = buildKtkVvoSummary(baseInput());
    const january = summary.months.find((item) => item.month === '2026-01')!;
    const february = summary.months.find((item) => item.month === '2026-02')!;
    expect(january.days[0]).toMatchObject({ fleet: 17, onLine: 9, plan: 20, own: 25, hired: 1 });
    expect(january).toMatchObject({ planSum: 50, ownSum: 52, hiredSum: 4, factSum: 56, basePlan: 800, fleetAvg: 17, onLineAvg: 10 });
    expect(february.days[0]).toMatchObject({ fleet: 17, onLine: 10, plan: 11, own: 31, hired: 2 });
    expect(february.basePlan).toBe(1206);
  });

  it('с графика: ТС в парке — машины контейнеровозов, на линии — «1» или «П»; будущие дни пустые', () => {
    const may = buildKtkVvoSummary(baseInput()).months.find((item) => item.month === '2026-05')!;
    expect(may.days[0]).toMatchObject({ fleet: 2, onLine: 2, plan: 16, own: 31, hired: 0 });
    expect(may.days[1]).toMatchObject({ onLine: 0 });
    expect(may.days[2]).toMatchObject({ onLine: null, own: null, hired: null });
    expect(may.basePlan).toBeNull();
    expect(may.loadFactor).toBeCloseTo(0.5);
  });

  it('лист «ТС»: статус машины по отметкам дня, одна строка на гос. номер', () => {
    const people = baseInput().peopleByMonth['2026-05'];
    const scope = baseInput().factOverrides['fact|2026-05'];
    expect(countTrucksOnLine(people, scope, 1)).toBe(2);
    expect(vehicleStatuses(people.filter((person) => person.department === 'Контейнеры'), scope, 2)).toEqual([
      { plate: 'М590ХР 125', status: 'больничный', onLine: 0 },
      { plate: 'Н095СВ 125', status: 'отпуск', onLine: 0 },
    ]);
    expect(buildKtkVvoSummary(baseInput()).vehicles.map((item) => item.status)).toEqual(['больничный', 'отпуск']);
    expect(vehicleStatuses([
      { id: 'x', name: 'нет водителя', plate: 'Х795РА 125', department: 'Контейнеры' },
      { id: 'y', name: 'Иванов И.И.', plate: 'Т051РА 125', department: 'Контейнеры' },
    ], {}, 1)).toEqual([
      { plate: 'Х795РА 125', status: 'нет водителя', onLine: 0 },
      { plate: 'Т051РА 125', status: '', onLine: 0 },
    ]);
  });
});
