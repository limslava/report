import { Request, Response, NextFunction } from 'express';
import { planningV2Service } from '../services/planning-v2.service';
import { planningV2ReportService } from '../services/planning-v2-report.service';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';
import { planningV2TotalsService } from '../services/planning-v2-totals.service';
import { buildPlanningDailyExcel, buildPlanningTotalsExcel } from '../services/email-scheduler.service';
import { logger } from '../utils/logger';
import { planWebSocketService } from '../services/websocket.service';
import { PLANNING_FULL_ACCESS_ROLES } from '../constants/roles';
import { sendError } from '../utils/http';
import { recordAuditLog } from '../services/audit-log.service';
import { cache } from '../utils/cache';

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

function formatReportDateLabel(input: string): string {
  const [year, month, day] = input.split('-');
  if (!year || !month || !day) return input;
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pct(fact: number, plan: number): number {
  if (!Number.isFinite(fact) || !Number.isFinite(plan) || plan <= 0) return 0;
  return Number(((fact / plan) * 100).toFixed(1));
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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

    if (result.updated > 0) {
      await recordAuditLog({
        action: 'DAILY_REPORT_SAVED',
        userId: user.id,
        entityType: 'planning_values',
        entityId: segmentCode,
        details: {
          segmentCode,
          year,
          month,
          updated: result.updated,
        },
        req,
      });
    }

    res.json({ message: 'Values updated', ...result });
  } catch (error) {
    next(error);
  }
};

export const getPlanningSegmentReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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

    if ((user.role === 'manager_sales' || user.role === 'head_sales') && segmentCode === PlanningSegmentCode.AUTO) {
      const hiddenMetrics = new Set([
        'auto_manual_debt_overload',
        'auto_manual_debt_cashback',
        'auto_debt_unpaid',
        'auto_debt_paid_cards',
        'auto_debt_contractors_vvo',
        'auto_debt_delta',
      ]);
      report.gridRows = report.gridRows.filter((row: any) => !hiddenMetrics.has(row.metricCode));
      if (report.dashboard) {
        delete (report.dashboard as Record<string, unknown>).debtOverload;
        delete (report.dashboard as Record<string, unknown>).debtCashback;
        delete (report.dashboard as Record<string, unknown>).debtUnpaid;
        delete (report.dashboard as Record<string, unknown>).debtPaidCards;
        delete (report.dashboard as Record<string, unknown>).debtContractorsVvo;
        delete (report.dashboard as Record<string, unknown>).debtDelta;
      }
    }

    res.json(report);
  } catch (error) {
    next(error);
  }
};

export const getPlanningSummaryReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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

export const getPlanningTechDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
      return;
    }

    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : undefined;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    const effectiveAsOfDate = asOfDate ?? `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
    const cacheKey = `tech-dashboard:${user.role}:${year}:${month}:${effectiveAsOfDate}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const summaryDetailed = await planningV2ReportService.getSummaryReport(year, month, effectiveAsOfDate, true);

    const byCode = (code: PlanningSegmentCode) => summaryDetailed.find((item) => item.segmentCode === code && !item.detailCode);
    const byDetail = (code: PlanningSegmentCode, detailCode: string) =>
      summaryDetailed.find((item) => item.segmentCode === code && item.detailCode === detailCode);

    const requiredSegments: PlanningSegmentCode[] = [
      PlanningSegmentCode.KTK_VVO,
      PlanningSegmentCode.KTK_MOW,
      PlanningSegmentCode.RAIL,
      PlanningSegmentCode.EXTRA,
      PlanningSegmentCode.AUTO,
      PlanningSegmentCode.TO,
    ];

    const segmentReports = await Promise.all(
      requiredSegments.map((segmentCode) => planningV2ReportService.getSegmentReport({
        segmentCode,
        year,
        month,
        asOfDate: effectiveAsOfDate,
      }))
    );
    const reportMap = new Map(segmentReports.map((report) => [report.segment.code, report]));

    const vvo = byCode(PlanningSegmentCode.KTK_VVO);
    const msk = byCode(PlanningSegmentCode.KTK_MOW);
    const rail = byDetail(PlanningSegmentCode.RAIL, 'RAIL_TOTAL_FLOW') ?? byCode(PlanningSegmentCode.RAIL);
    const to = byCode(PlanningSegmentCode.TO);
    const autoTruck = byDetail(PlanningSegmentCode.AUTO, 'AUTO_TRUCK_CURTAIN') ?? byCode(PlanningSegmentCode.AUTO);
    const autoKtk = byDetail(PlanningSegmentCode.AUTO, 'AUTO_KTK');
    const autoDashboard = (reportMap.get(PlanningSegmentCode.AUTO)?.dashboard ?? {}) as Record<string, unknown>;
    const extraDashboard = (reportMap.get(PlanningSegmentCode.EXTRA)?.dashboard ?? {}) as Record<string, unknown>;
    const vvoDashboard = (reportMap.get(PlanningSegmentCode.KTK_VVO)?.dashboard ?? {}) as Record<string, unknown>;
    const mskDashboard = (reportMap.get(PlanningSegmentCode.KTK_MOW)?.dashboard ?? {}) as Record<string, unknown>;
    const railDashboard = (reportMap.get(PlanningSegmentCode.RAIL)?.dashboard ?? {}) as Record<string, unknown>;
    const extraGroupage = Number(extraDashboard.groupage ?? 0);
    const extraCurtains = Number(extraDashboard.curtains ?? 0);
    const extraForwarding = Number(extraDashboard.forwarding ?? 0);
    const extraRepack = Number(extraDashboard.repack ?? 0);
    const extraTotal = extraGroupage + extraCurtains + extraForwarding + extraRepack;

    const totalsRows = await planningV2TotalsService.getYearTotals(year, { ensureMetrics: false });
    const basePlanRows = totalsRows.filter((row) =>
      row.kind === 'PLAN_FLOW' && (
        (row.segmentCode === PlanningSegmentCode.KTK_VVO && row.planMetricCode === PlanningPlanMetricCode.KTK_PLAN_REQUESTS) ||
        (row.segmentCode === PlanningSegmentCode.KTK_MOW && row.planMetricCode === PlanningPlanMetricCode.KTK_PLAN_REQUESTS) ||
        (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === PlanningPlanMetricCode.AUTO_PLAN_TRUCK) ||
        (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === PlanningPlanMetricCode.AUTO_PLAN_KTK) ||
        (row.segmentCode === PlanningSegmentCode.RAIL && row.planMetricCode === PlanningPlanMetricCode.RAIL_PLAN_KTK) ||
        (row.segmentCode === PlanningSegmentCode.TO && row.planMetricCode === PlanningPlanMetricCode.TO_PLAN)
      )
    );

    const carryPlanByMonth = new Map<number, number>();
    const basePlanByMonth = new Map<number, number>();
    for (let m = 1; m <= 12; m += 1) {
      const monthBase = basePlanRows.reduce((sum, row) => sum + Number(row.months[m - 1]?.basePlan ?? 0), 0);
      const monthCarry = basePlanRows.reduce((sum, row) => sum + Number(row.months[m - 1]?.carryPlan ?? 0), 0);
      basePlanByMonth.set(m, Number(monthBase.toFixed(0)));
      carryPlanByMonth.set(m, Number(monthCarry.toFixed(0)));
    }

    const monthly = await Promise.all(
      Array.from({ length: 12 }, async (_, idx) => {
        const m = idx + 1;
        const monthAsOf = `${year}-${String(m).padStart(2, '0')}-${String(daysInMonth(year, m)).padStart(2, '0')}`;
        const rows = await planningV2ReportService.getSummaryReport(year, m, monthAsOf, false);
        const topRows = rows.filter((row) => !row.detailCode && (
          row.segmentCode === PlanningSegmentCode.KTK_VVO ||
          row.segmentCode === PlanningSegmentCode.KTK_MOW ||
          row.segmentCode === PlanningSegmentCode.AUTO ||
          row.segmentCode === PlanningSegmentCode.RAIL ||
          row.segmentCode === PlanningSegmentCode.TO
        ));
        const planBase = Number(basePlanByMonth.get(m) ?? 0);
        const planCarry = Number(carryPlanByMonth.get(m) ?? 0);
        const fact = topRows.reduce((sum, row) => sum + Number(row.monthFact ?? 0), 0);
        const monthLabel = new Date(year, m - 1, 1).toLocaleString('ru-RU', { month: 'short' }).replace('.', '');
        return {
          month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
          plan: Number(planBase.toFixed(0)),
          carry_plan: Number(planCarry.toFixed(0)),
          fact: Number(fact.toFixed(0)),
          pct: pct(fact, planBase),
        };
      })
    );

    const monthSegments = [
      { name: 'Владивосток', plan: Number(vvo?.planMonth ?? 0), fact: Number(vvo?.monthFact ?? 0) },
      { name: 'Москва', plan: Number(msk?.planMonth ?? 0), fact: Number(msk?.monthFact ?? 0) },
      { name: 'Автовозы', plan: Number(autoTruck?.planMonth ?? 0), fact: Number(autoTruck?.monthFact ?? 0) },
      { name: 'Авто в ктк', plan: Number(autoKtk?.planMonth ?? 0), fact: Number(autoKtk?.monthFact ?? 0) },
      { name: 'ЖД', plan: Number(rail?.planMonth ?? 0), fact: Number(rail?.monthFact ?? 0) },
      { name: 'ТО авто', plan: Number(to?.planMonth ?? 0), fact: Number(to?.monthFact ?? 0) },
    ].map((row) => ({ ...row, pct: pct(row.fact, row.plan) }));

    const getMetricAtCompletedDay = (segmentCode: PlanningSegmentCode, metricCode: string): number => {
      const report = reportMap.get(segmentCode);
      if (!report) return 0;
      const row = report.gridRows.find((item) => item.metricCode === metricCode);
      if (!row) return 0;
      const completedDays = Number((report.dashboard as Record<string, unknown>)?.completedDays ?? 0);
      const dayIndex = Number.isInteger(completedDays) && completedDays >= 0
        ? Math.min(completedDays, Math.max(0, row.dayValues.length - 1))
        : Math.max(0, row.dayValues.length - 1);
      return Number(row.dayValues[dayIndex] ?? 0);
    };

    const vvoOwn = getMetricAtCompletedDay(PlanningSegmentCode.KTK_VVO, 'ktk_vvo_fact_move_own');
    const vvoHired = getMetricAtCompletedDay(PlanningSegmentCode.KTK_VVO, 'ktk_vvo_fact_move_hired');
    const vvoTotal = getMetricAtCompletedDay(PlanningSegmentCode.KTK_VVO, 'ktk_vvo_fact_total_per_day');

    const mskOwn = getMetricAtCompletedDay(PlanningSegmentCode.KTK_MOW, 'ktk_mow_fact_move_own');
    const mskHired = getMetricAtCompletedDay(PlanningSegmentCode.KTK_MOW, 'ktk_mow_fact_move_hired');
    const mskTotal = getMetricAtCompletedDay(PlanningSegmentCode.KTK_MOW, 'ktk_mow_fact_total_per_day');

    const autoOwn = getMetricAtCompletedDay(PlanningSegmentCode.AUTO, 'auto_truck_sent_own');
    const autoHired = getMetricAtCompletedDay(PlanningSegmentCode.AUTO, 'auto_truck_sent_hired');
    const autoSent = getMetricAtCompletedDay(PlanningSegmentCode.AUTO, 'auto_truck_sent');

    const checks = {
      'Ктк Владивосток: Собственные + Наемные = Итого (факт дня)': vvoOwn + vvoHired === vvoTotal,
      'Ктк Москва: Собственные + Наемные = Итого (факт дня)': mskOwn + mskHired === mskTotal,
      'Автовоз: Собственные + Наемные = Отправлено (факт дня)': autoOwn + autoHired === autoSent,
    };

    const payload = {
      source: 'planning_v2',
      reportDate: effectiveAsOfDate,
      reportDateLabel: formatReportDateLabel(effectiveAsOfDate),
      year,
      month,
      monthly,
      month_segments: monthSegments,
      // Legacy alias for backward compatibility with older clients.
      april_segments: monthSegments,
      kpi: {
        vvo: {
          plan_month: Number(vvo?.planMonth ?? 0),
          fact_month: Number(vvo?.monthFact ?? 0),
          completion_month: Number(vvo?.completionMonth ?? pct(Number(vvo?.monthFact ?? 0), Number(vvo?.planMonth ?? 0))),
          gross: Number(vvoDashboard.grossTotal ?? 0),
          gross_avg: Number(vvoDashboard.grossAvgPerDay ?? 0),
          avg_ticket: Number(vvoDashboard.avgRequestCost ?? 0),
        },
        msk: {
          plan_month: Number(msk?.planMonth ?? 0),
          fact_month: Number(msk?.monthFact ?? 0),
          completion_month: Number(msk?.completionMonth ?? pct(Number(msk?.monthFact ?? 0), Number(msk?.planMonth ?? 0))),
          gross: Number(mskDashboard.grossTotal ?? 0),
          gross_avg: Number(mskDashboard.grossAvgPerDay ?? 0),
          avg_ticket: Number(mskDashboard.avgRequestCost ?? 0),
        },
        rail: {
          plan_month: Number(rail?.planMonth ?? 0),
          fact_month: Number(rail?.monthFact ?? 0),
          completion_month: Number(rail?.completionMonth ?? pct(Number(rail?.monthFact ?? 0), Number(rail?.planMonth ?? 0))),
          waiting_total: Number(railDashboard.waitingTotal ?? 0),
        },
        auto: {
          waiting_total: Number(autoDashboard.waitingTotal ?? 0),
          waiting_truck: Number(autoDashboard.waitingTruck ?? 0),
          waiting_ktk: Number(autoDashboard.waitingKtk ?? 0),
          waiting_curtain: Number(autoDashboard.waitingCurtain ?? 0),
          debt_delta: Number(autoDashboard.debtDelta ?? 0),
        },
        to: {
          plan_month: Number(to?.planMonth ?? 0),
          fact_month: Number(to?.monthFact ?? 0),
        },
        extra: {
          total: extraTotal,
          groupage: extraGroupage,
          curtains: extraCurtains,
          forwarding: extraForwarding,
          repack: extraRepack,
        },
      },
      checks,
      computed: {
        total_plan: monthSegments.reduce((sum, row) => sum + row.plan, 0),
        total_fact: monthSegments.reduce((sum, row) => sum + row.fact, 0),
        total_pct: pct(
          monthSegments.reduce((sum, row) => sum + row.fact, 0),
          monthSegments.reduce((sum, row) => sum + row.plan, 0)
        ),
        auto_pct: pct(Number(autoTruck?.monthFact ?? 0), Number(autoTruck?.planMonth ?? 0)),
        auto_ktk_pct: pct(Number(autoKtk?.monthFact ?? 0), Number(autoKtk?.planMonth ?? 0)),
      },
    };

    cache.set(cacheKey, payload, 90);
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getPlanningYearTotals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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

    await recordAuditLog({
      action: 'OPERATIONAL_PLAN_SAVED',
      userId: user.id,
      entityType: 'base_plan',
      entityId: `${segmentCode}:${planMetricCode}`,
      details: {
        segmentCode,
        planMetricCode,
        year,
        month,
        basePlan,
      },
      req,
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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

    const hideSalesDebts = user.role === 'manager_sales' || user.role === 'head_sales';
    const buffer = await buildPlanningDailyExcel({
      year,
      month,
      asOfDate,
      segmentCodes: fullAccess ? segments.map((segment) => segment.code) : [segmentCode as PlanningSegmentCode],
      includeMonthTotalColumn: true,
      includeAutoDebtRows: !hideSalesDebts,
      excludeMetricCodes: hideSalesDebts
        ? ['auto_manual_debt_overload', 'auto_manual_debt_cashback', 'auto_debt_unpaid', 'auto_debt_paid_cards', 'auto_debt_contractors_vvo', 'auto_debt_delta']
        : undefined,
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
      sendError(res, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
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
