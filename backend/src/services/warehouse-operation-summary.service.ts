import { WAREHOUSE_VEHICLE_TYPE_LABELS } from '../constants/warehouse';

type Details = Record<string, unknown> | null | undefined;

const FIELD_LABELS: Record<string, string> = {
  vehicleType: 'тип ТС',
  vin: 'VIN',
  chassisNumber: 'номер шасси',
  brand: 'марка',
  model: 'модель',
  registrationNumber: 'госномер',
  fuelLevelPercent: 'топливо',
  notes: 'комментарий',
  requestNumber: '№ заявки',
  requestDate: 'дата заявки',
};

const formatDateTime = (value: unknown): string => {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const money = (value: unknown): string => new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
}).format(Number(value ?? 0));

const displayValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'vehicleType') return WAREHOUSE_VEHICLE_TYPE_LABELS[value as keyof typeof WAREHOUSE_VEHICLE_TYPE_LABELS] ?? String(value);
  if (field === 'fuelLevelPercent') return `${value} %`;
  return String(value);
};

/**
 * Заголовок и расшифровка операции для вкладки «История» карточки ТС.
 * Детали пишутся в warehouse_operations в свободной форме — здесь они
 * приводятся к одной строке, понятной без знания структуры аудита.
 */
export function summarizeWarehouseOperation(type: string, details: Details): { title: string; description: string | null } {
  const d = details ?? {};
  switch (type) {
    case 'created':
      return { title: 'ТС принято на хранение', description: `Приёмка ${formatDateTime(d.receivedAt)}` };
    case 'received':
      return { title: 'ТС поставлено на стоянку', description: null };
    case 'issued':
      return {
        title: 'ТС выдано клиенту',
        description: `Выдача ${formatDateTime(d.issuedAt)} · хранение ${d.storageDays ?? '—'} сут. · фото выдачи: ${d.issuePhotoCount ?? 0}`,
      };
    case 'updated': {
      const before = (d.before ?? {}) as Record<string, unknown>;
      const after = (d.after ?? {}) as Record<string, unknown>;
      const changes = Object.keys(FIELD_LABELS)
        .filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''))
        .map((field) => `${FIELD_LABELS[field]}: ${displayValue(field, before[field])} → ${displayValue(field, after[field])}`);
      return { title: 'Изменена карточка', description: changes.length ? changes.join('; ') : 'без изменения данных' };
    }
    case 'dates_corrected': {
      const before = (d.before ?? {}) as Record<string, unknown>;
      const after = (d.after ?? {}) as Record<string, unknown>;
      const parts = [`приёмка ${formatDateTime(before.receivedAt)} → ${formatDateTime(after.receivedAt)}`];
      if (before.issuedAt || after.issuedAt) {
        parts.push(`выдача ${formatDateTime(before.issuedAt)} → ${formatDateTime(after.issuedAt)}`);
      }
      return { title: 'Корректировка дат', description: `${parts.join('; ')} · причина: «${d.reason ?? '—'}»` };
    }
    case 'inspection_saved':
      return { title: 'Сохранён осмотр при приёмке', description: null };
    case 'issue_inspection_saved':
      return { title: 'Сохранён осмотр при выдаче', description: null };
    case 'photo_uploaded':
      if (d.attachedPendingPhotos !== undefined) {
        return { title: 'Загружены фото', description: `${d.attachedPendingPhotos} шт.` };
      }
      return {
        title: d.phase === 'issue' ? 'Загружено фото выдачи' : 'Загружено фото',
        description: d.originalName ? String(d.originalName) : null,
      };
    case 'photo_deleted':
      return { title: 'Удалено фото', description: d.originalName ? String(d.originalName) : null };
    case 'photos_purged':
      return { title: 'Фото удалены по сроку хранения', description: `${d.count ?? 0} шт.` };
    case 'service_performed':
      return {
        title: `Выполнена услуга «${d.serviceName ?? '—'}»`,
        description: `${d.quantity ?? 1} × ${money(d.unitPrice)} = ${money(d.totalAmount)}`
          + `${d.individualTariff ? ' · прайс клиента' : ''}${d.tariffMissing ? ' · тариф не задан' : ''}`,
      };
    case 'service_corrected': {
      const before = (d.before ?? {}) as Record<string, unknown>;
      const after = (d.after ?? {}) as Record<string, unknown>;
      return {
        title: `Исправлена услуга «${d.serviceName ?? '—'}»`,
        description: `количество ${before.quantity ?? '—'} → ${after.quantity ?? '—'}, сумма ${money(before.totalAmount)} → ${money(after.totalAmount)}`,
      };
    }
    default:
      return { title: type, description: null };
  }
}
