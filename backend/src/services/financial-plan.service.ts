import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { FinancialPlanValue } from '../models/financial-plan-value.model';
import { FinancialVatRate } from '../models/financial-vat-rate.model';
import { User } from '../models/user.model';

export type FinancialPlanRow = {
  rowId: string;
  rowType: 'group' | 'direction' | 'metric';
  groupCode?: string;
  groupLabel?: string;
  directionCode?: string;
  directionLabel?: string;
  metricCode?: string;
  metricLabel?: string;
  editable?: boolean;
  valueType?: 'number' | 'percent' | 'currency';
  months?: Array<{ month: number; value: number | null }>;
  yearTotal?: number | null;
};

export type VatRateDTO = {
  id: string;
  effectiveFrom: string;
  rate: number;
  createdAt: string;
};

const GROUPS = [
  {
    code: 'OWN',
    label: 'Собственный',
    directions: [
      { code: 'KTK_VVO', label: 'Контейнерные перевозки - Владивосток' },
      { code: 'KTK_MOW', label: 'Контейнерные перевозки - Москва' },
      { code: 'AUTO_OWN', label: 'Автовозы собственные' },
      { code: 'TO_AUTO', label: 'ТО авто' },
    ],
  },
  {
    code: 'HIRED',
    label: 'Наемные',
    directions: [
      { code: 'KTK_VVO', label: 'Контейнерные перевозки - Владивосток' },
      { code: 'KTK_MOW', label: 'Контейнерные перевозки - Москва' },
      { code: 'AUTO_HIRED', label: 'Автовозы наемные' },
      { code: 'AUTO_KTK', label: 'Авто в ктк' },
      { code: 'RAIL', label: 'ЖД' },
      { code: 'CONSOLIDATED', label: 'Сборный груз' },
      { code: 'CURTAIN', label: 'Перевозка в наемной шторе' },
      { code: 'FORWARDING', label: 'Экспедирование' },
      { code: 'REPACKING', label: 'Перетарки/доукрепление' },
    ],
  },
] as const;

const METRICS = [
  { code: 'MARGIN', label: 'Маржинальность, %', editable: true, valueType: 'percent', includeYearTotal: false },
  { code: 'FIXED_COSTS', label: 'Постоянные расходы без НДС, руб', editable: true, valueType: 'currency', includeYearTotal: true },
  { code: 'SALES_WITH_VAT', label: 'План продаж с НДС, руб', editable: false, valueType: 'currency', includeYearTotal: true },
  { code: 'QUANTITY_PLAN', label: 'Количественный план, шт', editable: true, valueType: 'number', includeYearTotal: true },
  { code: 'PRICE_WITH_VAT', label: 'Цена с НДС, руб/шт', editable: true, valueType: 'currency', includeYearTotal: true },
  { code: 'FIN_RESULT', label: 'Финансовый результат плановый', editable: false, valueType: 'currency', includeYearTotal: true },
] as const;

const EDITABLE_METRICS = new Set<string>(METRICS.filter((metric) => metric.editable).map((metric) => metric.code));

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeDate(date: Date | string): Date {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'string') {
    return parseDate(date);
  }
  return new Date(date);
}

function formatIsoDate(date: Date | string): string {
  return normalizeDate(date).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function round(value: number, digits: number = 2): number {
  return Number(value.toFixed(digits));
}

function getValueKey(groupCode: string, directionCode: string, metricCode: string, month: number): string {
  return `${groupCode}__${directionCode}__${metricCode}__${month}`;
}

function buildRateTimeline(rates: Array<{ effectiveFrom: Date | string; rate: number }>) {
  return rates
    .map((rate) => {
      const normalized = normalizeDate(rate.effectiveFrom);
      return {
        ...rate,
        effectiveFrom: new Date(Date.UTC(
          normalized.getUTCFullYear(),
          normalized.getUTCMonth(),
          normalized.getUTCDate()
        )),
      };
    })
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
}

function buildVatFactors(year: number, rates: Array<{ effectiveFrom: Date | string; rate: number }>): Record<number, number> {
  const timeline = buildRateTimeline(rates);
  const factors: Record<number, number> = {};

  for (let month = 1; month <= 12; month += 1) {
    const totalDays = daysInMonth(year, month);
    let sum = 0;
    let rateIndex = 0;
    let currentRate = timeline.length > 0 ? timeline[0] : null;

    for (let day = 1; day <= totalDays; day += 1) {
      const currentDate = new Date(Date.UTC(year, month - 1, day));
      while (currentRate && rateIndex + 1 < timeline.length && timeline[rateIndex + 1].effectiveFrom <= currentDate) {
        rateIndex += 1;
        currentRate = timeline[rateIndex];
      }
      const rateValue = currentRate && currentRate.effectiveFrom <= currentDate ? currentRate.rate : 0;
      sum += 100 / (100 + rateValue);
    }

    factors[month] = sum / totalDays;
  }

  return factors;
}

function getVatWarning(year: number, rates: Array<{ effectiveFrom: Date | string }>): boolean {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  return !rates.some((rate) => normalizeDate(rate.effectiveFrom) <= yearStart);
}

export class FinancialPlanService {
  private readonly valuesRepo = AppDataSource.getRepository(FinancialPlanValue);
  private readonly vatRepo = AppDataSource.getRepository(FinancialVatRate);

  async getVatRates(): Promise<VatRateDTO[]> {
    const rates = await this.vatRepo.find({ order: { effectiveFrom: 'ASC' } });
    return rates.map((rate) => ({
      id: rate.id,
      effectiveFrom: formatIsoDate(rate.effectiveFrom),
      rate: Number(rate.rate),
      createdAt: rate.createdAt.toISOString(),
    }));
  }

  async getVatInfo(year: number): Promise<{ rates: VatRateDTO[]; warning: boolean }> {
    const rateEntities = await this.vatRepo.find({ order: { effectiveFrom: 'ASC' } });
    const rates = rateEntities.map((rate) => ({
      id: rate.id,
      effectiveFrom: formatIsoDate(rate.effectiveFrom),
      rate: Number(rate.rate),
      createdAt: rate.createdAt.toISOString(),
    }));

    return {
      rates,
      warning: getVatWarning(year, rateEntities),
    };
  }

  async addVatRate(user: User, payload: { effectiveFrom: string; rate: number }): Promise<VatRateDTO> {
    const effectiveFrom = parseDate(payload.effectiveFrom);
    const rateValue = payload.rate;

    if (!Number.isFinite(rateValue) || rateValue < 0) {
      throw new Error('Invalid VAT rate');
    }

    const existing = await this.vatRepo.findOne({ where: { effectiveFrom } });
    if (existing) {
      existing.rate = rateValue.toFixed(2);
      const saved = await this.vatRepo.save(existing);
      return {
        id: saved.id,
        effectiveFrom: formatIsoDate(saved.effectiveFrom),
        rate: Number(saved.rate),
        createdAt: saved.createdAt.toISOString(),
      };
    }

    const entity = this.vatRepo.create({
      effectiveFrom,
      rate: rateValue.toFixed(2),
      createdById: user.id,
    });

    const saved = await this.vatRepo.save(entity);
    return {
      id: saved.id,
      effectiveFrom: formatIsoDate(saved.effectiveFrom),
      rate: Number(saved.rate),
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async getReport(year: number): Promise<{ year: number; rows: FinancialPlanRow[]; vat: { rates: VatRateDTO[]; warning: boolean } }> {
    const values = await this.valuesRepo.find({ where: { year } });
    const rateEntities = await this.vatRepo.find({ order: { effectiveFrom: 'ASC' } });
    const vatRates = rateEntities.map((rate) => ({
      id: rate.id,
      effectiveFrom: formatIsoDate(rate.effectiveFrom),
      rate: Number(rate.rate),
      createdAt: rate.createdAt.toISOString(),
    }));

    const valueMap = new Map<string, number | null>();
    for (const value of values) {
      const key = getValueKey(value.groupCode, value.directionCode, value.metricCode, value.month);
      valueMap.set(key, value.value === null ? null : Number(value.value));
    }

    const vatFactors = buildVatFactors(
      year,
      rateEntities.map((rate) => ({ effectiveFrom: rate.effectiveFrom, rate: Number(rate.rate) }))
    );

    const rows: FinancialPlanRow[] = [];

    for (const group of GROUPS) {
      rows.push({
        rowId: `group_${group.code}`,
        rowType: 'group',
        groupCode: group.code,
        groupLabel: group.label,
      });

      for (const direction of group.directions) {
        rows.push({
          rowId: `direction_${group.code}_${direction.code}`,
          rowType: 'direction',
          groupCode: group.code,
          groupLabel: group.label,
          directionCode: direction.code,
          directionLabel: direction.label,
        });

        for (const metric of METRICS) {
          const months: Array<{ month: number; value: number | null }> = [];

          for (let month = 1; month <= 12; month += 1) {
            const margin = valueMap.get(getValueKey(group.code, direction.code, 'MARGIN', month)) ?? null;
            const fixed = valueMap.get(getValueKey(group.code, direction.code, 'FIXED_COSTS', month)) ?? null;
            const quantity = valueMap.get(getValueKey(group.code, direction.code, 'QUANTITY_PLAN', month)) ?? null;
            const price = valueMap.get(getValueKey(group.code, direction.code, 'PRICE_WITH_VAT', month)) ?? null;

            const sales = (quantity ?? 0) * (price ?? 0);
            const vatFactor = vatFactors[month] ?? 1;
            const marginFactor = (margin ?? 0) / 100;
            const result = sales * vatFactor * marginFactor - (fixed ?? 0);

            let value: number | null = null;

            if (metric.code === 'MARGIN') {
              value = margin;
            } else if (metric.code === 'FIXED_COSTS') {
              value = fixed;
            } else if (metric.code === 'QUANTITY_PLAN') {
              value = quantity;
            } else if (metric.code === 'PRICE_WITH_VAT') {
              value = price;
            } else if (metric.code === 'SALES_WITH_VAT') {
              value = round(sales);
            } else if (metric.code === 'FIN_RESULT') {
              value = round(result);
            }

            months.push({ month, value });
          }

          let yearTotal: number | null = null;
          if (metric.code === 'MARGIN') {
            const marginValues = months
              .map((item) => item.value)
              .filter((value): value is number => value !== null && value !== undefined);
            if (marginValues.length > 0) {
              const avg = marginValues.reduce((acc, item) => acc + item, 0) / marginValues.length;
              yearTotal = round(avg);
            }
          } else if (metric.code === 'PRICE_WITH_VAT') {
            const priceValues = months
              .map((item) => item.value)
              .filter((value): value is number => value !== null && value !== undefined);
            if (priceValues.length > 0) {
              const avg = priceValues.reduce((acc, item) => acc + item, 0) / priceValues.length;
              yearTotal = round(avg);
            }
          } else if (metric.includeYearTotal) {
            const numericValues = months.map((item) => item.value ?? 0);
            const hasAny = months.some((item) => item.value !== null && item.value !== undefined);
            yearTotal = hasAny ? round(numericValues.reduce((acc, item) => acc + item, 0)) : null;
          }

          rows.push({
            rowId: `metric_${group.code}_${direction.code}_${metric.code}`,
            rowType: 'metric',
            groupCode: group.code,
            groupLabel: group.label,
            directionCode: direction.code,
            directionLabel: direction.label,
            metricCode: metric.code,
            metricLabel: metric.label,
            editable: metric.editable,
            valueType: metric.valueType,
            months,
            yearTotal,
          });
        }
      }
    }

    return {
      year,
      rows,
      vat: {
        rates: vatRates,
        warning: getVatWarning(year, rateEntities),
      },
    };
  }

  async batchUpsertValues(user: User, payload: {
    year: number;
    updates: Array<{ groupCode: string; directionCode: string; metricCode: string; month: number; value: number | null }>;
  }): Promise<{ updated: number }> {
    const validDirections = new Map<string, Set<string>>();
    for (const group of GROUPS) {
      validDirections.set(group.code, new Set(group.directions.map((direction) => direction.code)));
    }

    const filteredUpdates = payload.updates.filter((update) => {
      if (!EDITABLE_METRICS.has(update.metricCode)) {
        return false;
      }
      if (!validDirections.has(update.groupCode)) {
        return false;
      }
      const directions = validDirections.get(update.groupCode);
      if (!directions || !directions.has(update.directionCode)) {
        return false;
      }
      if (!Number.isInteger(update.month) || update.month < 1 || update.month > 12) {
        return false;
      }
      return true;
    });

    if (filteredUpdates.length === 0) {
      return { updated: 0 };
    }

    await AppDataSource.transaction(async (manager) => {
      for (const update of filteredUpdates) {
        if (update.value === null) {
          await manager.delete(FinancialPlanValue, {
            year: payload.year,
            month: update.month,
            groupCode: update.groupCode,
            directionCode: update.directionCode,
            metricCode: update.metricCode,
          });
          continue;
        }

        await manager.upsert(
          FinancialPlanValue,
          {
            year: payload.year,
            month: update.month,
            groupCode: update.groupCode,
            directionCode: update.directionCode,
            metricCode: update.metricCode,
            value: update.value.toFixed(2),
            updatedById: user.id,
          },
          ['year', 'month', 'groupCode', 'directionCode', 'metricCode']
        );
      }
    });

    return { updated: filteredUpdates.length };
  }

  async buildExcelReport(year: number): Promise<Buffer> {
    const report = await this.getReport(year);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Фин.рез. план');

    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    const headerRow = sheet.addRow(['Вид', 'Показатель', ...monthNames, 'Итог за год']);
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F6FA' },
    };
    const groupFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEDEDED' },
    };
    const directionFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F5' },
    };
    const highlightFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F4FF' },
    };

    const totalColumns = 15;
    const colMaxLens = Array.from({ length: totalColumns }, () => 0);
    const monthStartCol = 3;
    const totalCol = monthStartCol + 12;

    const updateWidth = (colIndex: number, text?: string) => {
      if (!text) return;
      const len = text.length;
      if (len > colMaxLens[colIndex - 1]) {
        colMaxLens[colIndex - 1] = len;
      }
    };

    const formatDisplay = (value: number, format?: { numFmt: string; scale?: number }) => {
      if (!format) {
        return value.toLocaleString('ru-RU');
      }
      if (format.numFmt.includes('%')) {
        return `${value.toLocaleString('ru-RU')}%`;
      }
      if (format.numFmt.includes('₽')) {
        return `${value.toLocaleString('ru-RU')} ₽`;
      }
      return value.toLocaleString('ru-RU');
    };

    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = headerFill;
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinBorder;
      updateWidth(colNumber, String(cell.value ?? ''));
    });

    const metricFormats: Record<string, { numFmt: string; scale?: number }> = {
      MARGIN: { numFmt: '0.##%', scale: 0.01 },
      FIXED_COSTS: { numFmt: '#,##0" ₽"' },
      SALES_WITH_VAT: { numFmt: '#,##0" ₽"' },
      QUANTITY_PLAN: { numFmt: '#,##0' },
      PRICE_WITH_VAT: { numFmt: '#,##0" ₽"' },
      FIN_RESULT: { numFmt: '#,##0" ₽"' },
    };
    for (const row of report.rows) {
      if (row.rowType === 'group') {
        const excelRow = sheet.addRow([row.groupLabel ?? '', '', ...Array(13).fill('')]);
        excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.fill = groupFill;
          cell.font = { bold: true };
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber <= 2 ? 'left' : 'right',
            wrapText: colNumber <= 2,
          };
          cell.border = thinBorder;
          if (colNumber === 1) {
            updateWidth(colNumber, String(row.groupLabel ?? ''));
          }
        });
        continue;
      }
      if (row.rowType === 'direction') {
        const excelRow = sheet.addRow(['', row.directionLabel ?? '', ...Array(13).fill('')]);
        excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.fill = directionFill;
          cell.font = { bold: true };
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber <= 2 ? 'left' : 'right',
            wrapText: colNumber <= 2,
          };
          cell.border = thinBorder;
          if (colNumber === 2) {
            updateWidth(colNumber, String(row.directionLabel ?? ''));
          }
        });
        continue;
      }
      if (row.rowType === 'metric') {
        const format = row.metricCode ? metricFormats[row.metricCode] : undefined;
        const scale = format?.scale ?? 1;
        const values = (row.months ?? []).map((item) => {
          if (item.value === null || item.value === undefined) return null;
          return item.value * scale;
        });
        const total = row.yearTotal === null || row.yearTotal === undefined ? null : row.yearTotal * scale;
        const excelRow = sheet.addRow(['', row.metricLabel ?? '', ...values, total]);
        const shouldHighlight = row.metricCode === 'SALES_WITH_VAT' || row.metricCode === 'FIN_RESULT';
        const isFinResult = row.metricCode === 'FIN_RESULT';

        if (format) {
          for (let idx = 0; idx < 12; idx += 1) {
            const cell = excelRow.getCell(monthStartCol + idx);
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
              cell.numFmt = format.numFmt;
            }
          }
          const totalCell = excelRow.getCell(totalCol);
          if (totalCell.value !== null && totalCell.value !== undefined && totalCell.value !== '') {
            totalCell.numFmt = format.numFmt;
          }
        }

        excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (shouldHighlight) {
            cell.fill = highlightFill;
          }
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber <= 2 ? 'left' : 'right',
            wrapText: colNumber <= 2,
          };
          cell.border = thinBorder;
        });

        if (isFinResult) {
          for (let idx = 0; idx < 12; idx += 1) {
            const rawValue = row.months?.[idx]?.value;
            if (rawValue === null || rawValue === undefined) continue;
            const cell = excelRow.getCell(monthStartCol + idx);
            cell.font = {
              ...(cell.font || {}),
              bold: true,
              color: {
                argb: rawValue < 0 ? 'FFD32F2F' : rawValue > 0 ? 'FF1B5E20' : 'FF000000',
              },
            };
          }
          if (row.yearTotal !== null && row.yearTotal !== undefined) {
            const totalCell = excelRow.getCell(totalCol);
            totalCell.font = {
              ...(totalCell.font || {}),
              bold: true,
              color: {
                argb: row.yearTotal < 0 ? 'FFD32F2F' : row.yearTotal > 0 ? 'FF1B5E20' : 'FF000000',
              },
            };
          }
        }

        updateWidth(2, String(row.metricLabel ?? ''));
        (row.months ?? []).forEach((item, idx) => {
          if (item.value === null || item.value === undefined) return;
          updateWidth(monthStartCol + idx, formatDisplay(item.value, format));
        });
        if (row.yearTotal !== null && row.yearTotal !== undefined) {
          updateWidth(totalCol, formatDisplay(row.yearTotal, format));
        }
      }
    }

    const minWidths = [
      16, // Вид
      30, // Показатель
      ...Array(12).fill(12),
      16, // Итог
    ];
    const maxWidths = [
      32, // Вид
      55, // Показатель
      ...Array(12).fill(20),
      22, // Итог
    ];

    colMaxLens.forEach((len, idx) => {
      const min = minWidths[idx] ?? 12;
      const max = maxWidths[idx] ?? 20;
      const width = Math.min(Math.max(len + 2, min), max);
      sheet.getColumn(idx + 1).width = width;
    });

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
  }
}

export const financialPlanService = new FinancialPlanService();
