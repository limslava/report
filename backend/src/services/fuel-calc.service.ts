/**
 * Чистые расчёты строки графика «Топливо» — вынесены из контроллера,
 * чтобы формулы были покрыты юнит-тестами (fuel-calc.service.spec.ts).
 *
 * Правила (согласованы с ТЗ):
 * - пробег = одометр − одометр прошлого месяца; ручное значение важнее;
 * - начальный остаток = конечный остаток прошлого месяца; ручное важнее
 *   (первый месяц машины вводится руками);
 * - расход = начальный + заправлено − конечный;
 * - л/100км = расход / пробег × 100 (только при положительном пробеге);
 * - норма берётся зимняя или летняя по сезону месяца;
 * - отклонение % = (л/100км − норма) / норма × 100.
 */

export type FuelCalcInput = {
  odometer: number | null;
  fuelEnd: number | null;
  fuelFilled: number | null;
  mileageManual: number | null;
  fuelStartManual: number | null;
  prevOdometer: number | null;
  prevFuelEnd: number | null;
  normWinter: number | null;
  normSummer: number | null;
  isWinter: boolean;
};

export type FuelCalcResult = {
  mileage: number | null;
  fuelStart: number | null;
  consumption: number | null;
  per100: number | null;
  norm: number | null;
  deviationPct: number | null;
};

export function computeFuelDerived(input: FuelCalcInput): FuelCalcResult {
  const {
    odometer,
    fuelEnd,
    fuelFilled,
    mileageManual,
    fuelStartManual,
    prevOdometer,
    prevFuelEnd,
    normWinter,
    normSummer,
    isWinter,
  } = input;

  const mileage =
    mileageManual ?? (odometer !== null && prevOdometer !== null ? odometer - prevOdometer : null);
  const fuelStart = fuelStartManual ?? prevFuelEnd;
  const consumption =
    fuelStart !== null && fuelFilled !== null && fuelEnd !== null
      ? fuelStart + fuelFilled - fuelEnd
      : null;
  const per100 = consumption !== null && mileage !== null && mileage > 0 ? (consumption / mileage) * 100 : null;
  const norm = isWinter ? normWinter : normSummer;
  const deviationPct = per100 !== null && norm !== null && norm > 0 ? ((per100 - norm) / norm) * 100 : null;

  return { mileage, fuelStart, consumption, per100, norm, deviationPct };
}
