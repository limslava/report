import { NextFunction, Request, Response } from 'express';
import { financialPlanService } from '../services/financial-plan.service';
import { planWebSocketService } from '../services/websocket.service';
import { sendError } from '../utils/http';

const VIEW_ROLES = new Set(['admin', 'director', 'financer']);
const EDIT_ROLES = new Set(['admin', 'director', 'financer']);

function buildContentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/%20/g, '+');
  const fallback = filename.replace(/[^\x20-\x7E]+/g, '_');
  return `attachment; filename=\"${fallback}\"; filename*=UTF-8''${encoded}`;
}

function hasRole(user: { role: string } | undefined | null, allowed: Set<string>): boolean {
  if (!user) return false;
  return allowed.has(user.role);
}

export const getFinancialPlanReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!hasRole(user, VIEW_ROLES)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const report = await financialPlanService.getReport(year);
    res.json(report);
  } catch (error) {
    next(error);
  }
};

export const batchUpsertFinancialPlanValues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!hasRole(user, EDIT_ROLES)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const year = Number(req.body.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    const result = await financialPlanService.batchUpsertValues(user!, {
      year,
      updates,
    });

    if (result.updated > 0) {
      planWebSocketService.notifyFinancialPlanUpdated({ year, userId: user?.id });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const addFinancialVatRate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
      return;
    }

    const effectiveFrom = String(req.body.effectiveFrom ?? '');
    const rate = Number(req.body.rate);

    if (!/\d{4}-\d{2}-\d{2}/.test(effectiveFrom)) {
      res.status(400).json({ error: 'Invalid effectiveFrom' });
      return;
    }

    const created = await financialPlanService.addVatRate(user, { effectiveFrom, rate });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const getFinancialVatRates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const yearRaw = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const year = Number.isInteger(yearRaw) ? yearRaw : new Date().getFullYear();

    const vatInfo = await financialPlanService.getVatInfo(year);
    res.json({ year, ...vatInfo });
  } catch (error) {
    next(error);
  }
};

export const exportFinancialPlanExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!hasRole(user, VIEW_ROLES)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const buffer = await financialPlanService.buildExcelReport(year);
    const filename = `Финансовый результат плановый — ${year}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
};
