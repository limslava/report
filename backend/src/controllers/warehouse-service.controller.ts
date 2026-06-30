import { NextFunction, Request, Response } from 'express';
import { EntityManager, LessThanOrEqual, MoreThan } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { WAREHOUSE_VEHICLE_TYPES } from '../constants/warehouse';
import { WarehouseClient } from '../models/warehouse-client.model';
import { WarehouseOperation } from '../models/warehouse-operation.model';
import { WarehousePerformedService } from '../models/warehouse-performed-service.model';
import { WarehouseServiceDefinition } from '../models/warehouse-service-definition.model';
import { WarehouseTariff } from '../models/warehouse-tariff.model';
import { WarehouseVehicle, WarehouseVehicleType } from '../models/warehouse-vehicle.model';
import { assertWarehouseDateIsOpen } from '../services/warehouse-billing-lock.service';

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
): Promise<WarehouseTariff | null> => manager.getRepository(WarehouseTariff)
  .createQueryBuilder('tariff')
  .where('tariff.serviceId = :serviceId', { serviceId })
  .andWhere('tariff.vehicleType = :vehicleType', { vehicleType })
  .andWhere('tariff.validFrom <= :onDate', { onDate })
  .andWhere('(tariff.validTo IS NULL OR tariff.validTo >= :onDate)', { onDate })
  .orderBy('tariff.validFrom', 'DESC')
  .getOne();

const serializeTariff = (tariff: WarehouseTariff | null) => tariff ? {
  id: tariff.id,
  vehicleType: tariff.vehicleType,
  price: Number(tariff.price),
  validFrom: tariff.validFrom,
  validTo: tariff.validTo,
} : null;

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
    const services = await AppDataSource.getRepository(WarehouseServiceDefinition).find({
      relations: { tariffs: true },
      order: { isOperational: 'ASC', name: 'ASC' },
    });
    res.json(services.map((service) => {
      const currentTariff = (vehicleType: WarehouseVehicleType) => service.tariffs
        .filter((tariff) => tariff.vehicleType === vehicleType
          && tariff.validFrom <= onDate
          && (!tariff.validTo || tariff.validTo >= onDate))
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
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
            serializeTariff(currentTariff(vehicleType)),
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
      if (!service) {
        const error: any = new Error('Услуга не найдена');
        error.statusCode = 404;
        throw error;
      }
      const vehicleType = req.body.vehicleType as WarehouseVehicleType;
      const validFrom = req.body.validFrom as string;
      const repository = manager.getRepository(WarehouseTariff);
      const sameDate = await repository.findOne({
        where: { serviceId: service.id, vehicleType, validFrom },
      });
      if (sameDate) {
        const error: any = new Error('Тариф на эту дату уже существует');
        error.statusCode = 409;
        throw error;
      }

      const previous = await repository.findOne({
        where: {
          serviceId: service.id,
          vehicleType,
          validFrom: LessThanOrEqual(validFrom),
        },
        order: { validFrom: 'DESC' },
      });
      if (previous && (!previous.validTo || previous.validTo >= validFrom)) {
        const previousDay = new Date(`${validFrom}T00:00:00Z`);
        previousDay.setUTCDate(previousDay.getUTCDate() - 1);
        previous.validTo = previousDay.toISOString().slice(0, 10);
        await repository.save(previous);
      }

      const nextTariff = await repository.findOne({
        where: {
          serviceId: service.id,
          vehicleType,
          validFrom: MoreThan(validFrom),
        },
        order: { validFrom: 'ASC' },
      });
      let validTo: string | null = null;
      if (nextTariff) {
        const previousDay = new Date(`${nextTariff.validFrom}T00:00:00Z`);
        previousDay.setUTCDate(previousDay.getUTCDate() - 1);
        validTo = previousDay.toISOString().slice(0, 10);
      }

      return repository.save(repository.create({
        serviceId: service.id,
        vehicleType,
        price: String(req.body.price),
        validFrom,
        validTo,
        createdById: req.user!.id,
      }));
    });
    res.status(201).json(serializeTariff(result));
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
      const tariff = await findCurrentTariff(manager, service.id, vehicle.vehicleType, onDate);
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
