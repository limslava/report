import { NextFunction, Request, Response } from 'express';
import { ILike } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Counterparty } from '../models/counterparty.model';
import { WarehouseClient } from '../models/warehouse-client.model';
import { recordAuditLog } from '../services/audit-log.service';
import { getWarehouseContractState } from '../utils/warehouse-contract';

const normalizeNullable = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const validateContractPeriod = (contractDate: string | null, contractEndDate: string | null) => {
  if (contractDate && contractEndDate && contractEndDate < contractDate) {
    const error: any = new Error('Дата окончания договора не может быть раньше даты договора');
    error.statusCode = 400;
    throw error;
  }
};

const serializeClient = (client: WarehouseClient) => {
  const contractState = getWarehouseContractState(client.contractEndDate);
  return {
    id: client.id,
    counterpartyId: client.counterpartyId,
    inn: client.counterparty.inn,
    nameFull: client.counterparty.nameFull,
    nameShort: client.counterparty.nameShort,
    contractNumber: client.contractNumber,
    contractDate: client.contractDate,
    contractEndDate: client.contractEndDate,
    ...contractState,
    serviceStartDate: client.serviceStartDate,
    isActive: client.isActive,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
};

export const listWarehouseClients = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const repository = AppDataSource.getRepository(WarehouseClient);
    if (req.user?.role === 'counterparty_user') {
      if (!req.user.warehouseClientId) {
        res.json([]);
        return;
      }
      const ownClient = await repository.findOne({
        where: { id: req.user.warehouseClientId, isActive: true },
        relations: { counterparty: true },
      });
      res.json(ownClient ? [serializeClient(ownClient)] : []);
      return;
    }

    const q = String(req.query.q ?? '').trim();
    const includeInactive = String(req.query.includeInactive ?? 'false') === 'true';
    const query = repository
      .createQueryBuilder('client')
      .innerJoinAndSelect('client.counterparty', 'counterparty')
      .orderBy('client.isActive', 'DESC')
      .addOrderBy('counterparty.nameShort', 'ASC')
      .addOrderBy('counterparty.nameFull', 'ASC');
    if (!includeInactive) query.andWhere('client.isActive = true');
    if (q) {
      query.andWhere(
        '(counterparty.nameFull ILIKE :q OR counterparty.nameShort ILIKE :q OR counterparty.inn ILIKE :q)',
        { q: `%${q}%` },
      );
    }
    const clients = await query.getMany();
    res.json(clients.map(serializeClient));
  } catch (error) {
    next(error);
  }
};

export const createWarehouseClient = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const contractDate = normalizeNullable(req.body.contractDate);
    const contractEndDate = normalizeNullable(req.body.contractEndDate);
    validateContractPeriod(contractDate, contractEndDate);
    const saved = await AppDataSource.transaction(async (manager) => {
      const counterpartyRepository = manager.getRepository(Counterparty);
      const clientRepository = manager.getRepository(WarehouseClient);
      const inn = String(req.body.inn).trim();
      let counterparty = await counterpartyRepository.findOne({ where: { inn } });
      if (counterparty) {
        counterparty.nameFull = String(req.body.nameFull).trim();
        counterparty.nameShort = normalizeNullable(req.body.nameShort);
        counterparty = await counterpartyRepository.save(counterparty);
      } else {
        counterparty = await counterpartyRepository.save(counterpartyRepository.create({
          inn,
          nameFull: String(req.body.nameFull).trim(),
          nameShort: normalizeNullable(req.body.nameShort),
          counterpartyForm: null,
          ogrn: null,
          kpp: null,
          address: null,
          source: 'manual',
          sourcePayload: { createdForWarehouse: true },
        }));
      }

      const existing = await clientRepository.findOne({
        where: { counterpartyId: counterparty.id },
      });
      if (existing) {
        const error: any = new Error('Организация уже добавлена в клиенты склада');
        error.statusCode = 409;
        throw error;
      }

      const client = await clientRepository.save(clientRepository.create({
        counterpartyId: counterparty.id,
        contractNumber: normalizeNullable(req.body.contractNumber),
        contractDate,
        contractEndDate,
        serviceStartDate: normalizeNullable(req.body.serviceStartDate),
        isActive: req.body.isActive !== false,
        notes: normalizeNullable(req.body.notes),
        createdById: req.user!.id,
      }));
      client.counterparty = counterparty;
      return client;
    });

    await recordAuditLog({
      action: 'WAREHOUSE_CLIENT_CREATED',
      userId: req.user?.id,
      entityType: 'warehouse_client',
      entityId: saved.id,
      details: { counterpartyId: saved.counterpartyId, inn: saved.counterparty.inn },
      req,
    });
    res.status(201).json(serializeClient(saved));
  } catch (error) {
    next(error);
  }
};

export const updateWarehouseClient = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const repository = AppDataSource.getRepository(WarehouseClient);
    const client = await repository.findOne({
      where: { id: req.params.clientId },
      relations: { counterparty: true },
    });
    if (!client) {
      res.status(404).json({ message: 'Клиент склада не найден' });
      return;
    }
    const before = serializeClient(client);
    const nextContractDate = req.body.contractDate !== undefined
      ? normalizeNullable(req.body.contractDate)
      : client.contractDate;
    const nextContractEndDate = req.body.contractEndDate !== undefined
      ? normalizeNullable(req.body.contractEndDate)
      : client.contractEndDate;
    validateContractPeriod(nextContractDate, nextContractEndDate);
    if (req.body.contractNumber !== undefined) client.contractNumber = normalizeNullable(req.body.contractNumber);
    if (req.body.contractDate !== undefined) client.contractDate = nextContractDate;
    if (req.body.contractEndDate !== undefined) {
      client.contractEndDate = nextContractEndDate;
    }
    if (req.body.serviceStartDate !== undefined) {
      client.serviceStartDate = normalizeNullable(req.body.serviceStartDate);
    }
    if (typeof req.body.isActive === 'boolean') client.isActive = req.body.isActive;
    if (req.body.notes !== undefined) client.notes = normalizeNullable(req.body.notes);
    const saved = await repository.save(client);
    await recordAuditLog({
      action: 'WAREHOUSE_CLIENT_UPDATED',
      userId: req.user?.id,
      entityType: 'warehouse_client',
      entityId: client.id,
      details: { before, after: serializeClient(saved) },
      req,
    });
    res.json(serializeClient(saved));
  } catch (error) {
    next(error);
  }
};

export const searchAvailableCounterparties = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const counterparties = await AppDataSource.getRepository(Counterparty).find({
      where: q
        ? [
            { inn: ILike(`${q}%`) },
            { nameFull: ILike(`%${q}%`) },
            { nameShort: ILike(`%${q}%`) },
          ]
        : undefined,
      order: { updatedAt: 'DESC' },
      take: 20,
    });
    const clientCounterpartyIds = new Set(
      (await AppDataSource.getRepository(WarehouseClient).find({
        select: { counterpartyId: true },
      })).map((client) => client.counterpartyId),
    );
    res.json(counterparties
      .filter((item) => !clientCounterpartyIds.has(item.id))
      .map((item) => ({
        id: item.id,
        inn: item.inn,
        nameFull: item.nameFull,
        nameShort: item.nameShort,
      })));
  } catch (error) {
    next(error);
  }
};
