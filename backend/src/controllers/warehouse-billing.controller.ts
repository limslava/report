import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { WarehouseClient } from '../models/warehouse-client.model';
import {
  buildWarehouseBillingExcel,
  buildWarehouseBillingPdf,
  calculateWarehouseBilling,
  closeWarehouseBillingPeriod,
} from '../services/warehouse-billing.service';

const buildContentDisposition = (filename: string): string => {
  const encoded = encodeURIComponent(filename).replace(/%20/g, '+');
  const fallback = filename.replace(/[^\x20-\x7E]+/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

const scopedCounterpartyId = async (req: Request): Promise<string | null> => {
  if (req.user?.role !== 'counterparty_user') {
    return String(req.query.counterpartyId || req.body?.counterpartyId || '') || null;
  }
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

const reportParams = async (req: Request) => ({
  periodFrom: String(req.query.periodFrom),
  periodTo: String(req.query.periodTo),
  counterpartyId: await scopedCounterpartyId(req),
  vehicleType: req.query.vehicleType
    ? String(req.query.vehicleType) as 'passenger' | 'truck'
    : null,
});

export const getWarehouseBillingReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await calculateWarehouseBilling(await reportParams(req)));
  } catch (error) {
    next(error);
  }
};

export const closeWarehouseBilling = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const report = await closeWarehouseBillingPeriod({
      periodFrom: String(req.body.periodFrom),
      periodTo: String(req.body.periodTo),
      counterpartyId: String(req.body.counterpartyId),
      userId: req.user!.id,
      userName: req.user!.fullName,
    });
    res.status(201).json(report);
  } catch (error) {
    next(error);
  }
};

export const exportWarehouseBillingExcel = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const report = await calculateWarehouseBilling(await reportParams(req));
    const buffer = await buildWarehouseBillingExcel(report);
    const filename = `Акт_склад_${report.periodFrom}_${report.periodTo}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportWarehouseBillingPdf = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const report = await calculateWarehouseBilling(await reportParams(req));
    const buffer = await buildWarehouseBillingPdf(report);
    const filename = `Акт_склад_${report.periodFrom}_${report.periodTo}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
