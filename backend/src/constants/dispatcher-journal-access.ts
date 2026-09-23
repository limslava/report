/**
 * Доступ к реестру диспетчерского отдела КТК Владивосток (решение 15.09.2026):
 * - диспетчер и руководитель КТК (и админ) — всё;
 * - менеджер документационного отдела — просмотр всего, правка только своих полей;
 * - офис-менеджер, руководитель и специалист отдела кадров — просмотр без денег.
 * Клиентская копия — frontend/src/utils/dispatcherJournalAccess.ts.
 */

export type DispatcherJournalAccess = 'full' | 'fields' | 'view';

/** Ведут реестр целиком: строки, порядок, все поля (отдел продаж — решение 16.09.2026). */
export const DISPATCHER_JOURNAL_ROLES = [
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'head_sales',
  'manager_sales',
  'manager_extra',
  // менеджер документационного отдела ведёт реестр целиком (решение 23.09.2026)
  'doc_manager_vvo',
] as const;
/** Правка только своих полей — сейчас таких ролей нет, механика оставлена на будущее. */
export const DISPATCHER_JOURNAL_FIELD_EDITOR_ROLES = [] as const;
export const DISPATCHER_JOURNAL_VIEWER_ROLES = ['secretary', 'head_hr', 'hr_specialist', 'bdd_specialist_vvo'] as const;
export const DISPATCHER_JOURNAL_READ_ROLES = [
  'admin',
  ...DISPATCHER_JOURNAL_ROLES,
  ...DISPATCHER_JOURNAL_FIELD_EDITOR_ROLES,
  ...DISPATCHER_JOURNAL_VIEWER_ROLES,
] as const;

/** Поля, которые правит менеджер документационного отдела. */
export const DISPATCHER_DOC_MANAGER_FIELDS = [
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
] as const;

/** Деньги строки: скрыты у ролей только для просмотра («Без НДС» считается на клиенте из них же). */
export const DISPATCHER_FINANCE_FIELDS = ['driverRate', 'vat', 'clientRate', 'passes', 'demurrage'] as const;

const includes = (list: readonly string[], role: string | undefined | null): boolean => Boolean(role && list.includes(role));

export const dispatcherJournalAccess = (role: string | undefined | null): DispatcherJournalAccess | null => {
  if (role === 'admin' || includes(DISPATCHER_JOURNAL_ROLES, role)) return 'full';
  if (includes(DISPATCHER_JOURNAL_FIELD_EDITOR_ROLES, role)) return 'fields';
  if (includes(DISPATCHER_JOURNAL_VIEWER_ROLES, role)) return 'view';
  return null;
};

export const canSeeDispatcherFinance = (role: string | undefined | null): boolean => {
  const access = dispatcherJournalAccess(role);
  return access === 'full' || access === 'fields';
};

/** Поля правки, которые роли не разрешены (пусто — всё можно). */
export const forbiddenDispatcherPatchFields = (role: string | undefined | null, fields: string[]): string[] => {
  const access = dispatcherJournalAccess(role);
  if (access === 'full') return [];
  if (access === 'fields') return fields.filter((field) => !(DISPATCHER_DOC_MANAGER_FIELDS as readonly string[]).includes(field));
  return fields;
};
