import { AppDataSource } from '../config/data-source';
import type { DispatcherOrder } from '../models/dispatcher-order.model';
import { DispatcherOrderChange, type DispatcherOrderChangeAction } from '../models/dispatcher-order-change.model';
import { logger } from '../utils/logger';

/** Роли, которым видна история изменений реестра. */
export const DISPATCHER_HISTORY_ROLES = ['admin', 'head_ktk_vvo'] as const;

export const canViewDispatcherHistory = (role: string | undefined): boolean =>
  (DISPATCHER_HISTORY_ROLES as readonly string[]).includes(role ?? '');

type ChangeInput = {
  action: DispatcherOrderChangeAction;
  order?: Pick<DispatcherOrder, 'id' | 'orderDate' | 'ktkNumber' | 'client'> | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  userId?: string | null;
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return String(value).slice(0, 4000);
};

/**
 * Запись истории. Ошибка записи не должна ломать правку заявки — поэтому
 * только логируем (история вспомогательная, заявка важнее).
 */
export async function recordDispatcherChanges(changes: ChangeInput[]): Promise<void> {
  if (!changes.length) return;
  try {
    const repository = AppDataSource.getRepository(DispatcherOrderChange);
    await repository.insert(changes.map((change) => ({
      action: change.action,
      orderId: change.order?.id ?? null,
      field: change.field ?? null,
      oldValue: toText(change.oldValue),
      newValue: toText(change.newValue),
      orderDate: change.order?.orderDate ?? null,
      ktkNumber: change.order?.ktkNumber ?? null,
      client: change.order?.client ?? null,
      userId: change.userId ?? null,
    })));
  } catch (error) {
    logger.error('Реестр диспетчеров: не удалось записать историю изменений', error);
  }
}

/** Поля, которые пишутся в историю при правке (порядок — как в реестре). */
export const HISTORY_FIELDS = [
  'orderDate', 'status', 'info', 'client', 'driverName', 'vehiclePlate', 'ktkNumber', 'ktkType', 'grossWeight',
  'comments', 'operation', 'terminalFrom', 'slotFrom', 'pinFrom', 'submitTime', 'deliveryAddress', 'terminalTo',
  'slotTo', 'pinTo', 'driverRate', 'vat', 'clientRate', 'passes', 'extraAddress', 'demurrage', 'orderOnVehicle',
  'invoiceSent', 'extraTon', 'seal', 'recoupling', 'driverRemarks',
] as const;
