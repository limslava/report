import { NextFunction, Request, Response } from 'express';
import { EntityManager, IsNull, LessThanOrEqual, MoreThan, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  WAREHOUSE_FINANCE_VIEW_ROLES,
  WAREHOUSE_VEHICLE_TYPES,
} from '../constants/warehouse';
import { WarehouseClient } from '../models/warehouse-client.model';
import { WarehouseOperation } from '../models/warehouse-operation.model';
import { WarehousePerformedService } from '../models/warehouse-performed-service.model';
import { WarehouseServiceDefinition } from '../models/warehouse-service-definition.model';
import { WarehouseTariff } from '../models/warehouse-tariff.model';
import { WarehouseVehicle, WarehouseVehicleType } from '../models/warehouse-vehicle.model';
import { assertWarehouseDateIsOpen } from '../services/warehouse-billing-lock.service';
import { pickWarehouseTariff } from '../services/warehouse-billing.service';

const normalizeNullable = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const dateOnly = (value: Date | string): string => {
  if (typeof value === 'string') return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const AUTOMATIC_OPERATION_CODES = new Set(['vehicle_acceptance', 'vehicle_issue']);

const getScopedCounterpartyId = async (req: Request): Promise<string | null> => {
  if (req.user?.role !== 'counterparty_user') return null;
  if (!req.user.warehouseClientId) {
    const error: any = new Error('Пользователь не привязан к клиенту склада');
    error.statusCode = 403;
    throw error;
  }
  const client = await AppDataSource.getRepository(WarehouseClient).findOne({
    where: { id: req.user.warehouseClientId, isActive: true },
  });
  if (!client) {
    const error: any = new Error('Клиент склада неактивен или не найден');
    error.statusCode = 403;
    throw error;
  }
  return client.counterpartyId;
};

const findVehicleInScope = async (req: Request): Promise<WarehouseVehicle> => {
  const vehicle = await AppDataSource.getRepository(WarehouseVehicle).findOne({
    where: { id: req.params.id },
    relations: { counterparty: true },
  });
  const scopedCounterpartyId = await getScopedCounterpartyId(req);
  if (!vehicle || (scopedCounterpartyId && vehicle.counterpartyId !== scopedCounterpartyId)) {
    const error: any = new Error('Карточка ТС не найдена');
    error.statusCode = 404;
    throw error;
  }
  return vehicle;
};

const findCurrentTariff = async (
  manager: EntityManager,
  serviceId: string,
  vehicleType: WarehouseVehicleType,
  onDate: string,
  counterpartyId?: string | null,
): Promise<WarehouseTariff | null> => {
  const query = manager.getRepository(WarehouseTariff)
    .createQueryBuilder('tariff')
    .where('tariff.serviceId = :serviceId', { serviceId })
    .andWhere('tariff.vehicleType = :vehicleType', { vehicleType })
    .andWhere('tariff.validFrom <= :onDate', { onDate })
    .andWhere('(tariff.validTo IS NULL OR tariff.validTo >= :onDate)', { onDate });
  if (counterpartyId) {
    query.andWhere('(tariff.counterpartyId IS NULL OR tariff.counterpartyId = :counterpartyId)', { counterpartyId });
  } else {
    query.andWhere('tariff.counterpartyId IS NULL');
  }
  return pickWarehouseTariff(await query.getMany(), vehicleType, onDate, counterpartyId);
};

const serializeTariff = (tariff: WarehouseTariff | null) => tariff ? {
  id: tariff.id,
  vehicleType: tariff.vehicleType,
  price: Number(tariff.price),
  validFrom: tariff.validFrom,
  validTo: tariff.validTo,
  counterpartyId: tariff.counterpartyId ?? null,
  isIndividual: Boolean(tariff.counterpartyId),
} : null;

const httpError = (statusCode: number, message: string) => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const dayBefore = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

/** Индивидуальный тариф заводится только для зарегистрированного клиента склада. */
const assertWarehouseClientCounterparty = async (
  manager: EntityManager,
  counterpartyId: string,
): Promise<void> => {
  const client = await manager.getRepository(WarehouseClient).findOne({ where: { counterpartyId } });
  if (!client) throw httpError(404, 'Клиент склада не найден');
};

const serializePerformed = (item: WarehousePerformedService) => ({
  id: item.id,
  vehicleId: item.vehicleId,
  serviceId: item.serviceId,
  serviceCode: item.service.code,
  serviceName: item.service.name,
  performedAt: item.performedAt,
  quantity: Number(item.quantity),
  unitPrice: Number(item.unitPrice),
  totalAmount: Number(item.totalAmount),
  unit: item.unit,
  performedByName: item.performedByName,
  comment: item.comment,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const addAuditOperation = async (
  manager: EntityManager,
  req: Request,
  vehicleId: string,
  type: 'service_performed' | 'service_corrected',
  details: Record<string, unknown>,
) => {
  const repository = manager.getRepository(WarehouseOperation);
  await repository.save(repository.create({
    vehicleId,
    type,
    actorUserId: req.user!.id,
    actorName: req.user!.fullName,
    details,
  }));
};

export const listWarehouseServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const onDate = String(req.query.onDate || new Date().toISOString().slice(0, 10));
    // Цены конкретного клиента видят только финансовые/управленческие роли —
    // кладовщик и сам контрагент получают базовый прайс.
    const counterpartyId = WAREHOUSE_FINANCE_VIEW_ROLES.includes(req.user?.role as never)
      ? normalizeNullable(req.query.counterpartyId)
      : null;
    const services = await AppDataSource.getRepository(WarehouseServiceDefinition).find({
      relations: { tariffs: true },
      order: { isOperational: 'ASC', name: 'ASC' },
    });
    res.json(services.map((service) => {
      const scopedTariffs = service.tariffs.filter(
        (tariff) => !tariff.counterpartyId || tariff.counterpartyId === counterpartyId,
      );
      return {
        id: service.id,
        code: service.code,
        name: service.name,
        unit: service.unit,
        defaultQuantity: service.defaultQuantity === null ? null : Number(service.defaultQuantity),
        isRepeatable: service.isRepeatable,
        isOperational: service.isOperational,
        isActive: service.isActive,
        currentTariffs: Object.fromEntries(
          WAREHOUSE_VEHICLE_TYPES.map((vehicleType) => [
            vehicleType,
            serializeTariff(pickWarehouseTariff(scopedTariffs, vehicleType, onDate, counterpartyId)),
          ]),
        ),
        baseTariffs: Object.fromEntries(
          WAREHOUSE_VEHICLE_TYPES.map((vehicleType) => [
            vehicleType,
            serializeTariff(pickWarehouseTariff(scopedTariffs, vehicleType, onDate, null)),
          ]),
        ),
      };
    }));
  } catch (error) {
    next(error);
  }
};

export const updateWarehouseService = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const repository = AppDataSource.getRepository(WarehouseServiceDefinition);
    const service = await repository.findOne({ where: { id: req.params.serviceId } });
    if (!service) {
      res.status(404).json({ message: 'Услуга не найдена' });
      return;
    }
    if (req.body.defaultQuantity !== undefined) {
      service.defaultQuantity = req.body.defaultQuantity === null
        ? null
        : String(req.body.defaultQuantity);
    }
    if (req.body.isActive !== undefined) service.isActive = req.body.isActive;
    await repository.save(service);
    res.json({
      id: service.id,
      defaultQuantity: Number(service.defaultQuantity),
      isActive: service.isActive,
    });
  } catch (error) {
    next(error);
  }
};

export const createWarehouseTariff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const service = await manager.getRepository(WarehouseServiceDefinition).findOne({
        where: { id: req.params.serviceId },
      });
      if (!service) throw httpError(404, 'Услуга не найдена');

      const vehicleType = req.body.vehicleType as WarehouseVehicleType;
      const validFrom = req.body.validFrom as string;
      const repository = manager.getRepository(WarehouseTariff);
      // базовая линейка цен; ставки клиентов ведутся целыми прайсами (см. saveWarehouseClientPriceList)
      const scope = { serviceId: service.id, vehicleType, counterpartyId: IsNull() };
      const sameDate = await repository.findOne({ where: { ...scope, validFrom } });
      if (sameDate) throw httpError(409, 'Тариф на эту дату уже существует');

      const previous = await repository.findOne({
        where: { ...scope, validFrom: LessThanOrEqual(validFrom) },
        order: { validFrom: 'DESC' },
      });
      if (previous && (!previous.validTo || previous.validTo >= validFrom)) {
        previous.validTo = dayBefore(validFrom);
        await repository.save(previous);
      }

      const nextTariff = await repository.findOne({
        where: { ...scope, validFrom: MoreThan(validFrom) },
        order: { validFrom: 'ASC' },
      });

      return repository.save(repository.create({
        serviceId: service.id,
        counterpartyId: null,
        vehicleType,
        price: String(req.body.price),
        validFrom,
        validTo: nextTariff ? dayBefore(nextTariff.validFrom) : null,
        createdById: req.user!.id,
      }));
    });
    res.status(201).json(serializeTariff(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Прайсы клиента по версиям (дата начала). Одна версия — полный набор ставок
 * клиента, заведённый с одной даты (решение 2026-09-14: ставки клиента меняются
 * целиком, не по позициям). Последняя версия — первой.
 */
export const listWarehouseClientPriceLists = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const counterpartyId = String(req.query.counterpartyId);
    const tariffs = await AppDataSource.getRepository(WarehouseTariff)
      .createQueryBuilder('tariff')
      .innerJoinAndSelect('tariff.service', 'service')
      .where('tariff.counterpartyId = :counterpartyId', { counterpartyId })
      .orderBy('tariff.validFrom', 'DESC')
      .addOrderBy('service.name', 'ASC')
      .getMany();
    const versions = new Map<string, {
      validFrom: string;
      validTo: string | null;
      items: Array<{ serviceId: string; serviceName: string; unit: string; vehicleType: WarehouseVehicleType; price: number }>;
    }>();
    tariffs.forEach((tariff) => {
      const version = versions.get(tariff.validFrom) ?? { validFrom: tariff.validFrom, validTo: tariff.validTo, items: [] };
      // у версии одна дата окончания; на случай расхождений берём самую позднюю
      if (!tariff.validTo || (version.validTo && tariff.validTo > version.validTo)) version.validTo = tariff.validTo;
      version.items.push({
        serviceId: tariff.serviceId,
        serviceName: tariff.service.name,
        unit: tariff.service.unit,
        vehicleType: tariff.vehicleType,
        price: Number(tariff.price),
      });
      versions.set(tariff.validFrom, version);
    });
    res.json(Array.from(versions.values()));
  } catch (error) {
    next(error);
  }
};

/**
 * Новый прайс клиента с даты: весь набор ставок одной версией. Действующая на
 * дату версия закрывается днём раньше; версия с той же датой заменяется целиком;
 * если позже уже заведена следующая версия — новая действует до неё.
 * Позиция без цены в прайсе клиента считается по базовому тарифу.
 */
export const saveWarehouseClientPriceList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const counterpartyId = String(req.body.counterpartyId);
    const validFrom = String(req.body.validFrom);
    const prices = (req.body.prices ?? []) as Array<{ serviceId: string; vehicleType: WarehouseVehicleType; price: number }>;
    const result = await AppDataSource.transaction(async (manager) => {
      await assertWarehouseClientCounterparty(manager, counterpartyId);
      const repository = manager.getRepository(WarehouseTariff);

      const serviceIds = new Set(
        (await manager.getRepository(WarehouseServiceDefinition).find({ select: ['id'] })).map((service) => service.id),
      );
      const seen = new Set<string>();
      for (const item of prices) {
        if (!serviceIds.has(item.serviceId)) throw httpError(400, 'В прайсе указана неизвестная услуга');
        const key = `${item.serviceId}:${item.vehicleType}`;
        if (seen.has(key)) throw httpError(400, 'В прайсе повторяется позиция услуги и типа ТС');
        seen.add(key);
      }

      await repository.delete({ counterpartyId, validFrom });
      const nextVersion = await repository.findOne({
        where: { counterpartyId, validFrom: MoreThan(validFrom) },
        order: { validFrom: 'ASC' },
      });
      const active = await repository.find({
        where: { counterpartyId, validFrom: LessThanOrEqual(validFrom) },
      });
      const toClose = active.filter((tariff) => !tariff.validTo || tariff.validTo >= validFrom);
      toClose.forEach((tariff) => { tariff.validTo = dayBefore(validFrom); });
      if (toClose.length) await repository.save(toClose);

      const validTo = nextVersion ? dayBefore(nextVersion.validFrom) : null;
      const created = prices.length
        ? await repository.save(prices.map((item) => repository.create({
          serviceId: item.serviceId,
          counterpartyId,
          vehicleType: item.vehicleType,
          price: String(item.price),
          validFrom,
          validTo,
          createdById: req.user!.id,
        })))
        : [];
      return { validFrom, validTo, positions: created.length, closedPrevious: toClose.length > 0 };
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * «Вернуть базовый прайс» с даты: прайс клиента, действующий на дату,
 * закрывается днём раньше, более поздние версии удаляются. Начисленные
 * услуги и закрытые периоды не пересчитываются.
 */
export const endWarehouseClientPriceList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const counterpartyId = String(req.body.counterpartyId);
    const fromDate = String(req.body.fromDate);
    const result = await AppDataSource.transaction(async (manager) => {
      await assertWarehouseClientCounterparty(manager, counterpartyId);
      const repository = manager.getRepository(WarehouseTariff);
      const future = await repository.find({ where: { counterpartyId, validFrom: MoreThanOrEqual(fromDate) } });
      if (future.length) await repository.remove(future);
      const active = (await repository.find({ where: { counterpartyId, validFrom: LessThanOrEqual(fromDate) } }))
        .filter((tariff) => !tariff.validTo || tariff.validTo >= fromDate);
      active.forEach((tariff) => { tariff.validTo = dayBefore(fromDate); });
      if (active.length) await repository.save(active);
      return { removedVersions: new Set(future.map((tariff) => tariff.validFrom)).size, closedPositions: active.length };
    });
    if (!result.removedVersions && !result.closedPositions) {
      res.status(404).json({ message: 'На эту дату у клиента нет индивидуального прайса — уже действует базовый' });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const listWarehousePerformedServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vehicle = await findVehicleInScope(req);
    const items = await AppDataSource.getRepository(WarehousePerformedService).find({
      where: { vehicleId: vehicle.id },
      relations: { service: true },
      order: { performedAt: 'DESC', createdAt: 'DESC' },
    });
    res.json(items.map(serializePerformed));
  } catch (error) {
    next(error);
  }
};

export const performWarehouseService = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vehicle = await findVehicleInScope(req);
    if (vehicle.status !== 'on_site') {
      res.status(409).json({ message: 'Услуги можно фиксировать только для ТС на стоянке' });
      return;
    }
    const result = await AppDataSource.transaction(async (manager) => {
      const service = await manager.getRepository(WarehouseServiceDefinition).findOne({
        where: { id: req.body.serviceId, isActive: true, isOperational: true },
      });
      if (!service) {
        const error: any = new Error('Доступная услуга не найдена');
        error.statusCode = 404;
        throw error;
      }
      if (AUTOMATIC_OPERATION_CODES.has(service.code)) {
        const error: any = new Error(
          `Услуга «${service.name}» начисляется автоматически по факту складской операции`,
        );
        error.statusCode = 409;
        throw error;
      }
      const performedAt = new Date(req.body.performedAt);
      const onDate = dateOnly(performedAt);
      await assertWarehouseDateIsOpen(vehicle.counterpartyId, onDate);
      if (onDate < vehicle.receivedDate) {
        const error: any = new Error('Услуга не может быть выполнена раньше приёмки ТС');
        error.statusCode = 400;
        throw error;
      }
      const tariff = await findCurrentTariff(manager, service.id, vehicle.vehicleType, onDate, vehicle.counterpartyId);
      if (service.code === 'refuel' && req.body.quantity === undefined) {
        const error: any = new Error('Укажите фактическое количество залитых литров');
        error.statusCode = 409;
        throw error;
      }
      const quantity = Number(req.body.quantity ?? service.defaultQuantity ?? 1);
      const unitPrice = tariff ? Number(tariff.price) : 0;
      const totalAmount = roundMoney(quantity * unitPrice);
      const repository = manager.getRepository(WarehousePerformedService);
      const saved = await repository.save(repository.create({
        vehicleId: vehicle.id,
        serviceId: service.id,
        performedAt,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        totalAmount: String(totalAmount),
        unit: service.unit,
        performedById: req.user!.id,
        performedByName: req.user!.fullName,
        updatedById: req.user!.id,
        comment: normalizeNullable(req.body.comment),
      }));
      await addAuditOperation(manager, req, vehicle.id, 'service_performed', {
        performedServiceId: saved.id,
        serviceName: service.name,
        quantity,
        unitPrice,
        totalAmount,
        tariffMissing: !tariff,
        individualTariff: Boolean(tariff?.counterpartyId),
        performedDate: onDate,
      });
      return repository.findOneOrFail({
        where: { id: saved.id },
        relations: { service: true },
      });
    });
    res.status(201).json(serializePerformed(result));
  } catch (error) {
    next(error);
  }
};

export const correctWarehousePerformedService = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vehicle = await findVehicleInScope(req);
    const result = await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WarehousePerformedService);
      const item = await repository.findOne({
        where: { id: req.params.performedServiceId, vehicleId: vehicle.id },
        relations: { service: true },
      });
      if (!item) {
        const error: any = new Error('Начисленная услуга не найдена');
        error.statusCode = 404;
        throw error;
      }
      const before = {
        quantity: Number(item.quantity),
        totalAmount: Number(item.totalAmount),
        comment: item.comment,
      };
      await assertWarehouseDateIsOpen(vehicle.counterpartyId, dateOnly(item.performedAt));
      if (req.body.quantity !== undefined) item.quantity = String(req.body.quantity);
      if (req.body.comment !== undefined) item.comment = normalizeNullable(req.body.comment);
      item.totalAmount = String(roundMoney(Number(item.quantity) * Number(item.unitPrice)));
      item.updatedById = req.user!.id;
      await repository.save(item);
      await addAuditOperation(manager, req, vehicle.id, 'service_corrected', {
        performedServiceId: item.id,
        serviceName: item.service.name,
        before,
        after: {
          quantity: Number(item.quantity),
          totalAmount: Number(item.totalAmount),
          comment: item.comment,
        },
      });
      return item;
    });
    res.json(serializePerformed(result));
  } catch (error) {
    next(error);
  }
};
