import { Request, Response, NextFunction } from 'express';
import { Between } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { DispatcherOrder } from '../models/dispatcher-order.model';
import { DispatcherStatus } from '../models/dispatcher-status.model';
import { planWebSocketService } from '../services/websocket.service';

const orderRepository = AppDataSource.getRepository(DispatcherOrder);
const statusRepository = AppDataSource.getRepository(DispatcherStatus);

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
    res.json(statuses.map((status) => ({ id: status.id, name: status.name, color: status.color })));
  } catch (error) {
    next(error);
  }
};

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** Заявки за месяц — сплошная таблица, как её ведут диспетчера в google. */
export const listDispatcherOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month;
    if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
      const error: any = new Error('Некорректный месяц (ожидается YYYY-MM)');
      error.statusCode = 400;
      throw error;
    }
    const [year, monthNo] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNo, 0).getDate();
    const orders = await orderRepository.find({
      where: { orderDate: Between(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`) },
      order: { orderDate: 'ASC', createdAt: 'ASC' },
    });
    res.json(orders.map(serializeOrder));
  } catch (error) {
    next(error);
  }
};

export const createDispatcherOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = requireDate(req.body?.orderDate);
    const order = orderRepository.create({
      orderDate: date,
      status: 'новая',
      createdBy: req.user?.id ?? null,
      updatedBy: req.user?.id ?? null,
    });
    // Начальные значения (вставка строк из Excel): та же белая схема полей, что и в PATCH.
    const initial = (req.body ?? {}) as Record<string, unknown>;
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
