import { Request, Response, NextFunction } from 'express';
import { Between } from 'typeorm';
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
import { ensureDispatcherDictionaryCatalog } from '../services/dispatcher-status-seed.service';
import { planWebSocketService } from '../services/websocket.service';

const orderRepository = AppDataSource.getRepository(DispatcherOrder);
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
    res.json(orders.map(serializeOrder));
  } catch (error) {
    next(error);
  }
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
    const saved = await orderRepository.save(order);
    planWebSocketService.notifyDispatcherJournalUpdated({ date, userId: req.user?.id });
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
    const saved = await orderRepository.save(orders);
    planWebSocketService.notifyDispatcherJournalUpdated({ date, userId: req.user?.id });
    res.status(201).json(saved.map(serializeOrder));
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
    let changed = false;
    const previousDate = order.orderDate;
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
      planWebSocketService.notifyDispatcherJournalUpdated({ date: order.orderDate, userId: req.user?.id });
      if (previousDate !== order.orderDate) {
        planWebSocketService.notifyDispatcherJournalUpdated({ date: previousDate, userId: req.user?.id });
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
    await orderRepository.remove(order);
    planWebSocketService.notifyDispatcherJournalUpdated({ date: order.orderDate, userId: req.user?.id });
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
    const DICTIONARY_FIELDS: Array<['vat' | 'operation' | 'ktkType', DispatcherDictionaryKind]> = [
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
    });
    // терминалы для выпадающих списков — из импортированных заявок (если справочник ещё пуст)
    await ensureDispatcherDictionaryCatalog().catch(() => undefined);
    const months = new Set([
      ...dates.map((date) => `${date.slice(0, 7)}-01`),
      ...previousMonths.map((item) => `${item.month}-01`),
    ]);
    months.forEach((date) => planWebSocketService.notifyDispatcherJournalUpdated({ date, userId: req.user?.id }));
    res.json({ ...summary, imported: orders.length, deleted: existingTotal });
  } catch (error) {
    next(error);
  }
};
