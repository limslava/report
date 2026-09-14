import api from './api';

export type DispatcherStatusOption = {
  id: string;
  name: string;
  color: string;
  /** null — цвет текста подбирается под фон */
  textColor: string | null;
};

export type DispatcherOrderRow = {
  id: string;
  orderDate: string;
  /** порядок строки внутри дня (перетаскивание) */
  position: number;
  status: string | null;
  info: string | null;
  client: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  ktkNumber: string | null;
  ktkType: string | null;
  grossWeight: string | null;
  comments: string | null;
  operation: string | null;
  terminalFrom: string | null;
  slotFrom: string | null;
  pinFrom: string | null;
  submitTime: string | null;
  deliveryAddress: string | null;
  terminalTo: string | null;
  slotTo: string | null;
  pinTo: string | null;
  driverRate: string | null;
  vat: string | null;
  clientRate: string | null;
  passes: string | null;
  extraAddress: string | null;
  demurrage: string | null;
  orderOnVehicle: boolean;
  invoiceSent: boolean;
  extraTon: string | null;
  seal: string | null;
  recoupling: boolean;
  driverRemarks: string | null;
  updatedAt: string | null;
};

export type DispatcherOrderPatch = Partial<
  Omit<DispatcherOrderRow, 'id' | 'updatedAt'>
>;

export const getDispatcherStatuses = () =>
  api.get<DispatcherStatusOption[]>('/dispatcher-journal/statuses');

export const getDispatcherOrders = (from: string, to: string) =>
  api.get<DispatcherOrderRow[]>('/dispatcher-journal/orders', { params: { from, to } });

export const createDispatcherOrder = (orderDate: string, initial?: DispatcherOrderPatch) =>
  api.post<DispatcherOrderRow>('/dispatcher-journal/orders', { orderDate, ...(initial ?? {}) });

/** Пустые строки на дату (кнопка «+»). */
export const createDispatcherOrdersBatch = (orderDate: string, count: number) =>
  api.post<DispatcherOrderRow[]>('/dispatcher-journal/orders/batch', { orderDate, count });

export const updateDispatcherOrder = (id: string, patch: DispatcherOrderPatch) =>
  api.patch<DispatcherOrderRow>(`/dispatcher-journal/orders/${id}`, patch);

export const deleteDispatcherOrder = (id: string) =>
  api.delete<{ message: string }>(`/dispatcher-journal/orders/${id}`);

// ── Справочники реестра ──

export type DispatcherDictionaryKind = 'ktk_type' | 'vat' | 'operation' | 'terminal_from' | 'terminal_to';

export type DispatcherDictionaryOptions = Record<DispatcherDictionaryKind, string[]>;

/** Цвета значений: вид справочника → значение → фон и текст (#rrggbb). */
export type DispatcherDictionaryColors = Record<
  DispatcherDictionaryKind,
  Record<string, { color: string | null; textColor: string | null }>
>;

export type DispatcherStatusEntry = DispatcherStatusOption & { sortOrder: number; isActive: boolean };

export type DispatcherDictionaryEntry = {
  id: string;
  kind: DispatcherDictionaryKind;
  name: string;
  color: string | null;
  textColor: string | null;
  sortOrder: number;
  isActive: boolean;
};

export const getDispatcherDictionaryOptions = () =>
  api.get<{ lists: DispatcherDictionaryOptions; colors: DispatcherDictionaryColors }>('/dispatcher-journal/dictionary-options');

export const getDispatcherDictionaries = () =>
  api.get<{ statuses: DispatcherStatusEntry[]; items: DispatcherDictionaryEntry[] }>('/dispatcher-journal/dictionaries');

export const createDispatcherStatusEntry = (payload: { name: string; color: string; textColor?: string | null }) =>
  api.post<DispatcherStatusEntry>('/dispatcher-journal/dictionaries/statuses', payload);

export const updateDispatcherStatusEntry = (
  id: string,
  payload: Partial<{ name: string; color: string; textColor: string | null; isActive: boolean }>,
) =>
  api.patch<DispatcherStatusEntry>(`/dispatcher-journal/dictionaries/statuses/${id}`, payload);

export const deleteDispatcherStatusEntry = (id: string) =>
  api.delete<{ message: string }>(`/dispatcher-journal/dictionaries/statuses/${id}`);

export const createDispatcherDictionaryEntry = (payload: {
  kind: DispatcherDictionaryKind;
  name: string;
  color?: string | null;
  textColor?: string | null;
}) =>
  api.post<DispatcherDictionaryEntry>('/dispatcher-journal/dictionaries/items', payload);

export const updateDispatcherDictionaryEntry = (
  id: string,
  payload: Partial<{ name: string; color: string | null; textColor: string | null; isActive: boolean }>,
) =>
  api.patch<DispatcherDictionaryEntry>(`/dispatcher-journal/dictionaries/items/${id}`, payload);

export const deleteDispatcherDictionaryEntry = (id: string) =>
  api.delete<{ message: string }>(`/dispatcher-journal/dictionaries/items/${id}`);

export const reorderDispatcherDictionary = (type: 'status' | 'item', ids: string[]) =>
  api.post<{ message: string }>('/dispatcher-journal/dictionaries/reorder', { type, ids });

// ── Экипажи из графика контейнеровозов ──

export type DispatcherCrewEntry = { driverName: string; plate: string; onLine: boolean };

export const getDispatcherCrew = (date: string) =>
  api.get<DispatcherCrewEntry[]>('/dispatcher-journal/crew', { params: { date } });

// ── Разовый импорт google-таблицы (.xlsx) ──

export type DispatcherImportSummary = {
  sheets: Array<{ name: string; orders: number; skippedRows: number; from: string | null; to: string | null }>;
  total: number;
  from: string;
  to: string;
  existingInRange: number;
  unknownStatuses: string[];
  imported: number;
};

export const importDispatcherOrders = (fileBase64: string, dryRun: boolean) =>
  api.post<DispatcherImportSummary>('/dispatcher-journal/import', { fileBase64, dryRun }, { timeout: 300_000 });
