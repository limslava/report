import { NextFunction, Request, Response } from 'express';
import { Brackets, EntityManager, ILike } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Counterparty } from '../models/counterparty.model';
import { Contract } from '../models/contract.model';
import { WarehouseOperation, WarehouseOperationType } from '../models/warehouse-operation.model';
import { WarehouseStorageRequest } from '../models/warehouse-storage-request.model';
import {
  WarehouseVehicle,
  WarehouseVehicleType,
} from '../models/warehouse-vehicle.model';

const normalizeNullable = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const calendarDaysInclusive = (from: string, to: string): number => {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.max(1, Math.floor((toMs - fromMs) / 86_400_000) + 1);
};

const todayDate = (): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
};

const serializeVehicle = (vehicle: WarehouseVehicle) => ({
  id: vehicle.id,
  warehouseNumber: vehicle.warehouseNumber,
  counterpartyId: vehicle.counterpartyId,
  counterparty: vehicle.counterparty
    ? {
        id: vehicle.counterparty.id,
        inn: vehicle.counterparty.inn,
        nameFull: vehicle.counterparty.nameFull,
        nameShort: vehicle.counterparty.nameShort,
      }
    : null,
  storageRequestId: vehicle.storageRequestId,
  requestNumber: vehicle.storageRequest?.requestNumber ?? null,
  requestDate: vehicle.storageRequest?.requestDate ?? null,
  vehicleType: vehicle.vehicleType,
  vin: vehicle.vin,
  chassisNumber: vehicle.chassisNumber,
  brand: vehicle.brand,
  model: vehicle.model,
  registrationNumber: vehicle.registrationNumber,
  receivedDate: vehicle.receivedDate,
  issuedDate: vehicle.issuedDate,
  fuelLevelPercent: vehicle.fuelLevelPercent,
  status: vehicle.status,
  notes: vehicle.notes,
  storageDays: calendarDaysInclusive(vehicle.receivedDate, vehicle.issuedDate ?? todayDate()),
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
});

const addOperation = async (
  manager: EntityManager,
  vehicle: WarehouseVehicle,
  req: Request,
  type: WarehouseOperationType,
  details: Record<string, unknown> | null,
) => {
  const operationRepository = manager.getRepository(WarehouseOperation);
  await operationRepository.save(operationRepository.create({
    vehicleId: vehicle.id,
    type,
    actorUserId: req.user!.id,
    actorName: req.user!.fullName,
    details,
  }));
};

const generateWarehouseNumber = async (manager: EntityManager, year: number): Promise<string> => {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`warehouse-number-${year}`]);
  const prefix = `СКЛ-${year}-`;
  const rows = await manager.query(
    `SELECT warehouse_number
       FROM warehouse_vehicles
      WHERE warehouse_number LIKE $1
      ORDER BY warehouse_number DESC
      LIMIT 1`,
    [`${prefix}%`],
  ) as Array<{ warehouse_number: string }>;
  const lastSequence = rows.length > 0
    ? Number(rows[0].warehouse_number.slice(prefix.length))
    : 0;
  return `${prefix}${String(lastSequence + 1).padStart(6, '0')}`;
};

const resolveStorageRequest = async (
  manager: EntityManager,
  payload: {
    counterpartyId: string;
    requestNumber?: string | null;
    requestDate?: string | null;
  },
  createdById: string,
): Promise<WarehouseStorageRequest | null> => {
  const requestNumber = normalizeNullable(payload.requestNumber);
  if (!requestNumber) return null;

  const repository = manager.getRepository(WarehouseStorageRequest);
  const existing = await repository.findOne({
    where: {
      counterpartyId: payload.counterpartyId,
      requestNumber,
    },
  });
  if (existing) return existing;

  return repository.save(repository.create({
    counterpartyId: payload.counterpartyId,
    requestNumber,
    requestDate: payload.requestDate || todayDate(),
    status: 'open',
    notes: null,
    createdById,
  }));
};

export const listWarehouseCounterparties = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const repository = AppDataSource.getRepository(Counterparty);
    const where = q
      ? [
          { nameFull: ILike(`%${q}%`) },
          { nameShort: ILike(`%${q}%`) },
          { inn: ILike(`${q}%`) },
        ]
      : undefined;
    const items = await repository.find({
      where,
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    res.json(items.map((item) => ({
      id: item.id,
      inn: item.inn,
      nameFull: item.nameFull,
      nameShort: item.nameShort,
    })));
  } catch (error) {
    next(error);
  }
};

export const importWarehouseCounterparty = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inn = String(req.body.inn ?? '').trim();
    const counterpartyRepository = AppDataSource.getRepository(Counterparty);
    const existing = await counterpartyRepository.findOne({ where: { inn } });
    if (existing) {
      res.json(existing);
      return;
    }

    const contractRepository = AppDataSource.getRepository(Contract);
    const contract = await contractRepository.findOne({
      where: { counterpartyInn: inn },
      order: { updatedAt: 'DESC' },
    });
    if (!contract) {
      res.status(404).json({
        message: 'Контрагент отсутствует в справочнике и договорах. Сначала добавьте его через договор.',
      });
      return;
    }

    const saved = await counterpartyRepository.save(counterpartyRepository.create({
      inn: contract.counterpartyInn,
      nameFull: contract.counterpartyName,
      nameShort: contract.counterpartyShortName,
      counterpartyForm: contract.counterpartyForm,
      ogrn: null,
      kpp: null,
      address: null,
      source: 'manual',
      sourcePayload: { importedFromContractId: contract.id },
    }));
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

export const listWarehouseVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const status = normalizeNullable(req.query.status);
    const vehicleType = normalizeNullable(req.query.vehicleType);
    const counterpartyId = normalizeNullable(req.query.counterpartyId);

    const query = AppDataSource.getRepository(WarehouseVehicle)
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.counterparty', 'counterparty')
      .leftJoinAndSelect('vehicle.storageRequest', 'storageRequest')
      .orderBy('vehicle.createdAt', 'DESC');

    if (q) {
      query.andWhere(new Brackets((builder) => {
        builder
          .where('vehicle.warehouseNumber ILIKE :q', { q: `%${q}%` })
          .orWhere('vehicle.vin ILIKE :q', { q: `%${q}%` })
          .orWhere('vehicle.registrationNumber ILIKE :q', { q: `%${q}%` })
          .orWhere('vehicle.brand ILIKE :q', { q: `%${q}%` })
          .orWhere('vehicle.model ILIKE :q', { q: `%${q}%` });
      }));
    }
    if (status) query.andWhere('vehicle.status = :status', { status });
    if (vehicleType) query.andWhere('vehicle.vehicleType = :vehicleType', { vehicleType });
    if (counterpartyId) query.andWhere('vehicle.counterpartyId = :counterpartyId', { counterpartyId });

    const items = await query.getMany();
    res.json(items.map(serializeVehicle));
  } catch (error) {
    next(error);
  }
};

export const getWarehouseVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vehicle = await AppDataSource.getRepository(WarehouseVehicle).findOne({
      where: { id: req.params.id },
      relations: {
        counterparty: true,
        storageRequest: true,
        operations: true,
      },
      order: { operations: { createdAt: 'DESC' } },
    });
    if (!vehicle) {
      res.status(404).json({ message: 'Карточка ТС не найдена' });
      return;
    }
    res.json({
      ...serializeVehicle(vehicle),
      operations: vehicle.operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        actorName: operation.actorName,
        details: operation.details,
        createdAt: operation.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const createWarehouseVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const counterparty = await manager.getRepository(Counterparty).findOne({
        where: { id: req.body.counterpartyId },
      });
      if (!counterparty) {
        const error: any = new Error('Контрагент не найден');
        error.statusCode = 400;
        throw error;
      }

      const receivedDate = req.body.receivedDate as string;
      const request = await resolveStorageRequest(manager, {
        counterpartyId: counterparty.id,
        requestNumber: req.body.requestNumber,
        requestDate: req.body.requestDate,
      }, req.user!.id);
      const repository = manager.getRepository(WarehouseVehicle);
      const vehicle = repository.create({
        warehouseNumber: await generateWarehouseNumber(manager, Number(receivedDate.slice(0, 4))),
        counterpartyId: counterparty.id,
        storageRequestId: request?.id ?? null,
        vehicleType: req.body.vehicleType as WarehouseVehicleType,
        vin: normalizeNullable(req.body.vin)?.toUpperCase() ?? null,
        chassisNumber: normalizeNullable(req.body.chassisNumber),
        brand: String(req.body.brand).trim(),
        model: String(req.body.model).trim(),
        registrationNumber: normalizeNullable(req.body.registrationNumber)?.toUpperCase() ?? null,
        receivedDate,
        issuedDate: null,
        fuelLevelPercent: req.body.fuelLevelPercent ?? null,
        status: 'on_site',
        notes: normalizeNullable(req.body.notes),
        createdById: req.user!.id,
        updatedById: req.user!.id,
      });
      const saved = await repository.save(vehicle);
      await addOperation(manager, saved, req, 'created', {
        status: saved.status,
        receivedDate: saved.receivedDate,
      });
      return repository.findOneOrFail({
        where: { id: saved.id },
        relations: { counterparty: true, storageRequest: true },
      });
    });
    res.status(201).json(serializeVehicle(result));
  } catch (error) {
    next(error);
  }
};

export const updateWarehouseVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WarehouseVehicle);
      const vehicle = await repository.findOne({
        where: { id: req.params.id },
        relations: { counterparty: true, storageRequest: true },
      });
      if (!vehicle) {
        const error: any = new Error('Карточка ТС не найдена');
        error.statusCode = 404;
        throw error;
      }
      if (vehicle.status === 'issued') {
        const error: any = new Error('Выданную карточку нельзя редактировать');
        error.statusCode = 409;
        throw error;
      }

      const before = serializeVehicle(vehicle);
      if (req.body.vehicleType !== undefined) vehicle.vehicleType = req.body.vehicleType;
      if (req.body.vin !== undefined) vehicle.vin = normalizeNullable(req.body.vin)?.toUpperCase() ?? null;
      if (req.body.chassisNumber !== undefined) vehicle.chassisNumber = normalizeNullable(req.body.chassisNumber);
      if (req.body.brand !== undefined) vehicle.brand = String(req.body.brand).trim();
      if (req.body.model !== undefined) vehicle.model = String(req.body.model).trim();
      if (req.body.registrationNumber !== undefined) {
        vehicle.registrationNumber = normalizeNullable(req.body.registrationNumber)?.toUpperCase() ?? null;
      }
      if (req.body.receivedDate !== undefined) vehicle.receivedDate = req.body.receivedDate;
      if (req.body.fuelLevelPercent !== undefined) vehicle.fuelLevelPercent = req.body.fuelLevelPercent;
      if (req.body.notes !== undefined) vehicle.notes = normalizeNullable(req.body.notes);
      vehicle.updatedById = req.user!.id;
      await repository.save(vehicle);
      await addOperation(manager, vehicle, req, 'updated', {
        before,
        after: serializeVehicle(vehicle),
      });
      return repository.findOneOrFail({
        where: { id: vehicle.id },
        relations: { counterparty: true, storageRequest: true },
      });
    });
    res.json(serializeVehicle(result));
  } catch (error) {
    next(error);
  }
};

export const issueWarehouseVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const issuedDate = req.body.issuedDate as string;
    const result = await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WarehouseVehicle);
      const vehicle = await repository.findOne({
        where: { id: req.params.id },
        relations: { counterparty: true, storageRequest: true },
      });
      if (!vehicle) {
        const error: any = new Error('Карточка ТС не найдена');
        error.statusCode = 404;
        throw error;
      }
      if (vehicle.status === 'issued') {
        const error: any = new Error('ТС уже выдано');
        error.statusCode = 409;
        throw error;
      }
      if (issuedDate < vehicle.receivedDate) {
        const error: any = new Error('Дата выдачи не может быть раньше даты приёмки');
        error.statusCode = 400;
        throw error;
      }

      vehicle.issuedDate = issuedDate;
      vehicle.status = 'issued';
      vehicle.updatedById = req.user!.id;
      await repository.save(vehicle);
      await addOperation(manager, vehicle, req, 'issued', {
        issuedDate,
        storageDays: calendarDaysInclusive(vehicle.receivedDate, issuedDate),
      });
      return vehicle;
    });
    res.json(serializeVehicle(result));
  } catch (error) {
    next(error);
  }
};
