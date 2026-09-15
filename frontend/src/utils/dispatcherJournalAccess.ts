/**
 * Доступ к реестру диспетчерского отдела — копия backend/src/constants/dispatcher-journal-access.ts
 * (здесь только прячем интерфейс, решает сервер).
 */

export type DispatcherJournalAccess = 'full' | 'fields' | 'view';

const FULL_ROLES = new Set(['admin', 'manager_ktk_vvo', 'head_ktk_vvo']);
const FIELD_EDITOR_ROLES = new Set(['doc_manager_vvo']);
const VIEWER_ROLES = new Set(['secretary', 'head_hr', 'hr_specialist']);

/** Поля, которые правит менеджер документационного отдела. */
export const DISPATCHER_DOC_MANAGER_FIELDS = new Set<string>([
  'driverRate',
  'demurrage',
  'vat',
  'clientRate',
  'passes',
  'extraAddress',
  'orderOnVehicle',
  'invoiceSent',
  'extraTon',
  'seal',
  'recoupling',
  'driverRemarks',
]);

/** Денежные столбцы, скрытые у ролей просмотра. */
export const DISPATCHER_FINANCE_COLUMNS = new Set<string>(['driverRate', 'vat', 'clientRate', 'passes', 'amountWithoutVat', 'demurrage']);

export function dispatcherJournalAccess(role?: string | null): DispatcherJournalAccess | null {
  if (!role) return null;
  if (FULL_ROLES.has(role)) return 'full';
  if (FIELD_EDITOR_ROLES.has(role)) return 'fields';
  if (VIEWER_ROLES.has(role)) return 'view';
  return null;
}

export function canEditDispatcherField(access: DispatcherJournalAccess | null, field: string): boolean {
  if (access === 'full') return true;
  if (access === 'fields') return DISPATCHER_DOC_MANAGER_FIELDS.has(field);
  return false;
}
