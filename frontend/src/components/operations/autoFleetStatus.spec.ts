import { describe, expect, it } from 'vitest';
import { computeFleetSummary, type FleetPerson } from './autoFleetStatus';

const person = (id: string, plate: string, name = `Водитель ${id}`, extra?: Partial<FleetPerson>): FleetPerson => ({
  id,
  name,
  plate,
  department: 'Авто',
  ...extra,
});

// «Сегодня» во всех тестах — 11 сентября 2026.
const TODAY = new Date(2026, 8, 11);
const SEP = '2026-09';
const AUG = '2026-08';

const factScope = (codes: Record<string, string>) => codes;

describe('computeFleetSummary', () => {
  it('машина с «1» сегодня — в пути', () => {
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Н103СВ')] },
      { [`fact|${SEP}`]: factScope({ 'p1-1-11': 'W' }) },
      TODAY
    );
    expect(summary?.transit.map((s) => s.plate)).toEqual(['Н103СВ']);
    expect(summary?.transit[0].staleDays).toBe(0);
  });

  it('пример Н106СВ: «1» до 11.09, «О» с 17.09 — в пути с бейджем про отпуск', () => {
    const codes: Record<string, string> = { 'p1-1-11': 'W' };
    for (let day = 17; day <= 30; day += 1) codes[`p1-1-${day}`] = 'V';
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Н106СВ')] },
      { [`fact|${SEP}`]: factScope(codes) },
      TODAY
    );
    const status = summary?.transit[0];
    expect(status?.substate).toBe('transit');
    expect(status?.planBadge?.label).toBe('отпуск');
    expect(status?.planBadge?.date.getDate()).toBe(17);
  });

  it('«К» сегодня — на базе (Кневичи) и свободна к рейсу', () => {
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Н139ХР')] },
      { [`fact|${SEP}`]: factScope({ 'p1-1-10': 'K' }) },
      TODAY
    );
    expect(summary?.base[0].substate).toBe('knevichi');
    expect(summary?.freeVehicles).toHaveLength(1);
    expect(summary?.freeReasons).toContain('Кневичи');
  });

  it('О/В не решают статус: рейс из прошлого месяца перекрывает выходной', () => {
    // 15.08 машина ушла в рейс («1»), с 1.09 у водителя стоят «В» — машина всё ещё в пути.
    const sepCodes: Record<string, string> = {};
    for (let day = 1; day <= 11; day += 1) sepCodes[`p1-1-${day}`] = 'O';
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'М621ХР')], [AUG]: [person('p1', 'М621ХР')] },
      {
        [`fact|${SEP}`]: factScope(sepCodes),
        [`fact|${AUG}`]: factScope({ 'p1-1-15': 'W' }),
      },
      TODAY
    );
    const status = summary?.transit[0];
    expect(status?.substate).toBe('transit');
    expect(status?.markDate?.getDate()).toBe(15);
    expect(status?.markDate?.getMonth()).toBe(7);
    expect(status?.staleDays).toBe(27);
  });

  it('если машинных кодов нет вовсе — берём кандидата «отдых водителя»', () => {
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Р020ХУ')] },
      { [`fact|${SEP}`]: factScope({ 'p1-1-11': 'O' }) },
      TODAY
    );
    expect(summary?.base[0].substate).toBe('rest');
    expect(summary?.base[0].codeLabel).toBe('В');
    expect(summary?.freeReasons).toContain('выходные');
  });

  it('ремонт: считает дни подряд и попадает в счётчик ремонта', () => {
    const codes: Record<string, string> = {};
    for (let day = 5; day <= 11; day += 1) codes[`p1-1-${day}`] = 'R';
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Т216РА')] },
      { [`fact|${SEP}`]: factScope(codes) },
      TODAY
    );
    expect(summary?.base[0].substate).toBe('repair');
    expect(summary?.base[0].repairDays).toBe(7);
    expect(summary?.repairCount).toBe(1);
    expect(summary?.freeVehicles).toHaveLength(0);
  });

  it('ремонт длится и через границу месяца', () => {
    const sepCodes: Record<string, string> = {};
    for (let day = 1; day <= 11; day += 1) sepCodes[`p1-1-${day}`] = 'R';
    const augCodes: Record<string, string> = {};
    for (let day = 28; day <= 31; day += 1) augCodes[`p1-1-${day}`] = 'R';
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Т216РА')], [AUG]: [person('p1', 'Т216РА')] },
      { [`fact|${SEP}`]: factScope(sepCodes), [`fact|${AUG}`]: factScope(augCodes) },
      TODAY
    );
    expect(summary?.base[0].repairDays).toBe(15);
  });

  it('«Н» — без водителя, не свободна к рейсу', () => {
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'Н499УТ', '')] },
      { [`fact|${SEP}`]: factScope({ 'p1-1-11': 'N' }) },
      TODAY
    );
    expect(summary?.base[0].substate).toBe('noDriver');
    expect(summary?.noDriverCount).toBe(1);
    expect(summary?.freeVehicles).toHaveLength(0);
  });

  it('вторая смена (второй водитель) тоже учитывается', () => {
    const summary = computeFleetSummary(
      { [SEP]: [person('p1', 'К973ТС', 'Первый', { secondName: 'Второй' })] },
      { [`fact|${SEP}`]: factScope({ 'p1-1-11': 'O', 'p1-2-11': 'W' }) },
      TODAY
    );
    expect(summary?.transit[0]?.substate).toBe('transit');
  });

  it('без строк «Авто» возвращает null', () => {
    expect(
      computeFleetSummary({ [SEP]: [person('p1', 'А001АА', 'Имя', { department: 'Контейнеры' })] }, {}, TODAY)
    ).toBeNull();
  });
});
