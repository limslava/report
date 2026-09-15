import { Request, Response, NextFunction } from 'express';
import { Between, In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { DispatcherOrder } from '../models/dispatcher-order.model';
import { DispatcherStatus } from '../models/dispatcher-status.model';
import {
  DISPATCHER_DICTIONARY_KINDS,
  DispatcherDictionaryItem,
  dispatcherDictionaryNameLimit,
  type DispatcherDictionaryKind,
} from '../models/dispatcher-dictionary-item.model';
import { OperationsPreviewState } from '../models/operations-preview-state.model';
import { buildDispatcherCrew } from '../services/dispatcher-crew.service';
import { parseDispatcherWorkbook } from '../services/dispatcher-import.service';
import {
  HISTORY_FIELDS,
  canViewDispatcherHistory,
  recordDispatcherChanges,
} from '../services/dispatcher-history.service';
import { DispatcherOrderChange } from '../models/dispatcher-order-change.model';
import { User } from '../models/user.model';
import { ensureDispatcherDictionaryCatalog } from '../services/dispatcher-status-seed.service';
import { planWebSocketService } from '../services/websocket.service';
import { requestKtkVvoAutofill } from '../services/ktk-vvo-registry-autofill.service';
import { buildDispatcherJournalWorkbook, type ExportColor } from '../services/dispatcher-journal-export.service';
import { buildContentDisposition } from '../utils/content-disposition';
import { assignMissingDispatcherOrderNumbers } from '../services/dispatcher-order-number.service';

/** Новым строкам — «№ заказа»; возвращает их уже с номером. */
const withOrderNumbers = async (saved: DispatcherOrder[]): Promise<DispatcherOrder[]> => {
  await assignMissingDispatcherOrderNumbers();
  const fresh = await orderRepository.find({ where: { id: In(saved.map((order) => order.id)) } });
  const byId = new Map(fresh.map((order) => [order.id, order]));
  return saved.map((order) => byId.get(order.id) ?? order);
};
import {
  DISPATCHER_FINANCE_FIELDS,
  canSeeDispatcherFinance,
  forbiddenDispatcherPatchFields,
} from '../constants/dispatcher-journal-access';

const orderRepository = AppDataSource.getRepository(DispatcherOrder);

/** Реестр изменился: коллегам — обновить таблицу, ежедневному отчёту КТК Владивосток — пересчитаться. */
const notifyJournalChanged = (params: { date: string; userId?: string }) => {
  planWebSocketService.notifyDispatcherJournalUpdated(params);
  requestKtkVvoAutofill([params.date]);
};
const statusRepository = AppDataSource.getRepository(DispatcherStatus);
const dictionaryRepository = AppDataSource.getRepository(DispatcherDictionaryItem);
const previewStateRepository = AppDataSource.getRepository(OperationsPreviewState);

/** Ключ графика работы КТК Владивосток (operations-preview). */
const KTK_VVO_SCHEDULE_SCOPE = 'ktk_vvo_preview_v1';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Поля строки, редактируемые с клиента (единица сохранения — одно поле). */
const EDITABLE_TEXT_FIELDS = [
  'status',
  'info',
  'client',
  'driverName',
  'vehiclePlate',
  'ktkNumber',
  'ktkType',
  'grossWeight',
  'comments',
  'operation',
  'terminalFrom',
  'slotFrom',
  'pinFrom',
  'submitTime',
  'deliveryAddress',
  'terminalTo',
  'slotTo',
  'pinTo',
  'driverRate',
  'vat',
  'clientRate',
  'passes',
  'extraAddress',
  'demurrage',
  'extraTon',
  'seal',
  'driverRemarks',
] as const;
const EDITABLE_BOOLEAN_FIELDS = ['orderOnVehicle', 'invoiceSent', 'recoupling'] as const;

type EditableTextField = typeof EDITABLE_TEXT_FIELDS[number];
type EditableBooleanField = typeof EDITABLE_BOOLEAN_FIELDS[number];

const TEXT_FIELD_SET = new Set<string>(EDITABLE_TEXT_FIELDS);
const BOOLEAN_FIELD_SET = new Set<string>(EDITABLE_BOOLEAN_FIELDS);

const httpError = (statusCode: number, message: string): never => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const requireDate = (value: unknown): string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    const error: any = new Error('Некорректная дата (ожидается YYYY-MM-DD)');
    error.statusCode = 400;
    throw error;
  }
  return value;
};

const serializeOrder = (order: DispatcherOrder) => ({
  id: order.id,
  orderNumber: order.orderNumber ?? null,
  orderDate: order.orderDate,
  position: order.position,
  status: order.status,
  info: order.info,
  client: order.client,
  driverName: order.driverName,
  vehiclePlate: order.vehiclePlate,
  ktkNumber: order.ktkNumber,
  ktkType: order.ktkType,
  grossWeight: order.grossWeight,
  comments: order.comments,
  operation: order.operation,
  terminalFrom: order.terminalFrom,
  slotFrom: order.slotFrom,
  pinFrom: order.pinFrom,
  submitTime: order.submitTime,
  deliveryAddress: order.deliveryAddress,
  terminalTo: order.terminalTo,
  slotTo: order.slotTo,
  pinTo: order.pinTo,
  driverRate: order.driverRate,
  vat: order.vat,
  clientRate: order.clientRate,
  passes: order.passes,
  extraAddress: order.extraAddress,
  demurrage: order.demurrage,
  orderOnVehicle: order.orderOnVehicle,
  invoiceSent: order.invoiceSent,
  extraTon: order.extraTon,
  seal: order.seal,
  recoupling: order.recoupling,
  driverRemarks: order.driverRemarks,
  updatedAt: order.updatedAt?.toISOString?.() ?? null,
});

export const listDispatcherStatuses = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const statuses = await statusRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    res.json(statuses.map((status) => ({
      id: status.id,
      name: status.name,
      color: status.color,
      textColor: status.textColor,
    })));
  } catch (error) {
    next(error);
  }
};

/**
 * Заявки за период — сплошная таблица, как её ведут диспетчера в google.
 * Режим «Актуальное» на фронте запрашивает хвост прошлого + всё ближайшее
 * будущее, поэтому заявка от 29.09 на вывоз 01.10 видна уже 30.09.
 */
/** Роли просмотра (офис-менеджер, отдел кадров) денег строки не получают. */
const withoutFinance = <T extends Record<string, unknown>>(row: T): T => {
  const copy: Record<string, unknown> = { ...row };
  DISPATCHER_FINANCE_FIELDS.forEach((field) => { copy[field] = null; });
  return copy as T;
};

/** Excel всего реестра: лист на каждый месяц; роли просмотра — без денег. */
export const exportDispatcherJournalExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [orders, statuses, items] = await Promise.all([
      orderRepository.find({ order: { position: 'ASC', createdAt: 'ASC' } }),
      statusRepository.find(),
      dictionaryRepository.find(),
    ]);
    const palettes: Record<string, Map<string, ExportColor>> = {
      status: new Map(statuses.map((status) => [status.name, { color: status.color, textColor: status.textColor }])),
    };
    items.forEach((item) => {
      palettes[item.kind] = palettes[item.kind] ?? new Map();
      palettes[item.kind].set(item.name, { color: item.color, textColor: item.textColor });
    });
    const workbook = buildDispatcherJournalWorkbook({
      orders: orders.map(serializeOrder),
      palettes,
      hideFinance: !canSeeDispatcherFinance(req.user?.role),
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const now = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('.');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(`Реестр КТК Владивосток — ${now}.xlsx`));
    res.status(200).send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) {
    next(error);
  }
};

export const listDispatcherOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = requireDate(req.query.from);
    const to = requireDate(req.query.to);
    if (from > to) {
      const error: any = new Error('Начало периода позже конца');
      error.statusCode = 400;
      throw error;
    }
    const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    if (spanDays > 400) {
      const error: any = new Error('Слишком большой период (максимум 400 дней)');
      error.statusCode = 400;
      throw error;
    }
    const orders = await orderRepository.find({
      where: { orderDate: Between(from, to) },
      // порядок строк — ручной (перетаскивание), как в google-таблице отдела
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    // кто последним менял строку — только тем, кому видна история (подсказка на № строки)
    if (canViewDispatcherHistory(req.user?.role)) {
      const names = await userNamesById(orders.map((order) => order.updatedBy ?? order.createdBy));
      res.json(orders.map((order) => ({
        ...serializeOrder(order),
        lastEditorName: names.get(order.updatedBy ?? order.createdBy ?? '') ?? null,
      })));
      return;
    }
    const serialized = orders.map(serializeOrder);
    res.json(canSeeDispatcherFinance(req.user?.role) ? serialized : serialized.map(withoutFinance));
  } catch (error) {
    next(error);
  }
};

const userNamesById = async (ids: Array<string | null | undefined>): Promise<Map<string, string>> => {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const users = await AppDataSource.getRepository(User).find({ where: { id: In(unique) } });
  return new Map(users.map((user) => [user.id, user.fullName]));
};

/** Позиция строки из запроса (перетаскивание, восстановление по Ctrl+Z). */
const parsePosition = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const createDispatcherOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = requireDate(req.body?.orderDate);
    const order = orderRepository.create({
      orderDate: date,
      position: parsePosition(req.body?.position) ?? Date.now(),
      status: 'новая',
      createdBy: req.user?.id ?? null,
      updatedBy: req.user?.id ?? null,
    });
    // Начальные значения (вставка строк из Excel): та же белая схема полей, что и в PATCH.
    const initial = (req.body ?? {}) as Record<string, unknown>;
    // явный null статуса (восстановление пустой строки по Ctrl+Z) — строка без статуса
    if ('status' in initial && initial.status == null) order.status = null;
    Object.entries(initial).forEach(([field, value]) => {
      if (TEXT_FIELD_SET.has(field) && value != null && value !== '') {
        (order as any)[field] = String(value).slice(0, 4000);
      } else if (BOOLEAN_FIELD_SET.has(field)) {
        (order as any)[field] = Boolean(value);
      }
    });
    const [saved] = await withOrderNumbers([await orderRepository.save(order)]);
    await recordDispatcherChanges([{ action: 'create', order: saved, userId: req.user?.id }]);
    notifyJournalChanged({ date, userId: req.user?.id });
    res.status(201).json(serializeOrder(saved));
  } catch (error) {
    next(error);
  }
};

/** Пачка пустых строк на дату (кнопка «+» в реестре): без статуса, в конец дня. */
export const createDispatcherOrdersBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = requireDate(req.body?.orderDate);
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 100) httpError(400, 'Количество строк — от 1 до 100');
    const base = Date.now();
    const orders = Array.from({ length: count }, (_item, index) => orderRepository.create({
      orderDate: date,
      position: base + index,
      status: null,
      createdBy: req.user?.id ?? null,
      updatedBy: req.user?.id ?? null,
    }));
    const saved = await withOrderNumbers(await orderRepository.save(orders));
    await recordDispatcherChanges(saved.map((item) => ({ action: 'create' as const, order: item, userId: req.user?.id })));
    notifyJournalChanged({ date, userId: req.user?.id });
    res.status(201).json(saved.map(serializeOrder));
  } catch (error) {
    next(error);
  }
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Порядок строк пачкой — общая сортировка «как в google» и её отмена (Ctrl+Z).
 * body: { items: [{ id, position }], label?: «Статус ↑» }. Меняется только позиция
 * (дата правки не трогается), в историю — одна запись «сортировка».
 */
export const updateDispatcherOrderPositions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems
      .map((item) => item as { id?: unknown; position?: unknown })
      .filter((item): item is { id: string; position: number } =>
        typeof item.id === 'string' && UUID_PATTERN.test(item.id) && typeof item.position === 'number' && Number.isFinite(item.position));
    if (!items.length || items.length > 5000 || items.length !== rawItems.length) {
      const error: any = new Error('Некорректный список позиций');
      error.statusCode = 400;
      throw error;
    }
    const orders = await orderRepository.find({ where: { id: In(items.map((item) => item.id)) }, select: ['id', 'orderDate', 'position'] });
    const currentById = new Map(orders.map((order) => [order.id, order]));
    const changed = items.filter((item) => currentById.has(item.id) && currentById.get(item.id)!.position !== item.position);
    if (changed.length) {
      const params: unknown[] = [];
      const values = changed.map((item) => {
        params.push(item.id, item.position);
        return `($${params.length - 1}::uuid, $${params.length}::double precision)`;
      });
      await AppDataSource.query(
        `UPDATE dispatcher_orders AS o SET position = v.position FROM (VALUES ${values.join(', ')}) AS v(id, position) WHERE o.id = v.id`,
        params,
      );
      const dates = [...new Set(changed.map((item) => currentById.get(item.id)!.orderDate))].sort();
      const dmy = (date: string) => date.split('-').reverse().join('.');
      const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 200) : '';
      await recordDispatcherChanges([{
        action: 'sort',
        order: { id: null, orderDate: dates[0], ktkNumber: null, client: null },
        newValue: `${label ? `${label} · ` : ''}строк: ${changed.length}${dates.length > 1 ? ` (${dmy(dates[0])} — ${dmy(dates[dates.length - 1])})` : ''}`,
        userId: req.user?.id,
      }]);
      dates.forEach((date) => notifyJournalChanged({ date, userId: req.user?.id }));
    }
    res.json({ updated: changed.length });
  } catch (error) {
    next(error);
  }
};

export const updateDispatcherOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const order = await orderRepository.findOne({ where: { id } });
    if (!order) {
      const error: any = new Error('Строка журнала не найдена');
      error.statusCode = 404;
      throw error;
    }

    const patch = (req.body ?? {}) as Record<string, unknown>;
    // менеджер документационного отдела правит только свои поля (дату и порядок строк — нет)
    const forbidden = forbiddenDispatcherPatchFields(req.user?.role, Object.keys(patch));
    if (forbidden.length) httpError(403, 'Нет прав на изменение этих полей реестра');
    let changed = false;
    const previousDate = order.orderDate;
    const before = { ...order };
    if (typeof patch.orderDate === 'string' && DATE_PATTERN.test(patch.orderDate) && patch.orderDate !== order.orderDate) {
      order.orderDate = patch.orderDate;
      changed = true;
    }
    const position = parsePosition(patch.position);
    if (position !== null && position !== order.position) {
      order.position = position;
      changed = true;
    }
    Object.entries(patch).forEach(([field, value]) => {
      if (TEXT_FIELD_SET.has(field)) {
        const nextValue = value == null ? null : String(value).slice(0, 4000);
        if (order[field as EditableTextField] !== nextValue) {
          (order as any)[field] = nextValue === '' ? null : nextValue;
          changed = true;
        }
      } else if (BOOLEAN_FIELD_SET.has(field)) {
        const nextValue = Boolean(value);
        if (order[field as EditableBooleanField] !== nextValue) {
          (order as any)[field] = nextValue;
          changed = true;
        }
      }
    });

    if (changed) {
      order.updatedBy = req.user?.id ?? null;
      await orderRepository.save(order);
      const fieldChanges: Parameters<typeof recordDispatcherChanges>[0] = HISTORY_FIELDS
        .filter((field) => (before as any)[field] !== (order as any)[field])
        .map((field) => ({
          action: 'update' as const,
          order: before,
          field,
          oldValue: (before as any)[field],
          newValue: (order as any)[field],
          userId: req.user?.id,
        }));
      // перетаскивание строки — одна запись «перенос», без чисел позиции
      if (before.position !== order.position && fieldChanges.length === 0) {
        fieldChanges.push({ action: 'move', order: before, userId: req.user?.id });
      }
      await recordDispatcherChanges(fieldChanges);
      notifyJournalChanged({ date: order.orderDate, userId: req.user?.id });
      if (previousDate !== order.orderDate) {
        notifyJournalChanged({ date: previousDate, userId: req.user?.id });
      }
    }
    res.json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
};

export const deleteDispatcherOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const order = await orderRepository.findOne({ where: { id } });
    if (!order) {
      const error: any = new Error('Строка журнала не найдена');
      error.statusCode = 404;
      throw error;
    }
    const snapshot = { id: order.id, orderDate: order.orderDate, ktkNumber: order.ktkNumber, client: order.client };
    await orderRepository.remove(order);
    await recordDispatcherChanges([{ action: 'delete', order: snapshot, userId: req.user?.id }]);
    notifyJournalChanged({ date: snapshot.orderDate, userId: req.user?.id });
    res.json({ message: 'Строка удалена' });
  } catch (error) {
    next(error);
  }
};

// ─────────────── Справочники реестра (статусы, типы КТК, НДС, операции) ───────────────

const serializeStatus = (status: DispatcherStatus) => ({
  id: status.id,
  name: status.name,
  color: status.color,
  textColor: status.textColor,
  sortOrder: status.sortOrder,
  isActive: status.isActive,
});

const serializeDictionaryItem = (item: DispatcherDictionaryItem) => ({
  id: item.id,
  kind: item.kind,
  name: item.name,
  color: item.color,
  textColor: item.textColor,
  sortOrder: item.sortOrder,
  isActive: item.isActive,
});

const requireName = (value: unknown, maxLength: number): string => {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) httpError(400, 'Укажите название');
  if (name.length > maxLength) httpError(400, `Название длиннее ${maxLength} символов`);
  return name;
};

const requireColor = (value: unknown): string => {
  const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^#[0-9a-f]{6}$/.test(color)) httpError(400, 'Цвет в формате #rrggbb');
  return color;
};

/** Необязательный цвет значения справочника: пусто — без заливки. */
const optionalColor = (value: unknown): string | null =>
  value == null || value === '' ? null : requireColor(value);

const requireKind = (value: unknown): DispatcherDictionaryKind => {
  if (!DISPATCHER_DICTIONARY_KINDS.includes(value as DispatcherDictionaryKind)) httpError(400, 'Неизвестный справочник');
  return value as DispatcherDictionaryKind;
};

const notifyDictionariesUpdated = (userId?: string) =>
  planWebSocketService.notifyDispatcherDictionariesUpdated({ userId });

/** Все справочники реестра, включая скрытые записи (для окна ведения справочников). */
export const listDispatcherDictionaries = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [statuses, items] = await Promise.all([
      statusRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } }),
      dictionaryRepository.find({ order: { kind: 'ASC', sortOrder: 'ASC', name: 'ASC' } }),
    ]);
    res.json({ statuses: statuses.map(serializeStatus), items: items.map(serializeDictionaryItem) });
  } catch (error) {
    next(error);
  }
};

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string })?.code === '23505';

export const createDispatcherStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = requireName(req.body?.name, 64);
    const color = requireColor(req.body?.color);
    const textColor = optionalColor(req.body?.textColor);
    const last = await statusRepository.find({ order: { sortOrder: 'DESC' }, take: 1 });
    const saved = await statusRepository.save(
      statusRepository.create({ name, color, textColor, sortOrder: (last[0]?.sortOrder ?? 0) + 10 }),
    );
    notifyDictionariesUpdated(req.user?.id);
    res.status(201).json(serializeStatus(saved));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(Object.assign(new Error('Такой статус уже есть'), { statusCode: 409 }));
      return;
    }
    next(error);
  }
};

export const updateDispatcherStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await statusRepository.findOne({ where: { id: req.params.id } });
    if (!status) return httpError(404, 'Статус не найден');
    const previousName = status.name;
    if (req.body?.name !== undefined) status.name = requireName(req.body.name, 64);
    if (req.body?.color !== undefined) status.color = requireColor(req.body.color);
    if (req.body?.textColor !== undefined) status.textColor = optionalColor(req.body.textColor);
    if (req.body?.isActive !== undefined) status.isActive = Boolean(req.body.isActive);
    await AppDataSource.transaction(async (manager) => {
      await manager.save(status);
      // заявки хранят статус текстом — переименование переносим в строки реестра
      if (previousName !== status.name) {
        await manager.update(DispatcherOrder, { status: previousName }, { status: status.name });
      }
    });
    notifyDictionariesUpdated(req.user?.id);
    res.json(serializeStatus(status));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(Object.assign(new Error('Такой статус уже есть'), { statusCode: 409 }));
      return;
    }
    next(error);
  }
};

export const deleteDispatcherStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await statusRepository.findOne({ where: { id: req.params.id } });
    if (!status) return httpError(404, 'Статус не найден');
    const used = await orderRepository.count({ where: { status: status.name } });
    if (used > 0) {
      return httpError(409, `Статус стоит в ${used} заявк${used === 1 ? 'е' : 'ах'} — его можно только скрыть`);
    }
    await statusRepository.remove(status);
    notifyDictionariesUpdated(req.user?.id);
    res.json({ message: 'Статус удалён' });
  } catch (error) {
    next(error);
  }
};

export const createDispatcherDictionaryItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kind = requireKind(req.body?.kind);
    const name = requireName(req.body?.name, dispatcherDictionaryNameLimit(kind));
    const last = await dictionaryRepository.find({ where: { kind }, order: { sortOrder: 'DESC' }, take: 1 });
    const saved = await dictionaryRepository.save(
      dictionaryRepository.create({
        kind,
        name,
        color: optionalColor(req.body?.color),
        textColor: optionalColor(req.body?.textColor),
        sortOrder: (last[0]?.sortOrder ?? 0) + 10,
      }),
    );
    notifyDictionariesUpdated(req.user?.id);
    res.status(201).json(serializeDictionaryItem(saved));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(Object.assign(new Error('Такое значение уже есть'), { statusCode: 409 }));
      return;
    }
    next(error);
  }
};

export const updateDispatcherDictionaryItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await dictionaryRepository.findOne({ where: { id: req.params.id } });
    if (!item) return httpError(404, 'Запись не найдена');
    if (req.body?.name !== undefined) {
      item.name = requireName(req.body.name, dispatcherDictionaryNameLimit(item.kind));
    }
    if (req.body?.color !== undefined) item.color = optionalColor(req.body.color);
    if (req.body?.textColor !== undefined) item.textColor = optionalColor(req.body.textColor);
    if (req.body?.isActive !== undefined) item.isActive = Boolean(req.body.isActive);
    await dictionaryRepository.save(item);
    notifyDictionariesUpdated(req.user?.id);
    res.json(serializeDictionaryItem(item));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(Object.assign(new Error('Такое значение уже есть'), { statusCode: 409 }));
      return;
    }
    next(error);
  }
};

export const deleteDispatcherDictionaryItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await dictionaryRepository.findOne({ where: { id: req.params.id } });
    if (!item) return httpError(404, 'Запись не найдена');
    await dictionaryRepository.remove(item);
    notifyDictionariesUpdated(req.user?.id);
    res.json({ message: 'Запись удалена' });
  } catch (error) {
    next(error);
  }
};

/** Порядок записей справочника: ids в нужном порядке (статусы — type=status). */
export const reorderDispatcherDictionary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : [];
    if (!ids.length) return httpError(400, 'Пустой список');
    const isStatus = req.body?.type === 'status';
    await AppDataSource.transaction(async (manager) => {
      for (let index = 0; index < ids.length; index += 1) {
        await manager.update(isStatus ? DispatcherStatus : DispatcherDictionaryItem, { id: ids[index] }, { sortOrder: (index + 1) * 10 });
      }
    });
    notifyDictionariesUpdated(req.user?.id);
    res.json({ message: 'Порядок сохранён' });
  } catch (error) {
    next(error);
  }
};

/**
 * Активные значения простых справочников для ячеек реестра:
 * { lists: { ktk_type: [...], ... }, colors: { vat: { 'НДС22%': { color, textColor } }, ... } }.
 */
export const listDispatcherDictionaryOptions = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await dictionaryRepository.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
    const lists: Record<string, string[]> = Object.fromEntries(DISPATCHER_DICTIONARY_KINDS.map((kind) => [kind, []]));
    const colors: Record<string, Record<string, { color: string | null; textColor: string | null }>> =
      Object.fromEntries(DISPATCHER_DICTIONARY_KINDS.map((kind) => [kind, {}]));
    items.forEach((item) => {
      (lists[item.kind] ??= []).push(item.name);
      if (item.color || item.textColor) {
        (colors[item.kind] ??= {})[item.name] = { color: item.color, textColor: item.textColor };
      }
    });
    res.json({ lists, colors });
  } catch (error) {
    next(error);
  }
};

/** Экипажи из графика контейнеровозов на дату: подстановка «водитель ⇄ госномер» в реестре. */
export const listDispatcherCrew = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = requireDate(req.query.date);
    const row = await previewStateRepository.findOne({ where: { scopeKey: KTK_VVO_SCHEDULE_SCOPE } });
    res.json(buildDispatcherCrew(row?.payload as Parameters<typeof buildDispatcherCrew>[0], date));
  } catch (error) {
    next(error);
  }
};

/**
 * Импорт google-таблицы (.xlsx, base64): dryRun — только разбор и сводка, без
 * dryRun — ЗАМЕНА реестра: все текущие заявки удаляются, загружается всё из
 * файла в порядке таблицы. Повторный импорт = «перенести таблицу заново».
 * Только администратор.
 */
export const importDispatcherOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const base64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64.replace(/^data:[^,]*,/, '') : '';
    if (!base64) return httpError(400, 'Файл не передан');
    let sheets;
    try {
      sheets = await parseDispatcherWorkbook(Buffer.from(base64, 'base64'));
    } catch {
      return httpError(400, 'Не удалось прочитать файл — нужна выгрузка google-таблицы в формате .xlsx');
    }
    const orders = sheets.flatMap((sheet) => sheet.orders);
    if (!orders.length) return httpError(400, 'В файле не найдено листов реестра (шапка со «статус» и «клиент») или заявок');

    const dates = orders.map((order) => order.orderDate).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const statuses = await statusRepository.find();
    const statusByLower = new Map(statuses.map((status) => [status.name.toLowerCase(), status.name]));
    const unknownStatuses = new Set<string>();
    orders.forEach((order) => {
      if (!order.status) return;
      const known = statusByLower.get(order.status.toLowerCase());
      if (known) order.status = known;
      else unknownStatuses.add(order.status);
    });
    // «НАЛ», «Перемещение» и т.п. — к написанию из справочников реестра (тогда работают цвета и расчёты)
    const dictionaryItems = await dictionaryRepository.find();
    const dictionaryByKind = new Map<string, Map<string, string>>();
    dictionaryItems.forEach((item) => {
      const map = dictionaryByKind.get(item.kind) ?? new Map<string, string>();
      map.set(item.name.toLowerCase(), item.name);
      dictionaryByKind.set(item.kind, map);
    });
    const DICTIONARY_FIELDS: Array<['vat' | 'operation' | 'ktkType' | 'client', DispatcherDictionaryKind]> = [
      ['client', 'client'],
      ['vat', 'vat'],
      ['operation', 'operation'],
      ['ktkType', 'ktk_type'],
    ];
    orders.forEach((order) => {
      DICTIONARY_FIELDS.forEach(([field, kind]) => {
        const raw = order[field];
        const known = raw ? dictionaryByKind.get(kind)?.get(raw.toLowerCase()) : undefined;
        if (known) order[field] = known;
      });
    });
    // импорт ЗАМЕНЯЕТ реестр целиком (решение 2026-09-14): текущие заявки удаляются
    const existingTotal = await orderRepository.count();

    const summary = {
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        orders: sheet.orders.length,
        skippedRows: sheet.skippedRows,
        undatedOrders: sheet.undatedOrders,
        from: sheet.orders.length ? sheet.orders.map((order) => order.orderDate).sort()[0] : null,
        to: sheet.orders.length ? sheet.orders.map((order) => order.orderDate).sort().slice(-1)[0] : null,
      })),
      total: orders.length,
      from,
      to,
      existingTotal,
      unknownStatuses: [...unknownStatuses].slice(0, 50),
    };

    if (req.body?.dryRun !== false) {
      res.json({ ...summary, imported: 0 });
      return;
    }

    // месяцы, где были заявки до замены, — чтобы открытые реестры перечитались
    const previousMonths: Array<{ month: string }> = await orderRepository
      .createQueryBuilder('o')
      .select("to_char(o.order_date, 'YYYY-MM')", 'month')
      .groupBy('month')
      .getRawMany();
    const userId = req.user?.id ?? null;
    const start = 10;
    await AppDataSource.transaction(async (manager) => {
      await manager.createQueryBuilder().delete().from(DispatcherOrder).execute();
      const chunkSize = 500;
      for (let index = 0; index < orders.length; index += chunkSize) {
        const chunk = orders.slice(index, index + chunkSize).map((order, offset) => manager.create(DispatcherOrder, {
          ...order,
          position: start + (index + offset) * 10,
          createdBy: userId,
          updatedBy: userId,
        }));
        await manager.save(chunk);
      }
      await assignMissingDispatcherOrderNumbers(manager);
    });
    // терминалы для выпадающих списков — из импортированных заявок (если справочник ещё пуст)
    await recordDispatcherChanges([{
      action: 'import',
      field: null,
      oldValue: `удалено заявок: ${existingTotal}`,
      newValue: `загружено заявок: ${orders.length} (${from.split('-').reverse().join('.')} — ${to.split('-').reverse().join('.')})`,
      userId: req.user?.id,
    }]);
    await ensureDispatcherDictionaryCatalog().catch(() => undefined);
    const months = new Set([
      ...dates.map((date) => `${date.slice(0, 7)}-01`),
      ...previousMonths.map((item) => `${item.month}-01`),
    ]);
    months.forEach((date) => notifyJournalChanged({ date, userId: req.user?.id }));
    res.json({ ...summary, imported: orders.length, deleted: existingTotal });
  } catch (error) {
    next(error);
  }
};

/**
 * История изменений реестра (администратор, руководитель КТК): фильтры —
 * период изменений (from/to), сотрудник (userId), заявка (orderId), поиск по
 * КТК/клиенту (q); постранично (before = createdAt последней записи).
 */
/** Сотрудники, которые хоть раз меняли реестр, — для фильтра истории (без загрузки самой истории). */
export const listDispatcherHistoryUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows: Array<{ userId: string }> = await AppDataSource.getRepository(DispatcherOrderChange)
      .createQueryBuilder('c')
      .select('c.user_id', 'userId')
      .where('c.user_id IS NOT NULL')
      .groupBy('c.user_id')
      .getRawMany();
    const names = await userNamesById(rows.map((row) => row.userId));
    res.json(
      rows
        .map((row) => ({ id: row.userId, name: names.get(row.userId) ?? '—' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    );
  } catch (error) {
    next(error);
  }
};

export const listDispatcherHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const query = AppDataSource.getRepository(DispatcherOrderChange)
      .createQueryBuilder('c')
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(limit + 1);
    if (typeof req.query.from === 'string' && DATE_PATTERN.test(req.query.from)) {
      query.andWhere('c.created_at >= :from', { from: `${req.query.from} 00:00:00` });
    }
    if (typeof req.query.to === 'string' && DATE_PATTERN.test(req.query.to)) {
      query.andWhere("c.created_at < (CAST(:to AS date) + interval '1 day')", { to: req.query.to });
    }
    if (typeof req.query.userId === 'string' && req.query.userId) query.andWhere('c.user_id = :userId', { userId: req.query.userId });
    if (typeof req.query.orderId === 'string' && req.query.orderId) query.andWhere('c.order_id = :orderId', { orderId: req.query.orderId });
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      query.andWhere('(c.ktk_number ILIKE :q OR c.client ILIKE :q)', { q: `%${req.query.q.trim()}%` });
    }
    if (typeof req.query.before === 'string' && req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) query.andWhere('c.created_at < :before', { before });
    }
    const rows = await query.getMany();
    const page = rows.slice(0, limit);
    const names = await userNamesById(page.map((row) => row.userId));
    res.json({
      items: page.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        action: row.action,
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue,
        orderDate: row.orderDate,
        ktkNumber: row.ktkNumber,
        client: row.client,
        userId: row.userId,
        userName: row.userId ? names.get(row.userId) ?? null : null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextBefore: rows.length > limit ? page[page.length - 1].createdAt.toISOString() : null,
    });
  } catch (error) {
    next(error);
  }
};
