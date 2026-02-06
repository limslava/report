import { logger } from '../utils/logger';
import { AppDataSource } from '../config/data-source';
import { EmailSchedule } from '../models/email-schedules.model';
import ExcelJS from 'exceljs';
import { planningV2ReportService } from './planning-v2-report.service';
import { PlanningSegmentCode } from '../models/planning.enums';
import { sendEmailWithAttachment } from './email.service';
import { planningV2TotalsService } from './planning-v2-totals.service';

const emailScheduleRepo = AppDataSource.getRepository(EmailSchedule);

const DEPARTMENT_TO_SEGMENT: Record<string, PlanningSegmentCode | null> = {
  container_vladivostok: PlanningSegmentCode.KTK_VVO,
  container_moscow: PlanningSegmentCode.KTK_MOW,
  autotruck: PlanningSegmentCode.AUTO,
  railway: PlanningSegmentCode.RAIL,
  additional: PlanningSegmentCode.EXTRA,
  to_auto: PlanningSegmentCode.TO,
};

const SEGMENT_REPORT_TITLE: Record<PlanningSegmentCode, string> = {
  [PlanningSegmentCode.KTK_VVO]: 'Контейнерным перевозкам - Владивосток',
  [PlanningSegmentCode.KTK_MOW]: 'Контейнерным перевозкам - Москва',
  [PlanningSegmentCode.AUTO]: 'Отправке авто',
  [PlanningSegmentCode.RAIL]: 'ЖД',
  [PlanningSegmentCode.EXTRA]: 'Доп.услугам',
  [PlanningSegmentCode.TO]: 'ТО авто',
};

const DEFAULT_SEGMENT_ORDER: PlanningSegmentCode[] = [
  PlanningSegmentCode.KTK_VVO,
  PlanningSegmentCode.KTK_MOW,
  PlanningSegmentCode.AUTO,
  PlanningSegmentCode.RAIL,
  PlanningSegmentCode.EXTRA,
  PlanningSegmentCode.TO,
];

const WEEK_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DEFAULT_TZ = process.env.SCHEDULER_TIMEZONE || 'Asia/Vladivostok';

const COLORS = {
  sectionTitle: 'FFE6E6E6',
  header: 'FFF2F2F2',
  weekend: 'FFF3F3F3',
  readonly: 'FFFAFAFA',
  dashboard: 'FFEDEDED',
};

type ReportType = 'sv_pdf' | 'planning_v2_segment';

const normalizeReportType = (value: unknown): ReportType => {
  // Backward compatibility for schedules created before cleanup.
  if (value === 'legacy_daily' || value === 'legacy_monthly') {
    return 'planning_v2_segment';
  }
  if (value === 'sv_pdf') return 'sv_pdf';
  return 'planning_v2_segment';
};

export const scheduleEmailJob = async (
  department: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  schedule: any,
  recipients: string[]
) => {
  try {
    const emailSchedule = emailScheduleRepo.create({
      department,
      frequency,
      schedule,
      recipients,
      isActive: true,
    });

    await emailScheduleRepo.save(emailSchedule);

    logger.info(`Email schedule created for ${department} (${frequency})`);
    return emailSchedule;
  } catch (error) {
    logger.error('Failed to schedule email:', error);
    throw error;
  }
};

export const processScheduledEmails = async () => {
  try {
    const now = new Date();
    const schedules = await emailScheduleRepo.find({
      where: { isActive: true },
    });

    for (const schedule of schedules) {
      const check = checkSchedule(schedule, now);
      if (check.shouldSend) {
        logger.info('Email schedule matched, sending now', {
          scheduleId: schedule.id,
          department: schedule.department,
          frequency: schedule.frequency,
          timezone: check.timezone,
          nowLocal: check.nowLocal,
          scheduledTime: check.scheduledTime,
        });
        await sendScheduledEmailNow(schedule);
        schedule.lastSent = now;
        await emailScheduleRepo.save(schedule);
      } else {
        const skipPayload = {
          scheduleId: schedule.id,
          department: schedule.department,
          frequency: schedule.frequency,
          reason: check.reason,
          timezone: check.timezone,
          nowLocal: check.nowLocal,
          scheduledTime: check.scheduledTime,
          lastSentLocal: check.lastSentLocal,
        };

        if (check.reason === 'time_not_reached' || check.reason === 'already_sent_today') {
          logger.debug('Email schedule skipped', skipPayload);
        } else {
          logger.info('Email schedule skipped', skipPayload);
        }
      }
    }
  } catch (error) {
    logger.error('Error processing scheduled emails:', error);
  }
};

const checkSchedule = (
  schedule: EmailSchedule,
  now: Date
): {
  shouldSend: boolean;
  reason: string;
  timezone: string;
  scheduledTime: string;
  nowLocal: string;
  lastSentLocal: string | null;
} => {
  const { frequency, schedule: config } = schedule;
  const lastSent = schedule.lastSent;
  const scheduledTime = config.time || '09:00';
  const [hour, minute] = scheduledTime.split(':').map(Number);
  const timezone = String(config.timezone || DEFAULT_TZ);

  const asTzParts = (date: Date) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = dtf.formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const weekdayMap: Record<string, number> = {
      Sun: 7,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      isoWeekday: weekdayMap[map.weekday] ?? 1,
      dayKey: `${map.year}-${map.month}-${map.day}`,
    };
  };

  const nowTz = asTzParts(now);
  const nowLocal = `${String(nowTz.day).padStart(2, '0')}.${String(nowTz.month).padStart(2, '0')}.${nowTz.year} ${String(nowTz.hour).padStart(2, '0')}:${String(nowTz.minute).padStart(2, '0')}`;
  const isExactTime = nowTz.hour === hour && nowTz.minute === minute;
  const lastSentLocal = lastSent ? (() => {
    const s = asTzParts(lastSent);
    return `${String(s.day).padStart(2, '0')}.${String(s.month).padStart(2, '0')}.${s.year} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  })() : null;

  if (lastSent && asTzParts(lastSent).dayKey === nowTz.dayKey) {
    return { shouldSend: false, reason: 'already_sent_today', timezone, scheduledTime, nowLocal, lastSentLocal };
  }

  const normalizedDaysOfWeek = Array.isArray(config.daysOfWeek)
    ? config.daysOfWeek.map((d) => Number(d)).filter((d) => Number.isFinite(d))
    : [];

  if (frequency === 'daily') {
    if (normalizedDaysOfWeek.length > 0) {
      if (!normalizedDaysOfWeek.includes(nowTz.isoWeekday)) {
        return { shouldSend: false, reason: 'weekday_not_allowed', timezone, scheduledTime, nowLocal, lastSentLocal };
      }
    }
    return {
      shouldSend: isExactTime,
      reason: isExactTime ? 'ok' : 'time_not_reached',
      timezone,
      scheduledTime,
      nowLocal,
      lastSentLocal,
    };
  }

  if (frequency === 'weekly') {
    const days = normalizedDaysOfWeek.length > 0 ? normalizedDaysOfWeek : [1];
    if (!days.includes(nowTz.isoWeekday)) {
      return { shouldSend: false, reason: 'weekday_not_allowed', timezone, scheduledTime, nowLocal, lastSentLocal };
    }
    return {
      shouldSend: isExactTime,
      reason: isExactTime ? 'ok' : 'time_not_reached',
      timezone,
      scheduledTime,
      nowLocal,
      lastSentLocal,
    };
  }

  if (frequency === 'monthly') {
    const dayOfMonth = Number(config.dayOfMonth || 1);
    if (nowTz.day !== dayOfMonth) {
      return { shouldSend: false, reason: 'day_of_month_not_matched', timezone, scheduledTime, nowLocal, lastSentLocal };
    }
    return {
      shouldSend: isExactTime,
      reason: isExactTime ? 'ok' : 'time_not_reached',
      timezone,
      scheduledTime,
      nowLocal,
      lastSentLocal,
    };
  }

  return { shouldSend: false, reason: 'unsupported_frequency', timezone, scheduledTime, nowLocal, lastSentLocal };
};

export const sendScheduledEmailNow = async (schedule: EmailSchedule) => {
  logger.info(`Sending scheduled email for ${schedule.department}`);
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.toISOString().split('T')[0];
  const ddmmyyyy = `${String(now.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  const reportType = normalizeReportType(schedule.schedule?.reportType);

  try {
    if (reportType === 'sv_pdf') {
      const content = await buildSvExcelFromData(year, month, date);
      await sendEmailWithAttachment(
        schedule.recipients,
        `СВ - ${ddmmyyyy}`,
        [
          '<p>Уважаемые коллеги,</p>',
          `<p>Отчет на ${ddmmyyyy} во вложении.</p>`,
          `<p><strong>Вложение:</strong> Детальный отчёт в формате Excel содержит все операционные данные на ${ddmmyyyy}.</p>`,
          '<p>Отчёт сгенерирован автоматически системой мониторинга логистики.</p>',
          '<p>© 2026 Система управления логистикой и отчётности</p>',
          '<p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>',
        ].join(''),
        {
          filename: `СВ - ${ddmmyyyy}.xlsx`,
          content,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );
      logger.info(`SV Excel sent for ${schedule.department}`);
      return;
    }

    if (reportType === 'planning_v2_segment') {
      const segmentCode = DEPARTMENT_TO_SEGMENT[schedule.department];
      if (!segmentCode) {
        throw new Error(`Unsupported department for planning_v2_segment: ${schedule.department}`);
      }

      const report = await planningV2ReportService.getSegmentReport({
        segmentCode,
        year,
        month,
        asOfDate: date,
      });

      const workbook = new ExcelJS.Workbook();
      const reportSheet = workbook.addWorksheet('Ежедневный отчет');
      appendSegmentReportBlock(reportSheet, report, year, month, 1, { includeMonthTotalColumn: true });
      // Match layout from standard daily export.
      reportSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
      reportSheet.getColumn(1).width = 42;
      for (let d = 1; d <= report.daysInMonth; d += 1) {
        reportSheet.getColumn(d + 1).width = 5.3;
      }
      const dataEndCol = report.daysInMonth + 2;
      const spacerCol = dataEndCol + 1;
      const dashboardStartCol = spacerCol + 1;
      reportSheet.getColumn(dataEndCol).width = 9.5; // ИТОГО
      reportSheet.getColumn(spacerCol).width = 2; // spacer
      reportSheet.getColumn(dashboardStartCol).width = 14; // dashboard title column
      reportSheet.getColumn(dashboardStartCol + 1).width = 24; // dashboard metric
      reportSheet.getColumn(dashboardStartCol + 2).width = 14; // dashboard value 1
      reportSheet.getColumn(dashboardStartCol + 3).width = 14; // dashboard value 2

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const reportTitle = SEGMENT_REPORT_TITLE[report.segment.code] ?? report.segment.name;
      const planMonth = Number(report.dashboard?.planMonth ?? 0);
      const factToDate = Number(report.dashboard?.factToDate ?? 0);
      const completionMonth = Number(report.dashboard?.completionMonthPct ?? 0);

      await sendEmailWithAttachment(
        schedule.recipients,
        `Отчет по ${reportTitle} на ${ddmmyyyy}`,
        [
          `<p>Отчет по ${reportTitle}</p>`,
          `<p>Дата: ${ddmmyyyy}</p>`,
          '<h3>Ключевые показатели</h3>',
          `<p><strong>План на месяц:</strong> ${planMonth.toLocaleString('ru-RU')}</p>`,
          `<p><strong>Выполнение на дату:</strong> ${factToDate.toLocaleString('ru-RU')}</p>`,
          `<p><strong>Выполнение % по месяцу:</strong> ${completionMonth.toFixed(1)}%</p>`,
          `<p><strong>Вложение:</strong> Детальный отчёт в формате Excel содержит все операционные данные на ${ddmmyyyy}.</p>`,
          '<p>Отчёт сгенерирован автоматически системой мониторинга логистики.</p>',
          '<p>© 2026 Система управления логистикой и отчётности</p>',
          '<p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>',
        ].join(''),
        {
          filename: `Отчет по ${reportTitle} - ${ddmmyyyy}.xlsx`,
          content: buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );
      logger.info(`Planning v2 segment report sent for ${schedule.department}`);
      return;
    }
  } catch (error) {
    logger.error(`Failed to send scheduled email for ${schedule.department}:`, error);
    throw error;
  }
};

type DailyExportOptions = {
  year: number;
  month: number;
  asOfDate: string;
  segmentCodes?: PlanningSegmentCode[];
  includeMonthTotalColumn?: boolean;
};

type TotalsExportOptions = {
  year: number;
  segmentCodes?: PlanningSegmentCode[];
  highlightMonth?: number | null;
};

const MONTH_NAMES_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export const buildPlanningDailyExcel = async (options: DailyExportOptions): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const planningSheet = workbook.addWorksheet('Ежедневный отчет');
  await fillDailyReportSheet(planningSheet, options);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const buildPlanningTotalsExcel = async (options: TotalsExportOptions): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const totalSheet = workbook.addWorksheet('ИТОГО');
  await fillTotalsSheet(totalSheet, options);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

async function buildSvExcelFromData(year: number, month: number, asOfDate: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planningSheet = workbook.addWorksheet('Ежедневный отчет');
  const totalSheet = workbook.addWorksheet('ИТОГО');

  await fillDailyReportSheet(planningSheet, {
    year,
    month,
    asOfDate,
    segmentCodes: DEFAULT_SEGMENT_ORDER,
    includeMonthTotalColumn: true,
  });
  await fillTotalsSheet(totalSheet, { year, highlightMonth: month });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function resolveSegmentOrder(segmentCodes?: PlanningSegmentCode[]): PlanningSegmentCode[] {
  if (!segmentCodes || segmentCodes.length === 0) {
    return [...DEFAULT_SEGMENT_ORDER];
  }
  const selected = new Set(segmentCodes);
  const ordered = DEFAULT_SEGMENT_ORDER.filter((code) => selected.has(code));
  segmentCodes.forEach((code) => {
    if (!ordered.includes(code)) {
      ordered.push(code);
    }
  });
  return ordered;
}

async function fillDailyReportSheet(sheet: ExcelJS.Worksheet, options: DailyExportOptions): Promise<void> {
  const { year, month, asOfDate, includeMonthTotalColumn = true } = options;
  const daysInMonth = new Date(year, month, 0).getDate();
  const segmentOrder = resolveSegmentOrder(options.segmentCodes);

  let cursor = 1;
  for (const segmentCode of segmentOrder) {
    const report = await planningV2ReportService.getSegmentReport({
      segmentCode,
      year,
      month,
      asOfDate,
    });
    cursor = appendSegmentReportBlock(sheet, report, year, month, cursor, { includeMonthTotalColumn });
    cursor += 2;
  }

  // Global layout for "Ежедневный отчет"
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  sheet.getColumn(1).width = 42;
  for (let d = 1; d <= daysInMonth; d += 1) {
    sheet.getColumn(d + 1).width = 5.3;
  }

  const dataEndCol = daysInMonth + (includeMonthTotalColumn ? 2 : 1);
  const spacerCol = dataEndCol + 1;
  const dashboardStartCol = spacerCol + 1;

  if (includeMonthTotalColumn) {
    sheet.getColumn(daysInMonth + 2).width = 9.5; // ИТОГО
  }
  sheet.getColumn(spacerCol).width = 2; // spacer
  sheet.getColumn(dashboardStartCol).width = 14; // dashboard title column
  sheet.getColumn(dashboardStartCol + 1).width = 24; // dashboard metric
  sheet.getColumn(dashboardStartCol + 2).width = 14; // dashboard value 1
  sheet.getColumn(dashboardStartCol + 3).width = 14; // dashboard value 2
}

async function fillTotalsSheet(sheet: ExcelJS.Worksheet, options: TotalsExportOptions): Promise<void> {
  const yearTotals = await planningV2TotalsService.getYearTotals(options.year);
  const filteredTotals = options.segmentCodes && options.segmentCodes.length > 0
    ? yearTotals.filter((row) => options.segmentCodes?.includes(row.segmentCode))
    : yearTotals;

  sheet.addRow(['Сегмент', 'Показатель', ...MONTH_NAMES_SHORT, 'Итог за год']);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } };
  sheet.columns = [{ width: 26 }, { width: 22 }, ...Array.from({ length: 12 }, () => ({ width: 10 })), { width: 14 }];

  const sortedTotals = [...filteredTotals].sort((a, b) => totalsSortOrder(a) - totalsSortOrder(b));
  let lastGroup = '';
  sortedTotals.forEach((row) => {
    const group = totalsGroupTitle(row);
    if (group !== lastGroup) {
      const groupRow = sheet.addRow([group, '', ...Array.from({ length: 13 }, () => '')]);
      groupRow.font = { bold: true };
      groupRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      lastGroup = group;
    }

    if (row.kind === 'PLAN_FLOW') {
      const segmentLabel = totalsSegmentLabel(row);
      const baseRow = sheet.addRow([segmentLabel, 'Базовый план', ...row.months.map((m) => m.basePlan), row.yearlyBasePlan]);
      const factRow = sheet.addRow([segmentLabel, 'Факт', ...row.months.map((m) => m.fact), row.yearlyFact]);
      const carryRow = sheet.addRow([segmentLabel, 'План с переносом', ...row.months.map((m) => m.carryPlan), row.yearlyCarryPlan]);
      const pctRow = sheet.addRow([segmentLabel, 'Выполнение плана', ...row.months.map((m) => m.completionPct / 100), row.yearlyCompletionPct / 100]);
      pctRow.eachCell((cell, colNumber) => {
        if (colNumber >= 3) cell.numFmt = '0.0%';
      });
      [baseRow, factRow, carryRow].forEach((r) =>
        r.eachCell((cell, colNumber) => {
          if (colNumber >= 3) cell.numFmt = '#,##0';
        })
      );
    } else {
      const factRow = sheet.addRow([totalsSegmentLabel(row), 'Факт', ...row.months.map((m) => m.fact), row.yearlyFact]);
      factRow.eachCell((cell, colNumber) => {
        if (colNumber >= 3) cell.numFmt = '#,##0';
      });
    }
  });

  if (options.highlightMonth && options.highlightMonth >= 1 && options.highlightMonth <= 12) {
    const currentMonthCol = options.highlightMonth + 2;
    sheet.getColumn(currentMonthCol).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
    });
  }
  sheet.getColumn(15).eachCell((cell) => {
    cell.font = { ...(cell.font || {}), bold: true };
  });
  applyGrid(sheet);
}

function normalizeMetricName(metricCode: string, name: string): string {
  const fullNameByCode: Record<string, string> = {
    ktk_vvo_plan_unload_load: 'Выгрузка/погрузка - план',
    ktk_vvo_plan_move: 'Перемещение - план',
    ktk_vvo_fact_unload_load: 'Выгрузка/погрузка (факт)',
    ktk_vvo_fact_move: 'Перемещение (факт)',
    ktk_vvo_fact_total_per_day: 'Итого в день (факт)',
    ktk_vvo_fact_trucks_on_line: 'ТС на линии (факт)',
    ktk_vvo_manual_gross: 'Вал. Общий (₽)',
    ktk_mow_plan_unload_load: 'Выгрузка/погрузка - план',
    ktk_mow_plan_move: 'Перемещение - план',
    ktk_mow_fact_unload_load: 'Выгрузка/погрузка (факт)',
    ktk_mow_fact_move: 'Перемещение (факт)',
    ktk_mow_fact_total_per_day: 'Итого в день (факт)',
    ktk_mow_fact_trucks_on_line: 'ТС на линии (факт)',
    ktk_mow_manual_gross: 'Вал. Общий (₽)',
    auto_truck_received: 'Автовоз - Принято',
    auto_truck_sent: 'Автовоз - Отправлено',
    auto_truck_waiting: 'Автовоз - В ожидании',
    auto_ktk_received: 'Авто в ктк - Принято',
    auto_ktk_sent: 'Авто в ктк - Отправлено',
    auto_ktk_waiting: 'Авто в ктк - В ожидании',
    auto_curtain_received: 'Штора - Принято',
    auto_curtain_sent: 'Штора - Отправлено',
    auto_curtain_waiting: 'Штора - В ожидании',
    auto_total_received: 'Итого - Принято',
    auto_total_sent: 'Итого - Отправлено',
    auto_total_waiting: 'Итого - В ожидании',
    auto_manual_debt_overload: 'Задолженность перегруз (₽)',
    auto_manual_debt_cashback: 'Задолженность кэшбек (₽)',
    rail_from_vvo_20: 'Из Владивостока - 20',
    rail_from_vvo_40: 'Из Владивостока - 40',
    rail_from_vvo_total: 'Из Владивостока - Итого',
    rail_to_vvo_20: 'Во Владивосток - 20',
    rail_to_vvo_40: 'Во Владивосток - 40',
    rail_to_vvo_total: 'Во Владивосток - Итого',
    rail_total: 'ЖД - Итого',
    extra_groupage: 'Сборный груз',
    extra_curtains: 'Шторы (тенты)',
    extra_forwarding: 'Экспедирование',
    extra_repack: 'Перетарка/доукрепление',
    extra_total: 'Итог',
    to_count: 'ТО авто (факт)',
  };
  if (fullNameByCode[metricCode]) return fullNameByCode[metricCode];
  if (metricCode === 'auto_ktk_received') return 'Авто в ктк - Принято';
  if (metricCode === 'auto_ktk_sent') return 'Авто в ктк - Отправлено';
  if (metricCode === 'auto_ktk_waiting') return 'Авто в ктк - В ожидании';
  return name;
}

function totalsGroupTitle(row: any): string {
  if (row.segmentCode === PlanningSegmentCode.KTK_VVO || row.segmentCode === PlanningSegmentCode.KTK_MOW) return 'Контейнерные перевозки';
  if (row.segmentCode === PlanningSegmentCode.AUTO) return 'Отправка авто';
  if (row.segmentCode === PlanningSegmentCode.RAIL) return 'ЖД';
  if (row.segmentCode === PlanningSegmentCode.EXTRA) return 'Доп.услуги';
  if (row.segmentCode === PlanningSegmentCode.TO) return 'ТО авто';
  return row.segmentName;
}

function totalsSegmentLabel(row: any): string {
  if (row.segmentCode === PlanningSegmentCode.KTK_VVO) return 'Владивосток';
  if (row.segmentCode === PlanningSegmentCode.KTK_MOW) return 'Москва';
  if (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === 'AUTO_PLAN_TRUCK') return 'Автовозы';
  if (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === 'AUTO_PLAN_KTK') return 'Авто в ктк';
  if (row.segmentCode === PlanningSegmentCode.RAIL) return 'ЖД';
  if (row.segmentCode === PlanningSegmentCode.TO) return 'ТО авто';
  return row.planMetricName;
}

function totalsSortOrder(row: any): number {
  if (row.segmentCode === PlanningSegmentCode.KTK_VVO) return 10;
  if (row.segmentCode === PlanningSegmentCode.KTK_MOW) return 20;
  if (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === 'AUTO_PLAN_TRUCK') return 30;
  if (row.segmentCode === PlanningSegmentCode.AUTO && row.planMetricCode === 'AUTO_PLAN_KTK') return 40;
  if (row.segmentCode === PlanningSegmentCode.RAIL) return 50;
  if (row.segmentCode === PlanningSegmentCode.EXTRA) return 60;
  if (row.segmentCode === PlanningSegmentCode.TO) return 70;
  return 999;
}

type SegmentBlockOptions = {
  includeMonthTotalColumn?: boolean;
};

function appendSegmentReportBlock(
  sheet: ExcelJS.Worksheet,
  report: any,
  year: number,
  month: number,
  startRow: number,
  options: SegmentBlockOptions = {}
): number {
  const includeMonthTotalColumn = options.includeMonthTotalColumn ?? true;
  const blockStartCol = 1;
  const dataEndCol = report.daysInMonth + (includeMonthTotalColumn ? 2 : 1);
  const spacerCol = dataEndCol + 1;
  const dashboardStartCol = spacerCol + 1;
  const blockEndCol = Math.max(dataEndCol, dashboardStartCol + 3);
  const titleRow = sheet.getRow(startRow);
  titleRow.getCell(1).value = report.segment.name;
  titleRow.getCell(1).font = { bold: true, size: 12 };
  titleRow.height = 22;
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionTitle } };
  for (let c = 1; c <= blockEndCol; c += 1) {
    titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionTitle } };
  }
  for (let d = 1; d <= report.daysInMonth; d += 1) {
    titleRow.getCell(d + 1).value = d;
    titleRow.getCell(d + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.getCell(d + 1).font = { bold: true };
  }
  if (includeMonthTotalColumn) {
    titleRow.getCell(report.daysInMonth + 2).value = 'ИТОГО';
    titleRow.getCell(report.daysInMonth + 2).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.getCell(report.daysInMonth + 2).font = { bold: true };
  }
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.commit();

  const headerRow = sheet.getRow(startRow + 1);
  headerRow.getCell(1).value = 'Показатель';
  headerRow.font = { bold: true, italic: true, color: { argb: 'FF444444' } };
  headerRow.height = 20;
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  for (let d = 1; d <= report.daysInMonth; d += 1) {
    const date = new Date(year, month - 1, d);
    headerRow.getCell(d + 1).value = WEEK_DAYS[date.getDay()];
    headerRow.getCell(d + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    if (date.getDay() === 0 || date.getDay() === 6) {
      headerRow.getCell(d + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
    }
  }
  headerRow.commit();

  let rowCursor = startRow + 2;
  report.gridRows.forEach((row: any) => {
    const dataRow = sheet.getRow(rowCursor);
    dataRow.height = 20;
    dataRow.getCell(1).value = normalizeMetricName(row.metricCode, row.name);
    dataRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    row.dayValues.forEach((value: number | null, idx: number) => {
      dataRow.getCell(idx + 2).value = value ?? null;
      dataRow.getCell(idx + 2).alignment = { horizontal: 'center', vertical: 'middle' };
      const dayDate = new Date(year, month - 1, idx + 1);
      if (dayDate.getDay() === 0 || dayDate.getDay() === 6) {
        dataRow.getCell(idx + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
      }
    });
    if (includeMonthTotalColumn) {
      dataRow.getCell(report.daysInMonth + 2).value = row.monthTotal;
      dataRow.getCell(report.daysInMonth + 2).font = { bold: true };
      dataRow.getCell(report.daysInMonth + 2).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (!row.isEditable) {
      dataRow.eachCell((cell, col) => {
        if (col <= dataEndCol) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.readonly } };
        }
      });
    }
    dataRow.commit();
    rowCursor += 1;
  });

  const dashboardHeight = writeDashboardInline(sheet, report.segment.code, report.dashboard || {}, startRow, dashboardStartCol);

  const blockEndRow = Math.max(rowCursor - 1, startRow + dashboardHeight - 1);
  applyDottedGridRange(sheet, startRow, blockEndRow, 1, dataEndCol);
  applyDottedGridRange(sheet, startRow, blockEndRow, dashboardStartCol, dashboardStartCol + 2);
  for (let r = startRow; r <= blockEndRow; r += 1) {
    const sep = sheet.getRow(r).getCell(spacerCol);
    sep.border = {
      left: { style: 'medium', color: { argb: 'FFB9C4D0' } },
    };
  }
  applyOuterBorder(sheet, startRow, blockEndRow, blockStartCol, blockEndCol);

  return rowCursor;
}

function writeDashboardInline(
  sheet: ExcelJS.Worksheet,
  segmentCode: PlanningSegmentCode,
  dashboard: Record<string, unknown>,
  startRow: number,
  startCol: number
): number {
  if (segmentCode === PlanningSegmentCode.AUTO) {
    const truck = (dashboard.truck || {}) as Record<string, unknown>;
    const ktk = (dashboard.ktk || {}) as Record<string, unknown>;
    const rows: Array<{ label: string; v1: number; v2: number; percent?: boolean }> = [
      { label: 'План на месяц', v1: Number(truck.planMonth ?? 0), v2: Number(ktk.planMonth ?? 0) },
      { label: 'План на дату', v1: Number(truck.planToDate ?? 0), v2: Number(ktk.planToDate ?? 0) },
      { label: 'Выполнение на дату', v1: Number(truck.factToDate ?? 0), v2: Number(ktk.factToDate ?? 0) },
      { label: 'Выполнение плана % по месяцу', v1: Number(truck.completionMonthPct ?? 0), v2: Number(ktk.completionMonthPct ?? 0), percent: true },
      { label: 'Выполнение плана % на дату', v1: Number(truck.completionToDatePct ?? 0), v2: Number(ktk.completionToDatePct ?? 0), percent: true },
      { label: 'Среднее кол-во в день', v1: Number(truck.avgPerDay ?? 0), v2: Number(ktk.avgPerDay ?? 0) },
    ];

    const header = sheet.getRow(startRow);
    header.getCell(startCol).value = 'Дашборд';
    header.getCell(startCol).font = { bold: true };
    header.getCell(startCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboard } };
    header.getCell(startCol + 1).value = 'Автовозы';
    header.getCell(startCol + 2).value = 'Авто в ктк';
    header.getCell(startCol + 1).font = { bold: true };
    header.getCell(startCol + 2).font = { bold: true };
    header.getCell(startCol + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboard } };
    header.getCell(startCol + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboard } };
    header.commit();

    rows.forEach((item, index) => {
      const row = sheet.getRow(startRow + 1 + index);
      row.getCell(startCol).value = item.label;
      row.getCell(startCol + 1).value = item.percent ? item.v1 / 100 : item.v1;
      row.getCell(startCol + 2).value = item.percent ? item.v2 / 100 : item.v2;
      row.getCell(startCol + 1).numFmt = item.percent ? '0.0%' : '#,##0';
      row.getCell(startCol + 2).numFmt = item.percent ? '0.0%' : '#,##0';
      row.getCell(startCol + 1).alignment = { horizontal: 'center' };
      row.getCell(startCol + 2).alignment = { horizontal: 'center' };
      row.commit();
    });

    const debtStart = startRow + 1 + rows.length + 1;
    const debtOverloadRow = sheet.getRow(debtStart);
    debtOverloadRow.getCell(startCol).value = 'Задолженность перегруз (₽)';
    debtOverloadRow.getCell(startCol + 1).value = Number(dashboard.debtOverload ?? 0);
    debtOverloadRow.getCell(startCol + 1).numFmt = '#,##0';
    debtOverloadRow.getCell(startCol + 1).alignment = { horizontal: 'center' };
    debtOverloadRow.commit();

    const debtCashbackRow = sheet.getRow(debtStart + 1);
    debtCashbackRow.getCell(startCol).value = 'Задолженность кэшбек (₽)';
    debtCashbackRow.getCell(startCol + 1).value = Number(dashboard.debtCashback ?? 0);
    debtCashbackRow.getCell(startCol + 1).numFmt = '#,##0';
    debtCashbackRow.getCell(startCol + 1).alignment = { horizontal: 'center' };
    debtCashbackRow.commit();

    return 1 + rows.length + 1 + 2;
  }

  const rows = toDashboardRows(segmentCode, dashboard);
  rows.forEach((item, index) => {
    const row = sheet.getRow(startRow + index);
    row.getCell(startCol + 1).value = item.label;
    row.getCell(startCol + 2).value = item.kind === 'percent' ? item.value / 100 : item.value;
    row.getCell(startCol + 2).numFmt = item.kind === 'percent' ? '0.0%' : '#,##0';
    row.getCell(startCol + 2).alignment = { horizontal: 'center' };
    row.commit();
  });
  return rows.length;
}

function toDashboardRows(
  segmentCode: PlanningSegmentCode,
  dashboard: Record<string, unknown>
): Array<{ label: string; value: number; kind: 'percent' | 'integer' | 'currency' }> {
  const base = [
    { key: 'planMonth', label: 'План на месяц', kind: 'integer' as const },
    { key: 'planToDate', label: 'План на дату', kind: 'integer' as const },
    { key: 'factToDate', label: 'Выполнение на дату', kind: 'integer' as const },
    { key: 'monthFact', label: 'Факт за месяц', kind: 'integer' as const },
    { key: 'completionMonthPct', label: 'Выполнение % по месяцу', kind: 'percent' as const },
    { key: 'completionToDatePct', label: 'Выполнение % на дату', kind: 'percent' as const },
    { key: 'avgPerDay', label: 'Среднее в день', kind: 'integer' as const },
  ];

  const extra: Array<{ key: string; label: string; kind: 'percent' | 'integer' | 'currency' }> = [];
  if (segmentCode === PlanningSegmentCode.KTK_VVO || segmentCode === PlanningSegmentCode.KTK_MOW) {
    extra.push(
      { key: 'grossTotal', label: 'Вал. Общий', kind: 'currency' },
      { key: 'grossAvgPerDay', label: 'Ср. вал сутки', kind: 'currency' },
      { key: 'trucksAvgOnLine', label: 'Средняя ТС на линии', kind: 'integer' }
    );
  }
  if (segmentCode === PlanningSegmentCode.AUTO) {
    const truck = (dashboard.truck || {}) as Record<string, unknown>;
    const ktk = (dashboard.ktk || {}) as Record<string, unknown>;
    extra.push(
      { key: 'truckPlanMonth', label: 'План (автовывоз + шторы)', kind: 'integer' },
      { key: 'ktkPlanMonth', label: 'План (авто в ктк)', kind: 'integer' },
      { key: 'waitingTotal', label: 'В ожидании отгрузки', kind: 'integer' },
      { key: 'waitingTruck', label: 'В ожидании - Автовозы', kind: 'integer' },
      { key: 'waitingKtk', label: 'В ожидании - Авто в ктк', kind: 'integer' },
      { key: 'waitingCurtain', label: 'В ожидании - Шторы', kind: 'integer' },
      { key: 'debtOverload', label: 'Задолженность перегруз', kind: 'currency' },
      { key: 'debtCashback', label: 'Задолженность кэшбек', kind: 'currency' }
    );
    dashboard.truckPlanMonth = Number(truck.planMonth ?? 0);
    dashboard.ktkPlanMonth = Number(ktk.planMonth ?? 0);
  }

  return [...base, ...extra]
    .filter((item) => typeof dashboard[item.key] === 'number')
    .map((item) => ({ label: item.label, value: Number(dashboard[item.key] ?? 0), kind: item.kind }));
}

function applyGrid(sheet: ExcelJS.Worksheet): void {
  const border = {
    top: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    left: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    bottom: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    right: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
  };

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = border;
    });
  });
}

function applyDottedGridRange(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  const border = {
    top: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    left: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    bottom: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
    right: { style: 'dotted' as const, color: { argb: 'FF2F2F2F' } },
  };

  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = sheet.getRow(r).getCell(c);
      cell.border = border;
    }
  }
}

function applyOuterBorder(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  const medium = { style: 'medium' as const, color: { argb: 'FF9E9E9E' } };
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = sheet.getRow(r).getCell(c);
      const current = cell.border ?? {};
      cell.border = {
        top: r === startRow ? medium : current.top,
        bottom: r === endRow ? medium : current.bottom,
        left: c === startCol ? medium : current.left,
        right: c === endCol ? medium : current.right,
      };
    }
  }
}
