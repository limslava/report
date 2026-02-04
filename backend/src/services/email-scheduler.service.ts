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

const WEEK_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

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
      const shouldSend = checkSchedule(schedule, now);
      if (shouldSend) {
        await sendScheduledEmailNow(schedule);
        schedule.lastSent = now;
        await emailScheduleRepo.save(schedule);
      }
    }
  } catch (error) {
    logger.error('Error processing scheduled emails:', error);
  }
};

const checkSchedule = (schedule: EmailSchedule, now: Date): boolean => {
  const { frequency, schedule: config } = schedule;
  const lastSent = schedule.lastSent;
  const scheduledTime = config.time || '09:00';
  const [hour, minute] = scheduledTime.split(':').map(Number);
  const isAfterTime = now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (lastSent && lastSent >= todayStart) {
    return false;
  }

  if (frequency === 'daily') {
    if (Array.isArray(config.daysOfWeek) && config.daysOfWeek.length > 0) {
      const dayIso = now.getDay() === 0 ? 7 : now.getDay();
      if (!config.daysOfWeek.includes(dayIso)) {
        return false;
      }
    }
    return isAfterTime;
  }

  if (frequency === 'weekly') {
    const dayIso = now.getDay() === 0 ? 7 : now.getDay();
    const days = Array.isArray(config.daysOfWeek) && config.daysOfWeek.length > 0 ? config.daysOfWeek : [1];
    if (!days.includes(dayIso)) {
      return false;
    }
    return isAfterTime;
  }

  if (frequency === 'monthly') {
    const dayOfMonth = Number(config.dayOfMonth || 1);
    if (now.getDate() !== dayOfMonth) {
      return false;
    }
    return isAfterTime;
  }

  return false;
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
        `<p>Во вложении отчет СВ за ${ddmmyyyy}.</p>`,
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
      const dataSheet = workbook.addWorksheet('Планирование v2');
      const dashboardSheet = workbook.addWorksheet('Дашборд');
      fillPlanningSheet(dataSheet, report, year, month);
      fillDashboardSheet(dashboardSheet, report.segment.code, report.dashboard || {});

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      await sendEmailWithAttachment(
        schedule.recipients,
        `Планирование v2 - ${report.segment.name} - ${ddmmyyyy}`,
        `<p>Во вложении отчет Планирование v2 (${report.segment.name}) за ${ddmmyyyy}.</p>`,
        {
          filename: `Планирование v2 - ${report.segment.name} - ${ddmmyyyy}.xlsx`,
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

async function buildSvExcelFromData(year: number, month: number, asOfDate: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planningSheet = workbook.addWorksheet('Планирование v2');
  const totalSheet = workbook.addWorksheet('ИТОГО v2');
  const daysInMonth = new Date(year, month, 0).getDate();

  const segmentOrder: PlanningSegmentCode[] = [
    PlanningSegmentCode.KTK_VVO,
    PlanningSegmentCode.KTK_MOW,
    PlanningSegmentCode.AUTO,
    PlanningSegmentCode.RAIL,
    PlanningSegmentCode.EXTRA,
    PlanningSegmentCode.TO,
  ];

  let cursor = 1;
  for (const segmentCode of segmentOrder) {
    const report = await planningV2ReportService.getSegmentReport({
      segmentCode,
      year,
      month,
      asOfDate,
    });
    cursor = appendSegmentReportBlock(planningSheet, report, year, month, cursor);
    cursor += 2;
  }

  // Global layout for "Планирование v2"
  planningSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  planningSheet.getColumn(1).width = 42;
  for (let d = 1; d <= daysInMonth; d += 1) {
    planningSheet.getColumn(d + 1).width = 5.3;
  }
  planningSheet.getColumn(daysInMonth + 2).width = 9.5; // ИТОГО
  planningSheet.getColumn(daysInMonth + 3).width = 2; // spacer
  planningSheet.getColumn(daysInMonth + 4).width = 14; // dashboard title column
  planningSheet.getColumn(daysInMonth + 5).width = 24; // dashboard metric
  planningSheet.getColumn(daysInMonth + 6).width = 14; // dashboard value 1
  planningSheet.getColumn(daysInMonth + 7).width = 14; // dashboard value 2

  const yearTotals = await planningV2TotalsService.getYearTotals(year);
  const monthNamesShort = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  totalSheet.addRow(['Сегмент', 'Показатель', ...monthNamesShort, 'Итог за год']);
  totalSheet.getRow(1).font = { bold: true };
  totalSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } };
  totalSheet.columns = [{ width: 26 }, { width: 22 }, ...Array.from({ length: 12 }, () => ({ width: 10 })), { width: 14 }];

  const sortedTotals = [...yearTotals].sort((a, b) => totalsSortOrder(a) - totalsSortOrder(b));
  let lastGroup = '';
  sortedTotals.forEach((row) => {
    const group = totalsGroupTitle(row);
    if (group !== lastGroup) {
      const groupRow = totalSheet.addRow([group, '', ...Array.from({ length: 13 }, () => '')]);
      groupRow.font = { bold: true };
      groupRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      lastGroup = group;
    }

    if (row.kind === 'PLAN_FLOW') {
      const segmentLabel = totalsSegmentLabel(row);
      const baseRow = totalSheet.addRow([segmentLabel, 'Базовый план', ...row.months.map((m) => m.basePlan), row.yearlyBasePlan]);
      const factRow = totalSheet.addRow([segmentLabel, 'Факт', ...row.months.map((m) => m.fact), row.yearlyFact]);
      const carryRow = totalSheet.addRow([segmentLabel, 'План с переносом', ...row.months.map((m) => m.carryPlan), row.yearlyCarryPlan]);
      const pctRow = totalSheet.addRow([segmentLabel, 'Выполнение плана', ...row.months.map((m) => m.completionPct / 100), row.yearlyCompletionPct / 100]);
      pctRow.eachCell((cell, colNumber) => {
        if (colNumber >= 3) cell.numFmt = '0.0%';
      });
      [baseRow, factRow, carryRow].forEach((r) =>
        r.eachCell((cell, colNumber) => {
          if (colNumber >= 3) cell.numFmt = '#,##0';
        })
      );
    } else {
      const factRow = totalSheet.addRow([totalsSegmentLabel(row), 'Факт', ...row.months.map((m) => m.fact), row.yearlyFact]);
      factRow.eachCell((cell, colNumber) => {
        if (colNumber >= 3) cell.numFmt = '#,##0';
      });
    }
  });

  const currentMonthCol = month + 2;
  totalSheet.getColumn(currentMonthCol).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
  });
  totalSheet.getColumn(15).eachCell((cell) => {
    cell.font = { ...(cell.font || {}), bold: true };
  });
  applyGrid(totalSheet);

  return Buffer.from(await workbook.xlsx.writeBuffer());
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

function appendSegmentReportBlock(
  sheet: ExcelJS.Worksheet,
  report: any,
  year: number,
  month: number,
  startRow: number
): number {
  const blockStartCol = 1;
  const dashboardStartCol = report.daysInMonth + 4;
  const blockEndCol = Math.max(report.daysInMonth + 2, dashboardStartCol + 3);
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
  titleRow.getCell(report.daysInMonth + 2).value = 'ИТОГО';
  titleRow.getCell(report.daysInMonth + 2).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.getCell(report.daysInMonth + 2).font = { bold: true };
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
    dataRow.getCell(report.daysInMonth + 2).value = row.monthTotal;
    dataRow.getCell(report.daysInMonth + 2).font = { bold: true };
    dataRow.getCell(report.daysInMonth + 2).alignment = { horizontal: 'center', vertical: 'middle' };
    if (!row.isEditable) {
      dataRow.eachCell((cell, col) => {
        if (col <= report.daysInMonth + 2) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.readonly } };
        }
      });
    }
    dataRow.commit();
    rowCursor += 1;
  });

  const dashboardHeight = writeDashboardInline(sheet, report.segment.code, report.dashboard || {}, startRow, dashboardStartCol);

  const blockEndRow = Math.max(rowCursor - 1, startRow + dashboardHeight - 1);
  applyDottedGridRange(sheet, startRow, blockEndRow, 1, report.daysInMonth + 2);
  applyDottedGridRange(sheet, startRow, blockEndRow, dashboardStartCol, dashboardStartCol + 2);
  for (let r = startRow; r <= blockEndRow; r += 1) {
    const sep = sheet.getRow(r).getCell(dashboardStartCol - 1);
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

function fillPlanningSheet(sheet: ExcelJS.Worksheet, report: any, year: number, month: number): void {
  const header = ['Показатель', ...Array.from({ length: report.daysInMonth }, (_, i) => i + 1), 'ИТОГО'];
  const weekdays = ['', ...Array.from({ length: report.daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return WEEK_DAYS[date.getDay()];
  }), ''];

  sheet.addRow(header);
  sheet.addRow(weekdays);

  report.gridRows.forEach((row: any) => {
    sheet.addRow([row.name, ...row.dayValues.map((v: number | null) => v ?? ''), row.monthTotal]);
  });

  sheet.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
  sheet.columns = sheet.columns.map((col, index) => {
    if (index === 0) return { ...col, width: 42 };
    if (index === report.daysInMonth + 1) return { ...col, width: 12 };
    return { ...col, width: 7 };
  });

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF666666' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } };

  for (let d = 1; d <= report.daysInMonth; d += 1) {
    const date = new Date(year, month - 1, d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend) {
      sheet.getColumn(d + 1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }
  }

  applyGrid(sheet);
}

function fillDashboardSheet(
  sheet: ExcelJS.Worksheet,
  segmentCode: PlanningSegmentCode,
  dashboard: Record<string, unknown>
): void {
  if (segmentCode === PlanningSegmentCode.AUTO) {
    fillAutoDashboardSheet(sheet, dashboard);
    return;
  }

  sheet.addRow(['Показатель', 'Значение']);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [{ width: 44 }, { width: 20 }];

  const rows = toDashboardRows(segmentCode, dashboard);
  rows.forEach((row) => {
    const excelRow = sheet.addRow([row.label, row.value]);
    if (row.kind === 'percent') {
      excelRow.getCell(2).numFmt = '0.0%';
      excelRow.getCell(2).value = Number(row.value) / 100;
    } else if (row.kind === 'integer') {
      excelRow.getCell(2).numFmt = '#,##0';
    } else if (row.kind === 'currency') {
      excelRow.getCell(2).numFmt = '#,##0';
    }
  });

  applyGrid(sheet);
}

function fillAutoDashboardSheet(sheet: ExcelJS.Worksheet, dashboard: Record<string, unknown>): void {
  const truck = (dashboard.truck || {}) as Record<string, unknown>;
  const ktk = (dashboard.ktk || {}) as Record<string, unknown>;

  sheet.addRow(['Показатель', 'Автовозы', 'Авто в ктк']);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } };
  });
  sheet.columns = [{ width: 42 }, { width: 20 }, { width: 20 }];

  const pairRows: Array<{ label: string; truck: number; ktk: number; percent?: boolean }> = [
    { label: 'План на месяц', truck: Number(truck.planMonth ?? 0), ktk: Number(ktk.planMonth ?? 0) },
    { label: 'План на дату', truck: Number(truck.planToDate ?? 0), ktk: Number(ktk.planToDate ?? 0) },
    { label: 'Выполнение на дату', truck: Number(truck.factToDate ?? 0), ktk: Number(ktk.factToDate ?? 0) },
    { label: 'Выполнение плана % по месяцу', truck: Number(truck.completionMonthPct ?? 0), ktk: Number(ktk.completionMonthPct ?? 0), percent: true },
    { label: 'Выполнение плана % на дату', truck: Number(truck.completionToDatePct ?? 0), ktk: Number(ktk.completionToDatePct ?? 0), percent: true },
    { label: 'Среднее кол-во в день', truck: Number(truck.avgPerDay ?? 0), ktk: Number(ktk.avgPerDay ?? 0) },
  ];

  pairRows.forEach((item) => {
    const row = sheet.addRow([item.label, item.truck, item.ktk]);
    if (item.percent) {
      row.getCell(2).numFmt = '0.0%';
      row.getCell(3).numFmt = '0.0%';
      row.getCell(2).value = item.truck / 100;
      row.getCell(3).value = item.ktk / 100;
    } else {
      row.getCell(2).numFmt = '#,##0';
      row.getCell(3).numFmt = '#,##0';
    }
  });

  sheet.addRow([]);
  const singleRows: Array<{ label: string; value: number }> = [
    { label: 'В ожидании отгрузки т/с', value: Number(dashboard.waitingTotal ?? 0) },
    { label: 'Автовоз', value: Number(dashboard.waitingTruck ?? 0) },
    { label: 'КТК', value: Number(dashboard.waitingKtk ?? 0) },
    { label: 'Штора', value: Number(dashboard.waitingCurtain ?? 0) },
    { label: 'Задолженность перегруз (₽)', value: Number(dashboard.debtOverload ?? 0) },
    { label: 'Задолженность кэшбек (₽)', value: Number(dashboard.debtCashback ?? 0) },
  ];
  singleRows.forEach((item) => {
    const row = sheet.addRow([item.label, item.value, '']);
    row.getCell(2).numFmt = '#,##0';
  });

  applyGrid(sheet);
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
