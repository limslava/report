import { Between, In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { DispatcherOrder } from '../models/dispatcher-order.model';
import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import { PlanningDailyValue } from '../models/planning-daily-value.model';
import { PlanningMetric } from '../models/planning-metric.model';
import { PlanningSegment } from '../models/planning-segment.model';
import { PlanningSegmentCode } from '../models/planning.enums';
import { logger } from '../utils/logger';
import { planWebSocketService } from './websocket.service';
import {
  KTK_VVO_AUTOFILL_FROM,
  KTK_VVO_AUTOFILL_METRICS,
  computeKtkVvoMonth,
  planKtkVvoWrites,
  plateKey,
  surnameKey,
  vladivostokToday,
  type ExistingValue,
  type OwnFleet,
} from './ktk-vvo-registry-autofill.model';

const pad2 = (value: number): string => String(value).padStart(2, '0');
const shiftMonth = (month: string, delta: number): string => {
  const [year, monthNo] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
};
const monthEnd = (month: string): string => {
  const [year, monthNo] = month.split('-').map(Number);
  return `${month}-${pad2(new Date(Date.UTC(year, monthNo, 0)).getUTCDate())}`;
};
const isoDate = (value: Date | string): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/** Свои машины: водители «Нашей организации» (по фамилии) и её госномера. */
const loadOwnFleet = async (): Promise<OwnFleet> => {
  const [employees, vehicles] = await Promise.all([
    AppDataSource.getRepository(Employee).find({ where: { counterpartyId: IsNull(), position: 'водитель' }, select: ['fullName'] }),
    AppDataSource.getRepository(FleetVehicle).find({ where: { counterpartyId: IsNull() }, select: ['plate'] }),
  ]);
  return {
    driverSurnames: new Set(employees.map((employee) => surnameKey(employee.fullName)).filter(Boolean)),
    plates: new Set(vehicles.map((vehicle) => plateKey(vehicle.plate)).filter(Boolean)),
  };
};

/**
 * Пересчитывает строки ежедневного отчёта КТК Владивосток из реестра за месяцы:
 * прошлый, текущий и следующий (по Владивостоку) плюс месяцы изменённых заявок.
 * Возвращает число изменённых значений.
 */
export async function syncKtkVvoFromRegistry(options: { dates?: string[]; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const current = vladivostokToday(now).slice(0, 7);
  const months = new Set([shiftMonth(current, -1), current, shiftMonth(current, 1)]);
  (options.dates ?? []).forEach((date) => months.add(date.slice(0, 7)));
  const targetMonths = [...months].filter((month) => monthEnd(month) >= KTK_VVO_AUTOFILL_FROM).sort();
  if (!targetMonths.length) return 0;

  const segment = await AppDataSource.getRepository(PlanningSegment).findOne({ where: { code: PlanningSegmentCode.KTK_VVO } });
  if (!segment) return 0;
  const metrics = await AppDataSource.getRepository(PlanningMetric).find({
    where: { segmentId: segment.id, code: In([...KTK_VVO_AUTOFILL_METRICS]) },
  });
  const metricIdByCode = new Map(metrics.map((metric) => [metric.code, metric.id]));
  const metricCodeById = new Map(metrics.map((metric) => [metric.id, metric.code]));
  if (metricIdByCode.size !== KTK_VVO_AUTOFILL_METRICS.length) return 0;

  const fleet = await loadOwnFleet();
  let changed = 0;
  for (const month of targetMonths) {
    const from = `${month}-01`;
    const to = monthEnd(month);
    const [orders, rows] = await Promise.all([
      AppDataSource.getRepository(DispatcherOrder).find({
        where: { orderDate: Between(from, to) },
        select: ['orderDate', 'status', 'operation', 'driverName', 'vehiclePlate', 'clientRate', 'passes'],
      }),
      AppDataSource.getRepository(PlanningDailyValue).find({
        where: { metricId: In([...metricIdByCode.values()]), date: Between(from as unknown as Date, to as unknown as Date) },
      }),
    ]);
    const existing = new Map<string, ExistingValue>();
    rows.forEach((row) => {
      existing.set(`${isoDate(row.date)}|${metricCodeById.get(row.metricId)}`, {
        value: row.value === null ? null : Number(row.value),
        source: row.source ?? null,
      });
    });
    const writes = planKtkVvoWrites({ computed: computeKtkVvoMonth(month, orders, fleet), existing, now });
    if (!writes.length) continue;
    await AppDataSource.transaction(async (manager) => {
      for (const write of writes) {
        const metricId = metricIdByCode.get(write.metric)!;
        const [year, monthNo, day] = write.date.split('-').map(Number);
        const date = new Date(Date.UTC(year, monthNo - 1, day));
        if (write.value === null) {
          await manager.delete(PlanningDailyValue, { date, metricId });
        } else {
          await manager.upsert(
            PlanningDailyValue,
            { date, segmentId: segment.id, metricId, value: write.value.toFixed(2), source: 'auto', updatedById: null },
            ['date', 'metricId'],
          );
        }
      }
    });
    changed += writes.length;
    const [year, monthNo] = month.split('-').map(Number);
    planWebSocketService.notifyPlanningV2SegmentUpdated({ segmentCode: PlanningSegmentCode.KTK_VVO, year, month: monthNo });
  }
  return changed;
}

let running: Promise<number> | null = null;
let pendingDates: Set<string> | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

/** Пересчёт без наложения: если уже идёт, следующий запустится сразу после. */
export function runKtkVvoAutofill(dates: string[] = []): Promise<number> {
  if (running) {
    pendingDates = pendingDates ?? new Set();
    dates.forEach((date) => pendingDates!.add(date));
    return running;
  }
  running = syncKtkVvoFromRegistry({ dates })
    .catch((error) => {
      logger.error('Ежедневный отчёт КТК Владивосток: пересчёт из реестра не удался:', error);
      return 0;
    })
    .finally(() => {
      running = null;
      if (pendingDates) {
        const next = [...pendingDates];
        pendingDates = null;
        void runKtkVvoAutofill(next);
      }
    });
  return running;
}

const queuedDates = new Set<string>();

/** Реестр изменился — пересчитать через несколько секунд (серия правок — один пересчёт). */
export function requestKtkVvoAutofill(dates: Array<string | null | undefined>): void {
  dates.forEach((date) => {
    if (date && date >= KTK_VVO_AUTOFILL_FROM.slice(0, 7)) queuedDates.add(date);
  });
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const list = [...queuedDates];
    queuedDates.clear();
    void runKtkVvoAutofill(list);
  }, 3000);
}

/** Фоновый пересчёт каждые 2 минуты: план дня успевает обновиться до 09:45, справочник «Нашей организации» подхватывается. */
export function startKtkVvoAutofill(): void {
  setTimeout(() => void runKtkVvoAutofill(), 30_000);
  setInterval(() => void runKtkVvoAutofill(), 2 * 60_000);
  logger.info(`Ежедневный отчёт КТК Владивосток: автозаполнение из реестра с ${KTK_VVO_AUTOFILL_FROM}`);
}
