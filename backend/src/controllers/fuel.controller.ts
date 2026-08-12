import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { AppSetting } from '../models/app-setting.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { FuelEntry } from '../models/fuel-entry.model';
import { VehicleModel } from '../models/vehicle-model.model';
import { recordAuditLog } from '../services/audit-log.service';
import { syncVehiclesFromSchedule } from '../services/fleet-sync.service';
import {
  DEFAULT_FUEL_SEASONS,
  FUEL_SEASONS_SETTING_KEY,
  FuelSeasons,
  canManageFuelNorms,
  fuelLocationsForRole,
  isValidLocation,
  isWinterMonth,
} from '../constants/directories';

const vehicleRepo = AppDataSource.getRepository(FleetVehicle);
const entryRepo = AppDataSource.getRepository(FuelEntry);
const settingsRepo = AppDataSource.getRepository(AppSetting);

const httpError = (statusCode: number, message: string): never => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const requireFuelLocation = (req: Request, raw: unknown): FleetLocation => {
  if (!isValidLocation(raw)) return httpError(400, 'Unknown location') as never;
  if (!fuelLocationsForRole(req.user?.role).includes(raw)) {
    httpError(403, 'Access denied for this location');
  }
  return raw;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const parseMonthValue = (raw: unknown): string => {
  if (typeof raw !== 'string' || !MONTH_RE.test(raw)) return httpError(400, 'month must be YYYY-MM') as never;
  return raw;
};

const prevMonthValue = (monthValue: string): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const optionalNonNegative = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return httpError(400, `Invalid value for ${field}`) as never;
  return String(parsed);
};

async function loadSeasons(): Promise<FuelSeasons> {
  const row = await settingsRepo.findOne({ where: { key: FUEL_SEASONS_SETTING_KEY } });
  if (!row) return DEFAULT_FUEL_SEASONS;
  try {
    const parsed = JSON.parse(row.value);
    const winterStartMonth = Number(parsed?.winterStartMonth);
    const winterEndMonth = Number(parsed?.winterEndMonth);
    if (winterStartMonth >= 1 && winterStartMonth <= 12 && winterEndMonth >= 1 && winterEndMonth <= 12) {
      return { winterStartMonth, winterEndMonth };
    }
  } catch {
    // повреждённая настройка — откатываемся к значениям по умолчанию
  }
  return DEFAULT_FUEL_SEASONS;
}

type FuelRow = {
  vehicleId: string;
  plate: string;
  vehicleKind: string;
  modelLabel: string;
  status: string;
  // ввод
  odometer: number | null;
  fuelEnd: number | null;
  fuelFilled: number | null;
  mileageManual: number | null;
  fuelStartManual: number | null;
  // прошлый месяц / расчёт
  prevOdometer: number | null;
  prevFuelEnd: number | null;
  mileage: number | null;
  fuelStart: number | null;
  consumption: number | null;
  per100: number | null;
  norm: number | null;
  deviationPct: number | null;
  hasBaseline: boolean;
};

async function buildFuelRows(location: FleetLocation, monthValue: string): Promise<{ rows: FuelRow[]; isWinter: boolean }> {
  await syncVehiclesFromSchedule(location, monthValue);
  const seasons = await loadSeasons();
  const month = Number(monthValue.split('-')[1]);
  const isWinter = isWinterMonth(month, seasons);

  const vehicles = await vehicleRepo.find({
    where: { location },
    relations: { model: true },
    order: { plate: 'ASC' },
  });
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status !== 'archived');
  const vehicleIds = activeVehicles.map((vehicle) => vehicle.id);
  if (vehicleIds.length === 0) return { rows: [], isWinter };

  const prevMonth = prevMonthValue(monthValue);
  const entries = await entryRepo
    .createQueryBuilder('entry')
    .where('entry.vehicle_id IN (:...vehicleIds)', { vehicleIds })
    .andWhere('entry.month_value IN (:...months)', { months: [monthValue, prevMonth] })
    .getMany();
  const currentByVehicle = new Map(entries.filter((e) => e.monthValue === monthValue).map((e) => [e.vehicleId, e]));
  const prevByVehicle = new Map(entries.filter((e) => e.monthValue === prevMonth).map((e) => [e.vehicleId, e]));

  const rows = activeVehicles.map((vehicle): FuelRow => {
    const entry = currentByVehicle.get(vehicle.id) ?? null;
    const prev = prevByVehicle.get(vehicle.id) ?? null;

    const odometer = toNumber(entry?.odometer);
    const fuelEnd = toNumber(entry?.fuelEnd);
    const fuelFilled = toNumber(entry?.fuelFilled);
    const mileageManual = toNumber(entry?.mileageManual);
    const fuelStartManual = toNumber(entry?.fuelStartManual);
    const prevOdometer = toNumber(prev?.odometer);
    const prevFuelEnd = toNumber(prev?.fuelEnd);

    const mileage = mileageManual ?? (odometer !== null && prevOdometer !== null ? odometer - prevOdometer : null);
    const fuelStart = fuelStartManual ?? prevFuelEnd;
    const consumption =
      fuelStart !== null && fuelFilled !== null && fuelEnd !== null ? fuelStart + fuelFilled - fuelEnd : null;
    const per100 = consumption !== null && mileage !== null && mileage > 0 ? (consumption / mileage) * 100 : null;
    const norm = toNumber(isWinter ? vehicle.model?.fuelNormWinter : vehicle.model?.fuelNormSummer);
    const deviationPct = per100 !== null && norm !== null && norm > 0 ? ((per100 - norm) / norm) * 100 : null;

    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      vehicleKind: vehicle.vehicleKind,
      modelLabel: vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '',
      status: vehicle.status,
      odometer,
      fuelEnd,
      fuelFilled,
      mileageManual,
      fuelStartManual,
      prevOdometer,
      prevFuelEnd,
      mileage,
      fuelStart,
      consumption,
      per100,
      norm,
      deviationPct,
      hasBaseline: prev !== null,
    };
  });

  return { rows, isWinter };
}

export const getFuelState = async (req: Request, res: Response) => {
  const location = requireFuelLocation(req, req.query.location);
  const monthValue = parseMonthValue(req.query.month);
  const { rows, isWinter } = await buildFuelRows(location, monthValue);
  const filledCount = rows.filter((row) => row.odometer !== null && row.fuelEnd !== null && row.fuelFilled !== null).length;
  res.json({ location, monthValue, isWinter, filledCount, totalCount: rows.length, rows });
};

export const saveFuelState = async (req: Request, res: Response) => {
  const location = requireFuelLocation(req, req.body?.location);
  const monthValue = parseMonthValue(req.body?.monthValue);
  const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : httpError(400, 'rows must be an array');

  const vehicles = await vehicleRepo.find({ where: { location } });
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  for (const raw of rawRows as Array<Record<string, unknown>>) {
    const vehicleId = typeof raw.vehicleId === 'string' ? raw.vehicleId : httpError(400, 'vehicleId is required');
    if (!vehicleById.has(vehicleId as string)) httpError(400, `Vehicle ${vehicleId} is not in ${location}`);

    const entry =
      (await entryRepo.findOne({ where: { vehicleId: vehicleId as string, monthValue } })) ??
      entryRepo.create({ vehicleId: vehicleId as string, monthValue, location });
    entry.location = location;
    entry.odometer = optionalNonNegative(raw.odometer, 'odometer');
    entry.fuelEnd = optionalNonNegative(raw.fuelEnd, 'fuelEnd');
    entry.fuelFilled = optionalNonNegative(raw.fuelFilled, 'fuelFilled');
    entry.mileageManual = optionalNonNegative(raw.mileageManual, 'mileageManual');
    entry.fuelStartManual = optionalNonNegative(raw.fuelStartManual, 'fuelStartManual');
    entry.updatedByUserId = req.user?.id ?? null;
    await entryRepo.save(entry);
  }

  await recordAuditLog({
    action: 'FUEL_MONTH_SAVED',
    userId: req.user?.id ?? null,
    entityType: 'fuel_entry',
    entityId: `${location}:${monthValue}`,
    details: { location, monthValue, rowCount: rawRows.length },
    req,
  });

  const { rows, isWinter } = await buildFuelRows(location, monthValue);
  const filledCount = rows.filter((row) => row.odometer !== null && row.fuelEnd !== null && row.fuelFilled !== null).length;
  res.json({ location, monthValue, isWinter, filledCount, totalCount: rows.length, rows });
};

/**
 * Стартовые данные машины: показание одометра и остаток топлива на начало учёта.
 * Технически создаётся запись за месяц, предшествующий стартовому, — дальше вся
 * логика «из месяца в месяц» работает единообразно.
 */
export const setVehicleBaseline = async (req: Request, res: Response) => {
  const location = requireFuelLocation(req, req.body?.location);
  const monthValue = parseMonthValue(req.body?.monthValue);
  const vehicleId = typeof req.body?.vehicleId === 'string' ? req.body.vehicleId : httpError(400, 'vehicleId is required');

  const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId as string, location } });
  if (!vehicle) return httpError(404, 'Vehicle not found in this location') as never;

  const baselineMonth = prevMonthValue(monthValue);
  const entry =
    (await entryRepo.findOne({ where: { vehicleId: vehicleId as string, monthValue: baselineMonth } })) ??
    entryRepo.create({ vehicleId: vehicleId as string, monthValue: baselineMonth, location });
  entry.location = location;
  entry.odometer = optionalNonNegative(req.body?.startOdometer, 'startOdometer');
  entry.fuelEnd = optionalNonNegative(req.body?.startFuelLevel, 'startFuelLevel');
  entry.updatedByUserId = req.user?.id ?? null;
  await entryRepo.save(entry);

  await recordAuditLog({
    action: 'FUEL_BASELINE_SET',
    userId: req.user?.id ?? null,
    entityType: 'fuel_entry',
    entityId: `${vehicle.plate}:${baselineMonth}`,
    details: { location, vehicleId, baselineMonth },
    req,
  });
  res.json({ ok: true, baselineMonth });
};

export const getFuelSeasons = async (_req: Request, res: Response) => {
  res.json(await loadSeasons());
};

export const saveFuelSeasons = async (req: Request, res: Response) => {
  if (!canManageFuelNorms(req.user?.role)) httpError(403, 'Access denied');
  const winterStartMonth = Number(req.body?.winterStartMonth);
  const winterEndMonth = Number(req.body?.winterEndMonth);
  if (
    !Number.isInteger(winterStartMonth) || winterStartMonth < 1 || winterStartMonth > 12 ||
    !Number.isInteger(winterEndMonth) || winterEndMonth < 1 || winterEndMonth > 12
  ) {
    httpError(400, 'Months must be integers in 1..12');
  }
  const value = JSON.stringify({ winterStartMonth, winterEndMonth });
  const existing = await settingsRepo.findOne({ where: { key: FUEL_SEASONS_SETTING_KEY } });
  if (existing) {
    existing.value = value;
    await settingsRepo.save(existing);
  } else {
    await settingsRepo.save(settingsRepo.create({ key: FUEL_SEASONS_SETTING_KEY, value }));
  }
  res.json({ winterStartMonth, winterEndMonth });
};

const MONTH_NAMES = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTH_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };

export const exportFuelExcel = async (req: Request, res: Response) => {
  const location = requireFuelLocation(req, req.query.location);
  const monthValue = parseMonthValue(req.query.month);
  const { rows, isWinter } = await buildFuelRows(location, monthValue);
  const [year, month] = monthValue.split('-').map(Number);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Logistics Reporting';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Топливо ${LOCATION_LABELS[location]}`.slice(0, 31));

  const title = `Учёт топлива · ${LOCATION_LABELS[location]} · ${MONTH_NAMES[month]} ${year} (${isWinter ? 'зимние' : 'летние'} нормы)`;
  sheet.mergeCells(1, 1, 1, 11);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2937' } };

  const headers = [
    'Г/Н ТС', 'Модель', 'Тип',
    'Показания одометра, км', 'Пробег по Одометру, км',
    'Начальный уровень Топлива', 'Конечный уровень Топлива', 'Заправлено по ППР',
    'Расход топлива, л', 'Расход л/100км по одометру', 'Норма, л/100км',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD6DCE8' } },
      left: { style: 'thin', color: { argb: 'FFD6DCE8' } },
      bottom: { style: 'thin', color: { argb: 'FFD6DCE8' } },
      right: { style: 'thin', color: { argb: 'FFD6DCE8' } },
    };
  });

  rows.forEach((row) => {
    const dataRow = sheet.addRow([
      row.plate,
      row.modelLabel,
      row.vehicleKind,
      row.odometer,
      row.mileage,
      row.fuelStart,
      row.fuelEnd,
      row.fuelFilled,
      row.consumption,
      row.per100 !== null ? Number(row.per100.toFixed(2)) : null,
      row.norm,
    ]);
    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF1F2937' } };
      cell.alignment = { horizontal: colNumber <= 3 ? 'left' : 'right', vertical: 'middle' };
      if (colNumber > 3) cell.numFmt = '#,##0.0';
    });
    if (row.deviationPct !== null && row.deviationPct > 10) {
      dataRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9E7' } };
    }
  });

  const totals = rows.reduce(
    (acc, row) => ({
      mileage: acc.mileage + (row.mileage ?? 0),
      filled: acc.filled + (row.fuelFilled ?? 0),
      consumption: acc.consumption + (row.consumption ?? 0),
    }),
    { mileage: 0, filled: 0, consumption: 0 }
  );
  const totalRow = sheet.addRow(['Итого', '', '', null, totals.mileage, null, null, totals.filled, totals.consumption, null, null]);
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F9' } };
  });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 14;
  for (let col = 4; col <= 11; col += 1) sheet.getColumn(col).width = 16;
  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  const filename = `Топливо_${LOCATION_LABELS[location]}_${String(month).padStart(2, '0')}_${year}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="fuel_${location}_${monthValue}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(Buffer.from(buffer));
};

const YEAR_INDICATORS = [
  'Показания одометра, км',
  'Пробег по Одометру, км',
  'Начальный уровень Топлива',
  'Конечный уровень Топлива',
  'Заправлено по ППР',
  'Расход топлива, л',
  'Расход л/100км по одометру',
] as const;

/**
 * Годовая выгрузка в формате исходной таблицы «Топливо Владивосток»:
 * блок из 7 показателей на машину, колонки — месяцы года, итог за год,
 * справа — справочные нормы зима/лето по моделям.
 */
export const exportFuelYearExcel = async (req: Request, res: Response) => {
  const location = requireFuelLocation(req, req.query.location);
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) httpError(400, 'year must be 2020..2100');

  const seasons = await loadSeasons();
  const vehicles = (await vehicleRepo.find({ where: { location }, relations: { model: true }, order: { plate: 'ASC' } }))
    .filter((vehicle) => vehicle.status !== 'archived');
  const vehicleIds = vehicles.map((vehicle) => vehicle.id);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const monthsWithPrev = [`${year - 1}-12`, ...months];
  const entries = vehicleIds.length
    ? await entryRepo
        .createQueryBuilder('entry')
        .where('entry.vehicle_id IN (:...vehicleIds)', { vehicleIds })
        .andWhere('entry.month_value IN (:...months)', { months: monthsWithPrev })
        .getMany()
    : [];
  const entryByVehicleMonth = new Map<string, FuelEntry>();
  entries.forEach((entry) => entryByVehicleMonth.set(`${entry.vehicleId}|${entry.monthValue}`, entry));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Logistics Reporting';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Топливо ${LOCATION_LABELS[location]} ${year}`.slice(0, 31));

  const indicatorCol = 1;
  const plateCol = 2;
  const modelCol = 3;
  const monthStartCol = 4;
  const totalCol = monthStartCol + 12;
  const normStartCol = totalCol + 2;

  sheet.mergeCells(1, 1, 1, totalCol);
  const title = sheet.getCell(1, 1);
  title.value = `Учёт топлива · ${LOCATION_LABELS[location]} · ${year}`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2937' } };

  const headerRow = sheet.getRow(2);
  headerRow.getCell(indicatorCol).value = 'Показатель';
  headerRow.getCell(plateCol).value = 'Г/Н ТС';
  headerRow.getCell(modelCol).value = 'Модель';
  months.forEach((_, index) => {
    headerRow.getCell(monthStartCol + index).value = MONTH_NAMES[index + 1];
  });
  headerRow.getCell(totalCol).value = 'Итого за год';
  for (let col = 1; col <= totalCol; col += 1) {
    const cell = headerRow.getCell(col);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  let cursor = 3;
  vehicles.forEach((vehicle) => {
    const monthly = months.map((monthValue, index) => {
      const entry = entryByVehicleMonth.get(`${vehicle.id}|${monthValue}`) ?? null;
      const prev = entryByVehicleMonth.get(`${vehicle.id}|${monthsWithPrev[index]}`) ?? null;
      const odometer = toNumber(entry?.odometer);
      const fuelEnd = toNumber(entry?.fuelEnd);
      const fuelFilled = toNumber(entry?.fuelFilled);
      const prevOdometer = toNumber(prev?.odometer);
      const mileage = toNumber(entry?.mileageManual) ?? (odometer !== null && prevOdometer !== null ? odometer - prevOdometer : null);
      const fuelStart = toNumber(entry?.fuelStartManual) ?? toNumber(prev?.fuelEnd);
      const consumption = fuelStart !== null && fuelFilled !== null && fuelEnd !== null ? fuelStart + fuelFilled - fuelEnd : null;
      const per100 = consumption !== null && mileage !== null && mileage > 0 ? (consumption / mileage) * 100 : null;
      return { odometer, mileage, fuelStart, fuelEnd, fuelFilled, consumption, per100 };
    });

    const totalMileage = monthly.reduce((acc, m) => acc + (m.mileage ?? 0), 0);
    const totalFilled = monthly.reduce((acc, m) => acc + (m.fuelFilled ?? 0), 0);
    const totalConsumption = monthly.reduce((acc, m) => acc + (m.consumption ?? 0), 0);
    const lastOdometer = [...monthly].reverse().find((m) => m.odometer !== null)?.odometer ?? null;
    const totals: Array<number | null> = [
      lastOdometer,
      totalMileage || null,
      null,
      null,
      totalFilled || null,
      totalConsumption || null,
      totalConsumption && totalMileage ? (totalConsumption / totalMileage) * 100 : null,
    ];
    const valueOf = (m: (typeof monthly)[number], indicatorIndex: number): number | null =>
      [m.odometer, m.mileage, m.fuelStart, m.fuelEnd, m.fuelFilled, m.consumption, m.per100][indicatorIndex];

    YEAR_INDICATORS.forEach((indicator, indicatorIndex) => {
      const row = sheet.getRow(cursor + indicatorIndex);
      row.getCell(indicatorCol).value = indicator;
      monthly.forEach((m, monthIndex) => {
        const value = valueOf(m, indicatorIndex);
        row.getCell(monthStartCol + monthIndex).value = value !== null ? Number(value.toFixed(2)) : null;
      });
      const total = totals[indicatorIndex];
      row.getCell(totalCol).value = total !== null ? Number(total.toFixed(2)) : null;
      for (let col = 1; col <= totalCol; col += 1) {
        const cell = row.getCell(col);
        cell.font = { name: 'Arial', size: 10.5, color: { argb: 'FF1F2937' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (col >= monthStartCol) cell.alignment = { horizontal: 'right' };
        if (col === totalCol) cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF1F2937' } };
      }
    });

    sheet.mergeCells(cursor, plateCol, cursor + YEAR_INDICATORS.length - 1, plateCol);
    sheet.mergeCells(cursor, modelCol, cursor + YEAR_INDICATORS.length - 1, modelCol);
    const plateCell = sheet.getCell(cursor, plateCol);
    plateCell.value = vehicle.plate;
    plateCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    plateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    const modelCell = sheet.getCell(cursor, modelCol);
    modelCell.value = vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '';
    modelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const blockBottom = { style: 'medium' as const, color: { argb: 'FFB6C2D6' } };
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(cursor + YEAR_INDICATORS.length - 1, col).border = {
        ...sheet.getCell(cursor + YEAR_INDICATORS.length - 1, col).border,
        bottom: blockBottom,
      };
    }
    cursor += YEAR_INDICATORS.length;
  });

  // ── Справочный блок норм справа
  const models = await AppDataSource.getRepository(VehicleModel).find({ order: { brand: 'ASC', name: 'ASC' } });
  const winterLabel = `зима: с 1 ${MONTH_GENITIVE[seasons.winterStartMonth - 1]} по конец ${MONTH_GENITIVE[seasons.winterEndMonth - 1]}`;
  sheet.getCell(2, normStartCol).value = 'НОРМЫ, л/100км';
  sheet.getCell(2, normStartCol).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
  sheet.getCell(3, normStartCol).value = winterLabel;
  sheet.getCell(3, normStartCol).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF6B7280' } };
  const normHeader = sheet.getRow(4);
  normHeader.getCell(normStartCol).value = 'Модель';
  normHeader.getCell(normStartCol + 1).value = 'Зима';
  normHeader.getCell(normStartCol + 2).value = 'Лето';
  for (let i = 0; i < 3; i += 1) {
    const cell = normHeader.getCell(normStartCol + i);
    cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F9' } };
  }
  models.forEach((model, index) => {
    const row = sheet.getRow(5 + index);
    row.getCell(normStartCol).value = `${model.brand} ${model.name}`.trim();
    row.getCell(normStartCol + 1).value = toNumber(model.fuelNormWinter);
    row.getCell(normStartCol + 2).value = toNumber(model.fuelNormSummer);
  });

  sheet.getColumn(indicatorCol).width = 26;
  sheet.getColumn(plateCol).width = 13;
  sheet.getColumn(modelCol).width = 18;
  for (let col = monthStartCol; col <= totalCol; col += 1) sheet.getColumn(col).width = 11;
  sheet.getColumn(totalCol).width = 13;
  sheet.getColumn(normStartCol).width = 24;
  sheet.getColumn(normStartCol + 1).width = 8;
  sheet.getColumn(normStartCol + 2).width = 8;
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];

  const filename = `Топливо_${LOCATION_LABELS[location]}_${year}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="fuel_${location}_${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(Buffer.from(buffer));
};
