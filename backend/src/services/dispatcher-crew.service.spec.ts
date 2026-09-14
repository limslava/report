import { buildDispatcherCrew } from './dispatcher-crew.service';

describe('buildDispatcherCrew', () => {
  const state = {
    peopleByMonth: {
      '2026-09': [
        { id: 'a', name: 'Чугунов Иван Петрович', plate: 'М604ХР 125', department: 'Контейнеры' },
        { id: 'b', name: 'Рудько Олег', secondName: 'Лукаш Павел', plate: 'Н102СВ 125', department: 'Контейнеры' },
        { id: 'c', name: 'Автовозов Пётр', plate: 'А001АА 125', department: 'Авто' },
      ],
    },
    overrides: {
      'fact|2026-09': { 'b-2-3': 'W', 'b-1-3': 'O' },
      'plan|2026-09': { 'a-1-3': 'W', 'b-1-3': 'W' },
    },
  };

  it('берёт только контейнеровозы месяца заявки', () => {
    const crew = buildDispatcherCrew(state, '2026-09-03');
    expect(crew.map((entry) => entry.driverName)).toEqual(['Чугунов Иван Петрович', 'Рудько Олег', 'Лукаш Павел']);
  });

  it('факт важнее плана при определении, кто на линии', () => {
    const crew = buildDispatcherCrew(state, '2026-09-03');
    expect(crew.find((entry) => entry.driverName === 'Рудько Олег')?.onLine).toBe(false);
    expect(crew.find((entry) => entry.driverName === 'Лукаш Павел')?.onLine).toBe(true);
    expect(crew.find((entry) => entry.driverName === 'Чугунов Иван Петрович')?.onLine).toBe(true);
  });

  it('пустой график или другой месяц — пустой список', () => {
    expect(buildDispatcherCrew(state, '2026-10-01')).toEqual([]);
    expect(buildDispatcherCrew(null, '2026-09-01')).toEqual([]);
  });
});
