import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { OperationsPreviewState } from '../models/operations-preview-state.model';
import { PlanningDailyValue } from '../models/planning-daily-value.model';
import { PlanningMetric } from '../models/planning-metric.model';
import { PlanningMonthlyPlan } from '../models/planning-monthly-plan.model';
import { PlanningSegment } from '../models/planning-segment.model';
import { PlanningPlanMetricCode, PlanningSegmentCode } from '../models/planning.enums';
import {
  buildKtkVvoSummary,
  KTK_VVO_ON_LINE_FROM_SCHEDULE,
  KTK_VVO_SUMMARY_SYSTEM_FROM,
  type KtkVvoHistory,
  type KtkVvoSummary,
  type SchedulePerson,
  type SystemDayValues,
} from './ktk-vvo-summary.model';

const HISTORY_FILE = 'ktk-vvo-history.json';
const SCHEDULE_SCOPE = 'ktk_vvo_preview_v1';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const monthTitle = (month: string): string => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

let historyCache: KtkVvoHistory | null = null;

/** История из google-таблицы отдела (разовый перенос 15.09.2026). Путь — как у других файлов assets. */
function loadHistory(): KtkVvoHistory {
  if (historyCache) return historyCache;
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'planning', HISTORY_FILE),
    path.resolve(process.cwd(), 'backend', 'assets', 'planning', HISTORY_FILE),
    path.resolve(__dirname, '..', '..', 'assets', 'planning', HISTORY_FILE),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  historyCache = file
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KtkVvoHistory)
    : { days: [], months: [] };
  return historyCache;
}

const toNumber = (value: string | null): number | null => (value === null ? null : Number(value));
const ymd = (value: Date | string): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/** Собирает данные системы (ежедневный отчёт, план на месяц, график) и строит сводную. */
export async function loadKtkVvoSummary(asOfDate: string): Promise<KtkVvoSummary> {
  const segment = await AppDataSource.getRepository(PlanningSegment).findOne({ where: { code: PlanningSegmentCode.KTK_VVO } });
  const systemValues = new Map<string, SystemDayValues>();
  const basePlans = new Map<string, number>();

  if (segment) {
    const metrics = await AppDataSource.getRepository(PlanningMetric).find({ where: { segmentId: segment.id } });
    const codeById = new Map(metrics.map((metric) => [metric.id, metric.code]));
    const [year, month] = asOfDate.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const values = await AppDataSource.getRepository(PlanningDailyValue)
      .createQueryBuilder('value')
      .where('value.segmentId = :segmentId', { segmentId: segment.id })
      .andWhere('value.date >= :from AND value.date <= :to', { from: `${KTK_VVO_SUMMARY_SYSTEM_FROM}-01`, to: monthEnd })
      .getMany();
    values.forEach((row) => {
      const code = codeById.get(row.metricId);
      const value = toNumber(row.value);
      if (!code || value === null) return;
      const date = ymd(row.date);
      const entry = systemValues.get(date) ?? {};
      if (code === 'ktk_vvo_plan_unload_load' || code === 'ktk_vvo_plan_move') entry.plan = (entry.plan ?? 0) + value;
      else if (code === 'ktk_vvo_fact_move_own') entry.own = value;
      else if (code === 'ktk_vvo_fact_move_hired') entry.hired = value;
      else if (code === 'ktk_vvo_fact_trucks_on_line') entry.onLine = value;
      else return;
      systemValues.set(date, entry);
    });

    const plans = await AppDataSource.getRepository(PlanningMonthlyPlan).find({
      where: { segmentId: segment.id },
      relations: ['planMetrics'],
    });
    plans.forEach((plan) => {
      const metric = plan.planMetrics?.find((item) => item.code === PlanningPlanMetricCode.KTK_PLAN_REQUESTS);
      if (metric?.basePlan) basePlans.set(`${plan.year}-${String(plan.month).padStart(2, '0')}`, metric.basePlan);
    });
  }

  const schedule = await AppDataSource.getRepository(OperationsPreviewState).findOne({ where: { scopeKey: SCHEDULE_SCOPE } });
  const payload = (schedule?.payload ?? {}) as {
    peopleByMonth?: Record<string, SchedulePerson[]>;
    overrides?: Record<string, Record<string, string>>;
  };

  return buildKtkVvoSummary({
    asOfDate,
    history: loadHistory(),
    systemFrom: KTK_VVO_SUMMARY_SYSTEM_FROM,
    onLineFromSchedule: KTK_VVO_ON_LINE_FROM_SCHEDULE,
    systemValues,
    basePlans,
    peopleByMonth: payload.peopleByMonth ?? {},
    factOverrides: payload.overrides ?? {},
  });
}

// ── оформление книги ──
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
// сетка таблиц — тонкие серые линии, заметные и на экране, и при печати
const GRID_COLOR = { argb: 'FF7F7F7F' };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: GRID_COLOR },
  left: { style: 'thin', color: GRID_COLOR },
  bottom: { style: 'thin', color: GRID_COLOR },
  right: { style: 'thin', color: GRID_COLOR },
};

function styleRange(sheet: ExcelJS.Worksheet, fromRow: number, toRow: number, columns: number, style: (cell: ExcelJS.Cell) => void) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = 1; col <= columns; col += 1) style(sheet.getCell(row, col));
  }
}

/** Двухстрочная шапка: верхние ячейки объединены, где нет подзаголовка. */
function writeHeader(sheet: ExcelJS.Worksheet, titles: Array<[string, string | null]>) {
  titles.forEach(([title, subtitle], index) => {
    const col = index + 1;
    sheet.getCell(1, col).value = title;
    if (subtitle) sheet.getCell(2, col).value = subtitle;
    else sheet.mergeCells(1, col, 2, col);
  });
  styleRange(sheet, 1, 2, titles.length, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  sheet.getRow(1).height = 32;
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
}

const formula = (text: string, result: number | null): ExcelJS.CellFormulaValue => ({ formula: text, result: result ?? undefined });

function writeMonthSheet(workbook: ExcelJS.Workbook, month: KtkVvoSummary['months'][number]) {
  const sheet = workbook.addWorksheet(monthTitle(month.month));
  writeHeader(sheet, [
    ['Дата', null],
    ['Всего ТС в парке', null],
    ['Факт на линии', null],
    ['План заявок на сутки ВСЕГО', null],
    ['Соб ТС', 'Факт заявок'],
    ['Частники', 'Факт заявок'],
    ['Факт заявок за сутки', null],
  ]);
  const first = 3;
  month.days.forEach((day, index) => {
    const row = first + index;
    const [year, monthNo, dayNo] = day.date.split('-').map(Number);
    sheet.getCell(row, 1).value = new Date(Date.UTC(year, monthNo - 1, dayNo));
    sheet.getCell(row, 1).numFmt = 'dd.mm.yyyy';
    sheet.getCell(row, 2).value = day.fleet;
    sheet.getCell(row, 3).value = day.onLine;
    sheet.getCell(row, 4).value = day.plan;
    sheet.getCell(row, 5).value = day.own;
    sheet.getCell(row, 6).value = day.hired;
    if (day.own !== null || day.hired !== null) {
      sheet.getCell(row, 7).value = formula(`E${row}+F${row}`, (day.own ?? 0) + (day.hired ?? 0));
    }
  });
  const last = first + month.days.length - 1;
  const totalRow = last + 1;
  const averageRow = last + 2;
  const counted = month.days.filter((day) => day.own !== null || day.hired !== null).length || 1;
  sheet.getCell(totalRow, 1).value = 'Итого за месяц';
  sheet.getCell(totalRow, 2).value = formula(`IFERROR(AVERAGE(B${first}:B${last}),"")`, month.fleetAvg);
  sheet.getCell(totalRow, 3).value = formula(`IFERROR(AVERAGE(C${first}:C${last}),"")`, month.onLineAvg);
  sheet.getCell(totalRow, 4).value = formula(`SUM(D${first}:D${last})`, month.planSum);
  sheet.getCell(totalRow, 5).value = formula(`SUM(E${first}:E${last})`, month.ownSum);
  sheet.getCell(totalRow, 6).value = formula(`SUM(F${first}:F${last})`, month.hiredSum);
  sheet.getCell(totalRow, 7).value = formula(`SUM(G${first}:G${last})`, month.factSum);
  sheet.getCell(averageRow, 1).value = 'Среднее в день';
  sheet.getCell(averageRow, 4).value = formula(`IFERROR(AVERAGE(D${first}:D${last}),"")`, month.planSum / (month.days.filter((day) => day.plan !== null).length || 1));
  sheet.getCell(averageRow, 5).value = formula(`IFERROR(AVERAGE(E${first}:E${last}),"")`, month.ownSum / counted);
  sheet.getCell(averageRow, 6).value = formula(`IFERROR(AVERAGE(F${first}:F${last}),"")`, month.hiredSum / counted);
  sheet.getCell(averageRow, 7).value = formula(`IFERROR(AVERAGE(G${first}:G${last}),"")`, month.factSum / counted);

  styleRange(sheet, first, averageRow, 7, (cell) => {
    cell.border = THIN;
    if (Number(cell.col) > 1) cell.alignment = { horizontal: 'center' };
  });
  styleRange(sheet, totalRow, averageRow, 7, (cell) => {
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
  });
  [2, 3].forEach((col) => { sheet.getCell(totalRow, col).numFmt = '0.0'; });
  [4, 5, 6, 7].forEach((col) => { sheet.getCell(averageRow, col).numFmt = '0.0'; });
  sheet.columns = [{ width: 16 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 13 }];
  return sheet;
}

function writeSummarySheet(workbook: ExcelJS.Workbook, summary: KtkVvoSummary) {
  const sheet = workbook.addWorksheet('Сводная');
  writeHeader(sheet, [
    ['Месяц', null],
    ['Всего ТС в парке', null],
    ['Факт на линии', null],
    ['Коэф. загрузки', null],
    ['План заявок месяц, шт', null],
    ['Соб ТС', 'Факт заявок, шт.'],
    ['Частники', 'Факт заявок, шт.'],
    ['Факт заявок месяц, шт.', null],
  ]);
  summary.months.forEach((month, index) => {
    const row = 3 + index;
    sheet.getCell(row, 1).value = monthTitle(month.month);
    sheet.getCell(row, 2).value = month.fleetAvg;
    sheet.getCell(row, 3).value = month.onLineAvg;
    sheet.getCell(row, 4).value = month.loadFactor;
    sheet.getCell(row, 5).value = month.basePlan;
    sheet.getCell(row, 6).value = month.ownSum || null;
    sheet.getCell(row, 7).value = month.hiredSum || null;
    sheet.getCell(row, 8).value = month.factSum || null;
    sheet.getCell(row, 2).numFmt = '0.0';
    sheet.getCell(row, 3).numFmt = '0.0';
    sheet.getCell(row, 4).numFmt = '0.00';
  });
  styleRange(sheet, 3, 2 + summary.months.length, 8, (cell) => {
    cell.border = THIN;
    if (Number(cell.col) > 1) cell.alignment = { horizontal: 'center' };
  });
  sheet.columns = [{ width: 16 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }];
}

function writeVehiclesSheet(workbook: ExcelJS.Workbook, summary: KtkVvoSummary) {
  const sheet = workbook.addWorksheet('ТС');
  const [year, month, day] = summary.asOfDate.split('-').map(Number);
  sheet.getCell(1, 1).value = new Date(Date.UTC(year, month - 1, day));
  sheet.getCell(1, 1).numFmt = 'dd.mm.yyyy';
  sheet.getCell(1, 1).font = { bold: true };
  const header = ['№', 'Гос. знак', 'Комментарий: на линии / выходной', 'На линии'];
  header.forEach((title, index) => {
    const cell = sheet.getCell(2, index + 1);
    cell.value = title;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  summary.vehicles.forEach((vehicle, index) => {
    const row = 3 + index;
    sheet.getCell(row, 1).value = index + 1;
    sheet.getCell(row, 2).value = vehicle.plate;
    sheet.getCell(row, 3).value = vehicle.status || null;
    sheet.getCell(row, 4).value = vehicle.onLine || null;
    for (let col = 1; col <= 4; col += 1) sheet.getCell(row, col).border = THIN;
  });
  const totalRow = 3 + summary.vehicles.length;
  const onLine = summary.vehicles.filter((vehicle) => vehicle.onLine).length;
  for (let col = 1; col <= 4; col += 1) sheet.getCell(totalRow, col).border = THIN;
  sheet.getCell(totalRow, 3).value = 'Итого на линии';
  sheet.getCell(totalRow, 4).value = formula(`SUBTOTAL(9,D3:D${Math.max(3, totalRow - 1)})`, onLine);
  sheet.getRow(totalRow).font = { bold: true };
  sheet.columns = [{ width: 6 }, { width: 16 }, { width: 36 }, { width: 10 }];
}

/** Книга «Вариант 2»: «Сводная», лист на каждый месяц (по порядку), «ТС» на отчётную дату; открывается на текущем месяце. */
export async function buildKtkVvoSummaryExcel(asOfDate: string): Promise<Buffer> {
  const summary = await loadKtkVvoSummary(asOfDate);
  const workbook = new ExcelJS.Workbook();
  writeSummarySheet(workbook, summary);
  summary.months.forEach((month) => writeMonthSheet(workbook, month));
  writeVehiclesSheet(workbook, summary);
  workbook.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: summary.months.length, visibility: 'visible' }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
