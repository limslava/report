import { Request, Response, NextFunction } from 'express';
import { planningV2Service } from '../services/planning-v2.service';
import { planningV2ReportService } from '../services/planning-v2-report.service';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';
import { planningV2TotalsService } from '../services/planning-v2-totals.service';
import { buildPlanningDailyExcel, buildPlanningTotalsExcel } from '../services/email-scheduler.service';
import { logger } from '../utils/logger';
import { planWebSocketService } from '../services/websocket.service';
import { PLANNING_FULL_ACCESS_ROLES } from '../constants/roles';

function parseSegmentCode(raw: string): PlanningSegmentCode {
  if (!Object.values(PlanningSegmentCode).includes(raw as PlanningSegmentCode)) {
    throw new Error('Invalid segment code');
  }
  return raw as PlanningSegmentCode;
}

function parsePlanMetricCode(raw: string): PlanningPlanMetricCode {
  if (!Object.values(PlanningPlanMetricCode).includes(raw as PlanningPlanMetricCode)) {
    throw new Error('Invalid plan metric code');
  }
  return raw as PlanningPlanMetricCode;
}

function formatDdMmYyyy(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    throw new Error('Invalid date format');
  }
  const [year, month, day] = parts;
  if (!year || !month || !day) {
    throw new Error('Invalid date format');
  }
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
}

function buildContentDisposition(filename: string): string {
  const sanitized = filename.replace(/"/g, '');
  const asciiFallback = sanitized
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[\\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safeFallback = asciiFallback || 'report.xlsx';
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
}

function isFullAccessRole(role: string): boolean {
  return PLANNING_FULL_ACCESS_ROLES.includes(role as any);
}

export const bootstrapPlanningCatalog = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await planningV2Service.bootstrapCatalog();
    res.json({ message: 'Planning catalog initialized' });
  } catch (error) {
    logger.error('Failed to bootstrap planning catalog', error);
    next(error);
  }
};

export const getPlanningSegments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const segments = await planningV2Service.getSegmentsForRole(user.role);
    res.json(segments.map((segment) => ({ code: segment.code, name: segment.name })));
  } catch (error) {
    next(error);
  }
};

export const getPlanningMetricsBySegment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const segmentCode = parseSegmentCode(req.params.segmentCode);
    if (!planningV2Service.canViewSegment(user.role, segmentCode)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const metrics = await planningV2Service.getMetricsBySegmentCode(segmentCode);

    res.json(metrics.map((metric) => ({
      code: metric.code,
      name: metric.name,
      isEditable: metric.isEditable,
      valueType: metric.valueType,
      aggregation: metric.aggregation,
      formula: metric.formula,
      orderIndex: metric.orderIndex,
    })));
  } catch (error) {
    next(error);
  }
};

export const getPlanningValuesByMonth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const segmentCode = parseSegmentCode(String(req.query.segmentCode));
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    if (!planningV2Service.canViewSegment(user.role, segmentCode)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const values = await planningV2Service.getValuesByMonth(segmentCode, year, month);
    res.json({ segmentCode, year, month, values });
  } catch (error) {
    next(error);
  }
};

export const batchUpsertPlanningValues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { segmentCode: segmentCodeRaw, year, month, updates } = req.body as {
      segmentCode: string;
      year: number;
      month: number;
      updates: Array<{ date: string; metricCode: string; value: number | null }>;
    };

    const segmentCode = parseSegmentCode(segmentCodeRaw);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    if (!Array.isArray(updates)) {
      res.status(400).json({ error: 'updates should be an array' });
      return;
    }

    const result = await planningV2Service.batchUpsertValues(user, {
      segmentCode,
      year,
      month,
      updates,
    });

    planWebSocketService.notifyPlanningV2SegmentUpdated({
      segmentCode,
      year,
      month,
      userId: user.id,
    });

    res.json({ message: 'Values updated', ...result });
  } catch (error) {
    next(error);
  }
};

export const getPlanningSegmentReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const segmentCode = parseSegmentCode(String(req.query.segmentCode));
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : undefined;

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    if (!planningV2Service.canViewSegment(user.role, segmentCode)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const report = await planningV2ReportService.getSegmentReport({
      segmentCode,
      year,
      month,
      asOfDate,
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
};

export const getPlanningSummaryReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : undefined;
    const detailedRaw = Array.isArray(req.query.detailed) ? req.query.detailed[0] : req.query.detailed;
    const detailedFlag = String(detailedRaw ?? '0').toLowerCase();
    const detailed = detailedFlag === '1' || detailedFlag === 'true';

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    const segments = await planningV2Service.getSegmentsForRole(user.role);
    const allSummary = await planningV2ReportService.getSummaryReport(year, month, asOfDate, detailed);
    const allowedCodes = new Set(segments.map((segment) => segment.code));

    res.json(allSummary.filter((item) => allowedCodes.has(item.segmentCode)));
  } catch (error) {
    next(error);
  }
};

export const getPlanningYearTotals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const segments = await planningV2Service.getSegmentsForRole(user.role);
    const allowedCodes = segments.map((segment) => segment.code);
    const canEditBasePlan = user.role === 'admin' || user.role === 'director';
    const rows = await planningV2TotalsService.getYearTotals(year, {
      allowedSegmentCodes: allowedCodes,
      ensureMetrics: canEditBasePlan,
    });
    res.json({ year, rows });
  } catch (error) {
    next(error);
  }
};

export const updatePlanningBasePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (user.role !== 'admin' && user.role !== 'director') {
      res.status(403).json({ error: 'Only admin or director can edit base plans' });
      return;
    }

    const year = Number(req.body.year);
    const month = Number(req.body.month);
    const basePlan = Number(req.body.basePlan);

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    if (!Number.isFinite(basePlan) || basePlan < 0) {
      res.status(400).json({ error: 'Invalid basePlan' });
      return;
    }

    const segmentCode = parseSegmentCode(String(req.body.segmentCode));
    const planMetricCode = parsePlanMetricCode(String(req.body.planMetricCode));

    const result = await planningV2TotalsService.updateBasePlan({
      year,
      month,
      segmentCode,
      planMetricCode,
      basePlan,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const exportPlanningDailyExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : '';
    const segmentCodeRaw = req.query.segmentCode ? String(req.query.segmentCode) : '';

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      res.status(400).json({ error: 'Invalid asOfDate' });
      return;
    }

    const segments = await planningV2Service.getSegmentsForRole(user.role);
    if (segments.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const fullAccess = isFullAccessRole(user.role);

    let segmentCode: PlanningSegmentCode | null = null;
    if (!fullAccess) {
      if (segmentCodeRaw) {
        segmentCode = parseSegmentCode(segmentCodeRaw);
      } else if (segments.length === 1) {
        segmentCode = segments[0].code;
      }

      if (!segmentCode) {
        res.status(400).json({ error: 'segmentCode is required' });
        return;
      }

      if (!segments.some((segment) => segment.code === segmentCode)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const buffer = await buildPlanningDailyExcel({
      year,
      month,
      asOfDate,
      segmentCodes: fullAccess ? segments.map((segment) => segment.code) : [segmentCode as PlanningSegmentCode],
      includeMonthTotalColumn: !fullAccess,
    });

    const ddmmyyyy = formatDdMmYyyy(asOfDate);
    const filename = fullAccess
      ? `СВ — ${ddmmyyyy}.xlsx`
      : `${segments.find((segment) => segment.code === segmentCode)?.name ?? segmentCode} — ${ddmmyyyy}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportPlanningTotalsExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const segments = await planningV2Service.getSegmentsForRole(user.role);
    if (segments.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const now = new Date();
    const highlightMonth = year === now.getFullYear() ? now.getMonth() + 1 : null;
    const buffer = await buildPlanningTotalsExcel({
      year,
      segmentCodes: segments.map((segment) => segment.code),
      highlightMonth,
    });

    const filename = segments.length === 1
      ? `Операционный отчет ${segments[0].name} — ${year}.xlsx`
      : `Операционный отчет — ${year}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
};
