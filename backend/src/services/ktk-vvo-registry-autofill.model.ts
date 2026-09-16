/**
 * Ежедневный отчёт «Контейнерные перевозки — Владивосток» из реестра диспетчерского отдела
 * (решения 15.09.2026; старт — 16.09.2026, фиксация плана — 09:45, решение 17.09.2026). Здесь — чистый расчёт без базы.
 *
 * - план (выгрузка/погрузка, перемещение) — заявки на дату, кроме «стоп» и «не везем»;
 *   фиксируется в 09:45 по Владивостоку этого дня (перед отправкой отчёта);
 * - факт — заявки со статусом «выполнена»; «перемещение» — отдельно, всё остальное
 *   (в том числе пустая операция) — выгрузка/погрузка;
 * - собственные ТС — водитель из «Нашей организации» (по фамилии) или наш госномер, остальные — наёмные;
 * - «Вал. Общий» — «Ставка + Пропуска» выполненных заявок нарастающим итогом с 1-го числа месяца.
 * Ручная правка администратора или руководителя КТК важнее расчёта.
 */

export const KTK_VVO_AUTOFILL_FROM = '2026-09-16';

export const KTK_VVO_AUTOFILL_METRICS = [
  'ktk_vvo_plan_unload_load',
  'ktk_vvo_plan_move',
  'ktk_vvo_fact_unload_load',
  'ktk_vvo_fact_move',
  'ktk_vvo_fact_move_own',
  'ktk_vvo_fact_move_hired',
  'ktk_vvo_manual_gross',
] as const;
export type KtkVvoAutofillMetric = typeof KTK_VVO_AUTOFILL_METRICS[number];
export const KTK_VVO_PLAN_METRICS = new Set<string>(['ktk_vvo_plan_unload_load', 'ktk_vvo_plan_move']);

/** Кто может перезаписать рассчитанное значение вручную. */
export const KTK_VVO_AUTOFILL_OVERRIDE_ROLES = new Set<string>(['admin', 'head_ktk_vvo']);

export type RegistryOrder = {
  orderDate: string;
  status: string | null;
  operation: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  clientRate: string | null;
  passes: string | null;
};

export type OwnFleet = { driverSurnames: Set<string>; plates: Set<string> };

export type DayValues = Record<KtkVvoAutofillMetric, number>;

const VLAT_OFFSET_MS = 10 * 3600_000;

/** Сегодняшняя дата по Владивостоку (UTC+10, без перехода на летнее время). */
export const vladivostokToday = (now: Date): string => new Date(now.getTime() + VLAT_OFFSET_MS).toISOString().slice(0, 10);

/** Момент фиксации плана дня: 09:45 по Владивостоку этой даты. */
export const planFreezeAt = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 9, 45) - VLAT_OFFSET_MS);
};

export const isCompleted = (status: string | null): boolean => /^выполнен/i.test((status ?? '').trim());
const isStopped = (status: string | null): boolean => /^(стоп|не\s*везем|не\s*везём)/i.test((status ?? '').trim());
export const isRelocation = (operation: string | null): boolean => /^перемещени/i.test((operation ?? '').trim());

/** Фамилия для сравнения: «Иванов И.И.» и «иванов иван» → «иванов». */
export const surnameKey = (raw: string | null | undefined): string =>
  (raw ?? '').trim().split(/\s+/)[0].toLowerCase().replace(/ё/g, 'е');

/** Госномер без пробелов, латиница → кириллица. */
export const plateKey = (raw: string | null | undefined): string => {
  const latinToCyrillic: Record<string, string> = {
    A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х',
  };
  return (raw ?? '').toUpperCase().replace(/\s+/g, '').replace(/[ABEKMHOPCTYX]/g, (char) => latinToCyrillic[char] ?? char);
};

/** Сумма из ячейки реестра: «41 000», «12000+3800», «2x2500», «27,5»; непонятный текст — 0 (как в реестре). */
export const parseAmount = (raw: string | null | undefined): number => {
  const text = (raw ?? '').replace(/ /g, ' ').trim();
  if (!text) return 0;
  const compact = text.replace(/\s+/g, '').replace(/[хx×*]/gi, '*').replace(/,/g, '.');
  if (!/^[\d.+*]+$/.test(compact)) return 0;
  let total = 0;
  for (const term of compact.split('+')) {
    if (!term) return 0;
    let product = 1;
    for (const factor of term.split('*')) {
      const value = Number(factor);
      if (!factor || !Number.isFinite(value)) return 0;
      product *= value;
    }
    total += product;
  }
  return total;
};

export const isOwnVehicle = (order: Pick<RegistryOrder, 'driverName' | 'vehiclePlate'>, fleet: OwnFleet): boolean => {
  const plate = plateKey(order.vehiclePlate);
  const surname = surnameKey(order.driverName);
  return (plate !== '' && fleet.plates.has(plate)) || (surname !== '' && fleet.driverSurnames.has(surname));
};

const daysOfMonth = (month: string): string[] => {
  const [year, monthNo] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
};

/**
 * Значения всех дней месяца (month — YYYY-MM) по заявкам этого месяца.
 * «Вал» — нарастающим итогом, поэтому считается по всему месяцу, даже до даты старта.
 */
export function computeKtkVvoMonth(month: string, orders: RegistryOrder[], fleet: OwnFleet): Map<string, DayValues> {
  const byDate = new Map<string, RegistryOrder[]>();
  orders.forEach((order) => {
    if (order.orderDate.slice(0, 7) !== month) return;
    const list = byDate.get(order.orderDate) ?? [];
    list.push(order);
    byDate.set(order.orderDate, list);
  });
  const result = new Map<string, DayValues>();
  let gross = 0;
  daysOfMonth(month).forEach((date) => {
    const values: DayValues = {
      ktk_vvo_plan_unload_load: 0,
      ktk_vvo_plan_move: 0,
      ktk_vvo_fact_unload_load: 0,
      ktk_vvo_fact_move: 0,
      ktk_vvo_fact_move_own: 0,
      ktk_vvo_fact_move_hired: 0,
      ktk_vvo_manual_gross: 0,
    };
    (byDate.get(date) ?? []).forEach((order) => {
      const relocation = isRelocation(order.operation);
      if (!isStopped(order.status)) {
        if (relocation) values.ktk_vvo_plan_move += 1;
        else values.ktk_vvo_plan_unload_load += 1;
      }
      if (!isCompleted(order.status)) return;
      if (relocation) values.ktk_vvo_fact_move += 1;
      else values.ktk_vvo_fact_unload_load += 1;
      if (isOwnVehicle(order, fleet)) values.ktk_vvo_fact_move_own += 1;
      else values.ktk_vvo_fact_move_hired += 1;
      gross += parseAmount(order.clientRate) + parseAmount(order.passes);
    });
    values.ktk_vvo_manual_gross = Math.round(gross * 100) / 100;
    result.set(date, values);
  });
  return result;
}

export type ExistingValue = { value: number | null; source: string | null };

export type AutofillWrite = { date: string; metric: KtkVvoAutofillMetric; value: number | null };

/**
 * Что записать в ежедневный отчёт. Правила:
 * - до даты старта ничего не трогаем;
 * - ручная правка (source = 'manual') не перезаписывается;
 * - план: пересчитывается до 09:45 дня; после — только если значения ещё нет вовсе;
 *   на будущие дни без заявок строка плана не создаётся;
 * - факт и «Вал»: с даты старта по сегодня, прежние значения (в том числе введённые до
 *   автозаполнения) заменяются расчётом; будущие дни — пусто.
 */
export function planKtkVvoWrites(params: {
  computed: Map<string, DayValues>;
  existing: Map<string, ExistingValue>;
  now: Date;
  from?: string;
}): AutofillWrite[] {
  const from = params.from ?? KTK_VVO_AUTOFILL_FROM;
  const today = vladivostokToday(params.now);
  const writes: AutofillWrite[] = [];
  params.computed.forEach((values, date) => {
    if (date < from) return;
    KTK_VVO_AUTOFILL_METRICS.forEach((metric) => {
      const current = params.existing.get(`${date}|${metric}`);
      if (current?.source === 'manual') return;
      let next: number | null;
      if (KTK_VVO_PLAN_METRICS.has(metric)) {
        const frozen = params.now.getTime() >= planFreezeAt(date).getTime();
        if (frozen && current) return;
        next = date > today && values[metric] === 0 ? null : values[metric];
      } else {
        next = date > today ? null : values[metric];
      }
      if (next === null && !current) return;
      if (current && current.source === 'auto' && current.value === next) return;
      writes.push({ date, metric, value: next });
    });
  });
  return writes;
}
