import { computeFuelDerived, FuelCalcInput } from './fuel-calc.service';
import { isWinterMonth, DEFAULT_FUEL_SEASONS } from '../constants/directories';

const base: FuelCalcInput = {
  odometer: null,
  fuelEnd: null,
  fuelFilled: null,
  mileageManual: null,
  fuelStartManual: null,
  prevOdometer: null,
  prevFuelEnd: null,
  normWinter: null,
  normSummer: null,
  isWinter: false,
};

describe('computeFuelDerived — формулы графика «Топливо»', () => {
  test('обычный месяц: пробег и остаток тянутся из прошлого месяца', () => {
    // Пример из исходной таблицы: одометр 125 000 → 128 500, остаток 120,
    // заправлено 980, конец 150.
    const r = computeFuelDerived({
      ...base,
      odometer: 128_500,
      prevOdometer: 125_000,
      prevFuelEnd: 120,
      fuelFilled: 980,
      fuelEnd: 150,
      normSummer: 27,
      isWinter: false,
    });
    expect(r.mileage).toBe(3500);
    expect(r.fuelStart).toBe(120);
    expect(r.consumption).toBe(950); // 120 + 980 − 150
    expect(r.per100).toBeCloseTo(27.14, 2); // 950 / 3500 × 100
    expect(r.norm).toBe(27);
    expect(r.deviationPct).toBeCloseTo(0.53, 2);
  });

  test('первый месяц машины: без прошлого месяца всё расчётное пусто', () => {
    const r = computeFuelDerived({ ...base, odometer: 125_000, fuelFilled: 500, fuelEnd: 100 });
    expect(r.mileage).toBeNull();
    expect(r.fuelStart).toBeNull();
    expect(r.consumption).toBeNull();
    expect(r.per100).toBeNull();
  });

  test('первый месяц: ручные пробег и начальный остаток запускают расчёт', () => {
    const r = computeFuelDerived({
      ...base,
      mileageManual: 2000,
      fuelStartManual: 100,
      fuelFilled: 500,
      fuelEnd: 60,
    });
    expect(r.mileage).toBe(2000);
    expect(r.fuelStart).toBe(100);
    expect(r.consumption).toBe(540);
    expect(r.per100).toBe(27);
  });

  test('ручные значения важнее автоматических', () => {
    const r = computeFuelDerived({
      ...base,
      odometer: 128_500,
      prevOdometer: 125_000, // авто дал бы 3500
      mileageManual: 3600,
      prevFuelEnd: 120, // авто дал бы 120
      fuelStartManual: 130,
      fuelFilled: 980,
      fuelEnd: 150,
    });
    expect(r.mileage).toBe(3600);
    expect(r.fuelStart).toBe(130);
    expect(r.consumption).toBe(960);
  });

  test('нулевой или отрицательный пробег не даёт л/100км (нет деления на ноль)', () => {
    const common = { ...base, prevFuelEnd: 100, fuelFilled: 50, fuelEnd: 80 };
    expect(computeFuelDerived({ ...common, mileageManual: 0 }).per100).toBeNull();
    expect(computeFuelDerived({ ...common, odometer: 1000, prevOdometer: 1200 }).per100).toBeNull();
  });

  test('расход может выйти отрицательным при ошибке данных — это видно, а не прячется', () => {
    // Конечный остаток больше, чем было всего топлива: явный сигнал о неверном вводе.
    const r = computeFuelDerived({ ...base, prevFuelEnd: 50, fuelFilled: 10, fuelEnd: 100, mileageManual: 500 });
    expect(r.consumption).toBe(-40);
    expect(r.per100).toBe(-8);
  });

  test('без одного из трёх вводимых полей расход не считается', () => {
    const filled = { ...base, prevFuelEnd: 100, mileageManual: 1000 };
    expect(computeFuelDerived({ ...filled, fuelFilled: null, fuelEnd: 50 }).consumption).toBeNull();
    expect(computeFuelDerived({ ...filled, fuelFilled: 500, fuelEnd: null }).consumption).toBeNull();
  });

  test('норма выбирается по сезону; отклонение считается от неё', () => {
    const input = {
      ...base,
      mileageManual: 1000,
      fuelStartManual: 0,
      fuelFilled: 330,
      fuelEnd: 0, // расход 330 → 33 л/100км
      normWinter: 30,
      normSummer: 27.5,
    };
    const winter = computeFuelDerived({ ...input, isWinter: true });
    expect(winter.norm).toBe(30);
    expect(winter.deviationPct).toBeCloseTo(10, 5); // 33 против 30

    const summer = computeFuelDerived({ ...input, isWinter: false });
    expect(summer.norm).toBe(27.5);
    expect(summer.deviationPct).toBeCloseTo(20, 5); // 33 против 27.5
  });

  test('без нормы модели отклонение не считается', () => {
    const r = computeFuelDerived({
      ...base,
      mileageManual: 1000,
      fuelStartManual: 0,
      fuelFilled: 300,
      fuelEnd: 0,
    });
    expect(r.per100).toBe(30);
    expect(r.norm).toBeNull();
    expect(r.deviationPct).toBeNull();
  });
});

describe('isWinterMonth — сезоны норм', () => {
  test('сезон по умолчанию: зима с 1 ноября по 31 марта (через новый год)', () => {
    const winterMonths = [11, 12, 1, 2, 3];
    const summerMonths = [4, 5, 6, 7, 8, 9, 10];
    for (const m of winterMonths) expect(isWinterMonth(m, DEFAULT_FUEL_SEASONS)).toBe(true);
    for (const m of summerMonths) expect(isWinterMonth(m, DEFAULT_FUEL_SEASONS)).toBe(false);
  });

  test('настроенный сезон без перехода через год', () => {
    const seasons = { winterStartMonth: 1, winterEndMonth: 4 };
    expect(isWinterMonth(1, seasons)).toBe(true);
    expect(isWinterMonth(4, seasons)).toBe(true);
    expect(isWinterMonth(5, seasons)).toBe(false);
    expect(isWinterMonth(12, seasons)).toBe(false);
  });
});
