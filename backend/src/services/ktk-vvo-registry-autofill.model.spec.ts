import {
  KTK_VVO_AUTOFILL_FROM,
  computeKtkVvoMonth,
  isOwnVehicle,
  parseAmount,
  planFreezeAt,
  planKtkVvoWrites,
  vladivostokToday,
  type ExistingValue,
  type RegistryOrder,
} from './ktk-vvo-registry-autofill.model';

const order = (overrides: Partial<RegistryOrder>): RegistryOrder => ({
  orderDate: '2026-09-17',
  status: 'выполнена',
  operation: 'выгрузка',
  driverName: null,
  vehiclePlate: null,
  clientRate: null,
  passes: null,
  ...overrides,
});

const fleet = { driverSurnames: new Set(['иванов']), plates: new Set(['М590ХР125']) };

describe('ежедневный отчёт КТК Владивосток из реестра', () => {
  it('считает план без «стоп» и «не везем», факт по «выполнена», перемещение отдельно', () => {
    const month = computeKtkVvoMonth('2026-09', [
      order({ operation: 'Перемещение', driverName: 'Иванов И.И.' }),
      order({ operation: null, vehiclePlate: 'M590XP 125' }),
      order({ operation: 'доукрепление', status: 'новая' }),
      order({ status: 'стоп' }),
      order({ status: 'не везем', operation: 'перемещение' }),
      order({ status: 'выполнена', driverName: 'ИП Сивохин', clientRate: '41 000', passes: '2x1500' }),
    ], fleet);
    expect(month.get('2026-09-17')).toEqual({
      ktk_vvo_plan_unload_load: 3,
      ktk_vvo_plan_move: 1,
      ktk_vvo_fact_unload_load: 2,
      ktk_vvo_fact_move: 1,
      ktk_vvo_fact_move_own: 2,
      ktk_vvo_fact_move_hired: 1,
      ktk_vvo_manual_gross: 44000,
    });
  });

  it('«Вал» — нарастающим итогом с 1-го числа', () => {
    const month = computeKtkVvoMonth('2026-09', [
      order({ orderDate: '2026-09-01', clientRate: '10000' }),
      order({ orderDate: '2026-09-01', clientRate: '5000', status: 'новая' }),
      order({ orderDate: '2026-09-03', clientRate: '12000+3800' }),
    ], fleet);
    expect(month.get('2026-09-01')?.ktk_vvo_manual_gross).toBe(10000);
    expect(month.get('2026-09-02')?.ktk_vvo_manual_gross).toBe(10000);
    expect(month.get('2026-09-03')?.ktk_vvo_manual_gross).toBe(25800);
  });

  it('разбирает суммы и свои машины как в реестре', () => {
    expect(parseAmount('27,5')).toBe(27.5);
    expect(parseAmount('договорная')).toBe(0);
    expect(isOwnVehicle({ driverName: 'Иванов Иван', vehiclePlate: null }, fleet)).toBe(true);
    expect(isOwnVehicle({ driverName: 'Петров', vehiclePlate: 'м590хр 125' }, fleet)).toBe(true);
    expect(isOwnVehicle({ driverName: 'Петров', vehiclePlate: 'А001АА125' }, fleet)).toBe(false);
  });

  it('время по Владивостоку и фиксация плана в 09:45', () => {
    expect(vladivostokToday(new Date('2026-09-16T14:30:00Z'))).toBe('2026-09-17');
    expect(planFreezeAt('2026-09-17').toISOString()).toBe('2026-09-16T23:45:00.000Z');
  });

  it('старт автозаполнения — 16.09.2026', () => {
    expect(KTK_VVO_AUTOFILL_FROM).toBe('2026-09-16');
  });

  describe('что записывается', () => {
    const computed = computeKtkVvoMonth('2026-09', [
      order({ orderDate: '2026-09-16' }),
      order({ orderDate: '2026-09-17' }),
      order({ orderDate: '2026-09-17', status: 'новая' }),
      order({ orderDate: '2026-09-18', status: 'новая' }),
    ], fleet);
    const pick = (writes: ReturnType<typeof planKtkVvoWrites>, date: string, metric: string) =>
      writes.find((item) => item.date === date && item.metric === metric);

    it('до старта ничего; до 09:45 план пересчитывается, будущие дни без факта', () => {
      const writes = planKtkVvoWrites({ computed, existing: new Map(), now: new Date('2026-09-16T23:00:00Z'), from: '2026-09-17' });
      expect(writes.some((item) => item.date < '2026-09-17')).toBe(false);
      expect(pick(writes, '2026-09-17', 'ktk_vvo_plan_unload_load')?.value).toBe(2);
      expect(pick(writes, '2026-09-17', 'ktk_vvo_fact_unload_load')?.value).toBe(1);
      expect(pick(writes, '2026-09-18', 'ktk_vvo_plan_unload_load')?.value).toBe(1);
      expect(pick(writes, '2026-09-18', 'ktk_vvo_fact_unload_load')).toBeUndefined();
      expect(pick(writes, '2026-09-19', 'ktk_vvo_plan_unload_load')).toBeUndefined();
    });

    it('после 09:45 план не меняется, ручная правка не перезаписывается, факт заменяет старое значение', () => {
      const existing = new Map<string, ExistingValue>([
        ['2026-09-17|ktk_vvo_plan_unload_load', { value: 5, source: 'auto' }],
        ['2026-09-17|ktk_vvo_fact_move_own', { value: 9, source: 'manual' }],
        ['2026-09-17|ktk_vvo_fact_unload_load', { value: 7, source: null }],
      ]);
      const writes = planKtkVvoWrites({ computed, existing, now: new Date('2026-09-17T02:00:00Z'), from: '2026-09-17' });
      expect(pick(writes, '2026-09-17', 'ktk_vvo_plan_unload_load')).toBeUndefined();
      expect(pick(writes, '2026-09-17', 'ktk_vvo_plan_move')?.value).toBe(0);
      expect(pick(writes, '2026-09-17', 'ktk_vvo_fact_move_own')).toBeUndefined();
      expect(pick(writes, '2026-09-17', 'ktk_vvo_fact_unload_load')?.value).toBe(1);
    });

    it('не пишет то, что уже совпадает', () => {
      const existing = new Map<string, ExistingValue>([['2026-09-17|ktk_vvo_fact_unload_load', { value: 1, source: 'auto' }]]);
      const writes = planKtkVvoWrites({ computed, existing, now: new Date('2026-09-17T02:00:00Z'), from: '2026-09-17' });
      expect(pick(writes, '2026-09-17', 'ktk_vvo_fact_unload_load')).toBeUndefined();
    });
  });
});
