import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { Trailer } from '../models/trailer.model';
import { VehicleModel } from '../models/vehicle-model.model';
import { OperationsPreviewState } from '../models/operations-preview-state.model';
import { recordAuditLog } from '../services/audit-log.service';
import { buildEmployeeCardText } from '../services/employee-card.service';
import {
  DIRECTORY_ROLES,
  canDeleteDirectoryEntry,
  canManageFuelNorms,
  directoryLocationsForRole,
  fuelLocationsForRole,
  isValidLocation,
} from '../constants/directories';

const employeeRepo = AppDataSource.getRepository(Employee);
const vehicleRepo = AppDataSource.getRepository(FleetVehicle);
const trailerRepo = AppDataSource.getRepository(Trailer);
const modelRepo = AppDataSource.getRepository(VehicleModel);

const httpError = (statusCode: number, message: string): never => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const parseLocation = (value: unknown): FleetLocation => {
  if (!isValidLocation(value)) return httpError(400, 'Unknown location') as never;
  return value;
};

/** Локация из запроса + проверка, что роль имеет право работать со справочниками в ней. */
const requireDirectoryLocation = (req: Request, raw: unknown): FleetLocation => {
  const location = parseLocation(raw);
  const allowed = directoryLocationsForRole(req.user?.role);
  if (!allowed.includes(location)) {
    httpError(403, 'Access denied for this location');
  }
  return location;
};

/** Просмотр техники разрешён и ролям топлива (БДД), запись — только справочным ролям. */
const requireFleetViewLocation = (req: Request, raw: unknown): FleetLocation => {
  const location = parseLocation(raw);
  const role = req.user?.role;
  const allowed = new Set([...directoryLocationsForRole(role), ...fuelLocationsForRole(role)]);
  if (!allowed.has(location)) {
    httpError(403, 'Access denied for this location');
  }
  return location;
};

const trimmed = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const optionalDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value.slice(0, 10);
};

const optionalNumeric = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return httpError(400, 'Invalid numeric value') as never;
  return String(parsed);
};

// ─────────────────────────── Модели техники и нормы ───────────────────────────

export const listVehicleModels = async (_req: Request, res: Response) => {
  const models = await modelRepo.find({ order: { brand: 'ASC', name: 'ASC' } });
  const vehicleCounts = await vehicleRepo
    .createQueryBuilder('vehicle')
    .select('vehicle.model_id', 'modelId')
    .addSelect('COUNT(*)', 'count')
    .where('vehicle.model_id IS NOT NULL')
    .groupBy('vehicle.model_id')
    .getRawMany<{ modelId: string; count: string }>();
  const countByModel = new Map(vehicleCounts.map((row) => [row.modelId, Number(row.count)]));
  res.json(models.map((model) => ({ ...model, vehicleCount: countByModel.get(model.id) ?? 0 })));
};

export const saveVehicleModel = async (req: Request, res: Response) => {
  if (!canManageFuelNorms(req.user?.role)) httpError(403, 'Access denied');
  const id = typeof req.params.id === 'string' && req.params.id ? req.params.id : null;
  const brand = trimmed(req.body?.brand, 120);
  if (!brand) httpError(400, 'Brand is required');

  const model = id
    ? await modelRepo.findOne({ where: { id } })
    : modelRepo.create();
  if (!model) return httpError(404, 'Model not found') as never;

  model.brand = brand;
  model.name = trimmed(req.body?.name, 120);
  model.fuelNormWinter = optionalNumeric(req.body?.fuelNormWinter);
  model.fuelNormSummer = optionalNumeric(req.body?.fuelNormSummer);
  const saved = await modelRepo.save(model);
  res.json(saved);
};

export const deleteVehicleModel = async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'head_ktk_vvo' && role !== 'head_ktk_mow') {
    httpError(403, 'Access denied');
  }
  await modelRepo.delete({ id: req.params.id });
  res.json({ ok: true });
};


/**
 * Модель по текстовой подписи из карточки техники: ищем существующую без учёта
 * регистра (чтобы 11 одинаковых машин не породили 11 моделей), иначе создаём.
 * Нормы расхода к новой модели добавляют БДД/руководители КТК в «Модели и нормы».
 */
const resolveModelByLabel = async (label: string): Promise<VehicleModel> => {
  const existing = await modelRepo
    .createQueryBuilder('model')
    .where("LOWER(TRIM(model.brand || ' ' || model.name)) = LOWER(:label)", { label })
    .orWhere('LOWER(model.brand) = LOWER(:label)', { label })
    .getOne();
  if (existing) return existing;
  return modelRepo.save(modelRepo.create({ brand: label, name: '' }));
};

// ─────────────────────────── Техника ───────────────────────────

export const listVehicles = async (req: Request, res: Response) => {
  const location = requireFleetViewLocation(req, req.query.location);
  const vehicles = await vehicleRepo.find({
    where: { location },
    relations: { model: true },
    order: { plate: 'ASC' },
  });
  res.json(vehicles);
};

export const saveVehicle = async (req: Request, res: Response) => {
  const location = requireDirectoryLocation(req, req.body?.location ?? req.query.location);
  const id = typeof req.params.id === 'string' && req.params.id ? req.params.id : null;
  const plate = trimmed(req.body?.plate, 32);
  if (!plate) httpError(400, 'Plate is required');

  const vehicle = id ? await vehicleRepo.findOne({ where: { id } }) : vehicleRepo.create();
  if (!vehicle) return httpError(404, 'Vehicle not found') as never;
  if (id && vehicle.location !== location) {
    // перевод между городами делает роль, имеющая доступ к целевому городу
    requireDirectoryLocation(req, vehicle.location);
  }

  const existingPlate = await vehicleRepo.findOne({ where: { plate } });
  if (existingPlate && existingPlate.id !== vehicle.id) httpError(409, 'Vehicle with this plate already exists');

  vehicle.location = location;
  vehicle.plate = plate;
  vehicle.vehicleKind = trimmed(req.body?.vehicleKind, 120);
  const modelLabel = trimmed(req.body?.modelLabel, 240);
  if (modelLabel) {
    vehicle.modelId = (await resolveModelByLabel(modelLabel)).id;
  } else {
    vehicle.modelId = typeof req.body?.modelId === 'string' && req.body.modelId ? req.body.modelId : null;
  }
  vehicle.color = trimmed(req.body?.color, 60);
  vehicle.vin = trimmed(req.body?.vin, 40);
  vehicle.manufactureYear = trimmed(req.body?.manufactureYear, 10);
  vehicle.sor = trimmed(req.body?.sor, 40);
  vehicle.note = trimmed(req.body?.note, 500);
  const status = req.body?.status;
  vehicle.status = status === 'repair' || status === 'archived' ? status : 'active';
  const saved = await vehicleRepo.save(vehicle);
  const withModel = await vehicleRepo.findOne({ where: { id: saved.id }, relations: { model: true } });
  res.json(withModel);
};

export const deleteVehicle = async (req: Request, res: Response) => {
  const vehicle = await vehicleRepo.findOne({ where: { id: req.params.id } });
  if (!vehicle) return httpError(404, 'Vehicle not found') as never;
  if (!canDeleteDirectoryEntry(req.user?.role, vehicle.location)) httpError(403, 'Access denied');
  await vehicleRepo.remove(vehicle);
  res.json({ ok: true });
};

// ─────────────────────────── Прицепы ───────────────────────────

export const listTrailers = async (req: Request, res: Response) => {
  const location = requireFleetViewLocation(req, req.query.location);
  res.json(await trailerRepo.find({ where: { location }, order: { plate: 'ASC' } }));
};

export const saveTrailer = async (req: Request, res: Response) => {
  const location = requireDirectoryLocation(req, req.body?.location ?? req.query.location);
  const id = typeof req.params.id === 'string' && req.params.id ? req.params.id : null;
  const plate = trimmed(req.body?.plate, 32);
  if (!plate) httpError(400, 'Plate is required');

  const trailer = id ? await trailerRepo.findOne({ where: { id } }) : trailerRepo.create();
  if (!trailer) return httpError(404, 'Trailer not found') as never;

  const existingPlate = await trailerRepo.findOne({ where: { plate } });
  if (existingPlate && existingPlate.id !== trailer.id) httpError(409, 'Trailer with this plate already exists');

  trailer.location = location;
  trailer.plate = plate;
  const trailerKind = req.body?.kind;
  trailer.kind = trailerKind === 'auto' || trailerKind === 'container' ? trailerKind : '';
  trailer.brand = trimmed(req.body?.brand, 120);
  trailer.axles = trimmed(req.body?.axles, 40);
  trailer.footage = trimmed(req.body?.footage, 40);
  trailer.note = trimmed(req.body?.note, 500);
  const trailerStatus = req.body?.status;
  trailer.status = trailerStatus === 'repair' || trailerStatus === 'archived' ? trailerStatus : 'active';
  res.json(await trailerRepo.save(trailer));
};

export const deleteTrailer = async (req: Request, res: Response) => {
  const trailer = await trailerRepo.findOne({ where: { id: req.params.id } });
  if (!trailer) return httpError(404, 'Trailer not found') as never;
  if (!canDeleteDirectoryEntry(req.user?.role, trailer.location)) httpError(403, 'Access denied');
  await trailerRepo.remove(trailer);
  res.json({ ok: true });
};

// ─────────────────────────── Сотрудники (ПДн) ───────────────────────────

export const listEmployees = async (req: Request, res: Response) => {
  const location = requireDirectoryLocation(req, req.query.location);
  const employees = await employeeRepo.find({ where: { location }, order: { fullName: 'ASC' } });
  res.json(employees);
};

export const saveEmployee = async (req: Request, res: Response) => {
  const location = requireDirectoryLocation(req, req.body?.location ?? req.query.location);
  const id = typeof req.params.id === 'string' && req.params.id ? req.params.id : null;
  const fullName = trimmed(req.body?.fullName, 255);
  if (!fullName) httpError(400, 'Full name is required');

  const employee = id ? await employeeRepo.findOne({ where: { id } }) : employeeRepo.create();
  if (!employee) return httpError(404, 'Employee not found') as never;

  employee.location = location;
  employee.fullName = fullName;
  employee.position = trimmed(req.body?.position, 60) || 'водитель';
  employee.phone = trimmed(req.body?.phone, 32);
  employee.status = req.body?.status === 'fired' ? 'fired' : 'active';
  employee.birthDate = optionalDate(req.body?.birthDate);
  employee.birthPlace = trimmed(req.body?.birthPlace, 255);
  employee.passportNumber = trimmed(req.body?.passportNumber, 32);
  employee.passportIssueDate = optionalDate(req.body?.passportIssueDate);
  employee.passportIssuedBy = trimmed(req.body?.passportIssuedBy, 255);
  employee.registrationAddress = trimmed(req.body?.registrationAddress, 500);
  employee.licenseNumber = trimmed(req.body?.licenseNumber, 32);
  employee.licenseIssueDate = optionalDate(req.body?.licenseIssueDate);
  employee.note = trimmed(req.body?.note, 500);

  const saved = await employeeRepo.save(employee);
  await recordAuditLog({
    action: id ? 'DIRECTORY_EMPLOYEE_UPDATED' : 'DIRECTORY_EMPLOYEE_CREATED',
    userId: req.user?.id ?? null,
    entityType: 'directory_employee',
    entityId: saved.id,
    details: { location, fullName: saved.fullName },
    req,
  });
  res.json(saved);
};

export const deleteEmployee = async (req: Request, res: Response) => {
  const employee = await employeeRepo.findOne({ where: { id: req.params.id } });
  if (!employee) return httpError(404, 'Employee not found') as never;
  if (!canDeleteDirectoryEntry(req.user?.role, employee.location)) httpError(403, 'Access denied');
  await employeeRepo.remove(employee);
  await recordAuditLog({
    action: 'DIRECTORY_EMPLOYEE_DELETED',
    userId: req.user?.id ?? null,
    entityType: 'directory_employee',
    entityId: employee.id,
    details: { location: employee.location, fullName: employee.fullName },
    req,
  });
  res.json({ ok: true });
};

/**
 * Текст карточки из справочника — только данные водителя, без машины и прицепа
 * (полная карточка со сцепкой копируется из графика). Пишется в аудит.
 */
export const getEmployeeCardText = async (req: Request, res: Response) => {
  const employee = await employeeRepo.findOne({ where: { id: req.params.id } });
  if (!employee) return httpError(404, 'Employee not found') as never;
  requireDirectoryLocation(req, employee.location);

  const text = buildEmployeeCardText(employee, null);
  await recordAuditLog({
    action: 'DIRECTORY_EMPLOYEE_CARD_COPIED',
    userId: req.user?.id ?? null,
    entityType: 'directory_employee',
    entityId: employee.id,
    details: { location: employee.location, fullName: employee.fullName },
    req,
  });
  res.json({ text });
};

/** Поиск карточки по ФИО — для пункта «Скопировать данные водителя» в графиках. */
export const findEmployeeCardByName = async (req: Request, res: Response) => {
  const location = requireDirectoryLocation(req, req.query.location);
  const fullName = trimmed(req.query.fullName, 255);
  if (!fullName) httpError(400, 'fullName is required');

  const employee = await employeeRepo
    .createQueryBuilder('employee')
    .where('employee.location = :location', { location })
    .andWhere('LOWER(employee.full_name) = LOWER(:fullName)', { fullName })
    .getOne();
  if (!employee) return httpError(404, 'Employee not found in directory') as never;

  const rig = await resolveRigFromSchedule(location, employee.fullName);
  const text = buildEmployeeCardText(employee, rig);
  await recordAuditLog({
    action: 'DIRECTORY_EMPLOYEE_CARD_COPIED',
    userId: req.user?.id ?? null,
    entityType: 'directory_employee',
    entityId: employee.id,
    details: { location, fullName: employee.fullName, source: 'operations_preview' },
    req,
  });
  res.json({ employeeId: employee.id, text });
};

// ─────────────────────────── Сцепка из графика ───────────────────────────

const SCHEDULE_SCOPE_BY_DIRECTORY_LOCATION: Record<FleetLocation, string> = {
  vvo: 'ktk_vvo_preview_v1',
  mow: 'ktk_mow_preview_v1',
};

type ScheduleRigRow = {
  name?: string;
  secondName?: string;
  plate?: string;
  trailer?: string;
};

const prevMonth = (monthValue: string): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Сцепка «машина + прицеп» для карточки водителя берётся из строки графика
 * (текущий месяц, при пустом — предыдущий): справочники персонала, техники и
 * прицепов независимы, связывает их только график.
 */
export const resolveRigFromSchedule = async (
  location: FleetLocation,
  fullName: string
): Promise<{ vehicle: FleetVehicle | null; trailerPlate: string }> => {
  const empty = { vehicle: null, trailerPlate: '' };
  const row = await previewRepo.findOne({ where: { scopeKey: SCHEDULE_SCOPE_BY_DIRECTORY_LOCATION[location] } });
  if (!row) return empty;
  const payload = (row.payload ?? {}) as { peopleByMonth?: Record<string, ScheduleRigRow[]> };
  const byMonth = payload.peopleByMonth ?? {};
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const people =
    (byMonth[currentMonth]?.length ? byMonth[currentMonth] : byMonth[prevMonth(currentMonth)]) ?? [];
  const needle = fullName.trim().toLowerCase();
  const personRow = people.find(
    (person) =>
      (person.name ?? '').trim().toLowerCase() === needle ||
      (person.secondName ?? '').trim().toLowerCase() === needle
  );
  if (!personRow) return empty;

  const plate = (personRow.plate ?? '').trim();
  const vehicle = plate
    ? await vehicleRepo
        .createQueryBuilder('vehicle')
        .leftJoinAndSelect('vehicle.model', 'model')
        .where('LOWER(vehicle.plate) = LOWER(:plate)', { plate })
        .getOne()
    : null;
  return { vehicle, trailerPlate: (personRow.trailer ?? '').trim() };
};

// ─────────────────────────── Подсказки для графиков (без ПДн) ───────────────────────────

/**
 * Автокомплит в диалогах графиков: только ФИО+роль и госномера, без ПДн —
 * поэтому доступно всем ролям, редактирующим графики (см. роут).
 */
export const getDirectoryOptions = async (req: Request, res: Response) => {
  const location = parseLocation(req.query.location);
  const [employees, vehicles, trailers] = await Promise.all([
    employeeRepo.find({ where: { location, status: 'active' }, order: { fullName: 'ASC' } }),
    vehicleRepo.find({ where: { location }, order: { plate: 'ASC' } }),
    trailerRepo.find({ where: { location, status: 'active' }, order: { plate: 'ASC' } }),
  ]);
  res.json({
    employees: employees.map((employee) => ({ fullName: employee.fullName, position: employee.position })),
    vehicles: vehicles.filter((vehicle) => vehicle.status !== 'archived').map((vehicle) => vehicle.plate),
    trailers: trailers.map((trailer) => trailer.plate),
    // тип прицепа для фильтрации подсказок по разделам графика
    trailerOptions: trailers.map((trailer) => ({ plate: trailer.plate, kind: trailer.kind })),
  });
};

// ─────────────────────────── Экспорт справочников в Excel ───────────────────────────

const TRAILER_KIND_LABELS: Record<string, string> = { auto: 'Автовозный', container: 'Контейнерный' };
const trailerKindLabel = (kind: string): string => TRAILER_KIND_LABELS[kind] ?? '';

const formatDateRu = (value: string | null): string => {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}.${month}.${year}` : value;
};

/**
 * Выгрузка активной вкладки справочника: все поля, состав строк — выбранные
 * id или все. Водители содержат ПДн: доступ только справочным ролям
 * (проверка на роуте) + запись в аудит.
 */
export const exportDirectory = async (req: Request, res: Response) => {
  const tab = req.body?.tab;
  if (tab !== 'drivers' && tab !== 'vehicles' && tab !== 'trailers' && tab !== 'models') {
    httpError(400, 'Unknown export tab');
  }
  const ids: string[] = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  const pick = <T extends { id: string }>(rows: T[]): T[] =>
    ids.length ? rows.filter((row) => ids.includes(row.id)) : rows;

  const workbook = new ExcelJS.Workbook();
  const statusLabel = (status: string): string =>
    status === 'active' ? 'в работе' : status === 'repair' ? 'ремонт' : status === 'fired' ? 'уволен' : 'архив';

  let sheetName = '';
  let filename = '';
  let locationLabel = '';

  if (tab === 'drivers') {
    if (!DIRECTORY_ROLES.includes(req.user?.role as (typeof DIRECTORY_ROLES)[number])) {
      httpError(403, 'Экспорт водителей доступен только справочным ролям');
    }
    const location = requireDirectoryLocation(req, req.body?.location);
    locationLabel = location === 'vvo' ? 'Владивосток' : 'Москва';
    const rows = pick(
      await employeeRepo.find({ where: { location, position: 'водитель' }, order: { fullName: 'ASC' } })
    );
    sheetName = 'Водители';
    filename = `Справочник_водители_${locationLabel}.xlsx`;
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'ФИО', key: 'fullName', width: 34 },
      { header: 'Телефон', key: 'phone', width: 16 },
      { header: 'Статус', key: 'status', width: 12 },
      { header: 'Дата рождения', key: 'birthDate', width: 14 },
      { header: 'Место рождения', key: 'birthPlace', width: 28 },
      { header: 'Паспорт', key: 'passportNumber', width: 14 },
      { header: 'Дата выдачи паспорта', key: 'passportIssueDate', width: 16 },
      { header: 'Кем выдан', key: 'passportIssuedBy', width: 36 },
      { header: 'Адрес регистрации', key: 'registrationAddress', width: 42 },
      { header: 'ВУ (номер)', key: 'licenseNumber', width: 14 },
      { header: 'Дата выдачи ВУ', key: 'licenseIssueDate', width: 14 },
      { header: 'Примечание', key: 'note', width: 30 },
    ];
    rows.forEach((employee) =>
      sheet.addRow({
        fullName: employee.fullName,
        phone: employee.phone,
        status: statusLabel(employee.status),
        birthDate: formatDateRu(employee.birthDate),
        birthPlace: employee.birthPlace,
        passportNumber: employee.passportNumber,
        passportIssueDate: formatDateRu(employee.passportIssueDate),
        passportIssuedBy: employee.passportIssuedBy,
        registrationAddress: employee.registrationAddress,
        licenseNumber: employee.licenseNumber,
        licenseIssueDate: formatDateRu(employee.licenseIssueDate),
        note: employee.note,
      })
    );
    await recordAuditLog({
      action: 'DIRECTORY_EMPLOYEES_EXPORTED',
      userId: req.user?.id ?? null,
      entityType: 'directory_employee',
      entityId: null,
      details: { location, count: rows.length, selected: ids.length > 0 },
      req,
    });
  } else if (tab === 'vehicles') {
    const location = requireFleetViewLocation(req, req.body?.location);
    locationLabel = location === 'vvo' ? 'Владивосток' : 'Москва';
    const rows = pick(await vehicleRepo.find({ where: { location }, relations: { model: true }, order: { plate: 'ASC' } }));
    sheetName = 'Техника';
    filename = `Справочник_техника_${locationLabel}.xlsx`;
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'Г/Н ТС', key: 'plate', width: 14 },
      { header: 'Тип ТС', key: 'vehicleKind', width: 26 },
      { header: 'Модель', key: 'model', width: 22 },
      { header: 'Цвет', key: 'color', width: 12 },
      { header: 'VIN', key: 'vin', width: 22 },
      { header: 'СОР', key: 'sor', width: 16 },
      { header: 'Год выпуска', key: 'manufactureYear', width: 12 },
      { header: 'Статус', key: 'status', width: 12 },
      { header: 'Примечание', key: 'note', width: 30 },
    ];
    rows.forEach((vehicle) =>
      sheet.addRow({
        plate: vehicle.plate,
        vehicleKind: vehicle.vehicleKind,
        model: vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '',
        color: vehicle.color,
        vin: vehicle.vin,
        sor: vehicle.sor,
        manufactureYear: vehicle.manufactureYear,
        status: statusLabel(vehicle.status),
        note: vehicle.note,
      })
    );
  } else if (tab === 'trailers') {
    const location = requireFleetViewLocation(req, req.body?.location);
    locationLabel = location === 'vvo' ? 'Владивосток' : 'Москва';
    const rows = pick(await trailerRepo.find({ where: { location }, order: { plate: 'ASC' } }));
    sheetName = 'Прицепы';
    filename = `Справочник_прицепы_${locationLabel}.xlsx`;
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'Номер', key: 'plate', width: 14 },
      { header: 'Тип прицепа', key: 'kind', width: 16 },
      { header: 'Марка', key: 'brand', width: 16 },
      { header: 'Оси', key: 'axles', width: 8 },
      { header: 'Футовость', key: 'footage', width: 12 },
      { header: 'Статус', key: 'status', width: 12 },
      { header: 'Примечание', key: 'note', width: 30 },
    ];
    rows.forEach((trailer) =>
      sheet.addRow({
        plate: trailer.plate,
        kind: trailerKindLabel(trailer.kind),
        brand: trailer.brand,
        axles: trailer.axles,
        footage: trailer.footage,
        status: statusLabel(trailer.status),
        note: trailer.note,
      })
    );
  } else {
    const rows = pick(await modelRepo.find({ order: { brand: 'ASC', name: 'ASC' } }));
    sheetName = 'Модели и нормы';
    filename = 'Справочник_модели_и_нормы.xlsx';
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'Марка', key: 'brand', width: 18 },
      { header: 'Модель', key: 'name', width: 18 },
      { header: 'Норма зима, л/100км', key: 'fuelNormWinter', width: 18 },
      { header: 'Норма лето, л/100км', key: 'fuelNormSummer', width: 18 },
    ];
    rows.forEach((model) =>
      sheet.addRow({
        brand: model.brand,
        name: model.name,
        fuelNormWinter: model.fuelNormWinter !== null ? Number(model.fuelNormWinter) : '',
        fuelNormSummer: model.fuelNormSummer !== null ? Number(model.fuelNormSummer) : '',
      })
    );
  }

  // единый стиль шапки — как таблицы «Планов»
  const sheet = workbook.getWorksheet(sheetName)!;
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, name: 'Arial' };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB6C0D2' } } };
    cell.alignment = { vertical: 'middle' };
  });
  headerRow.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="directory_${tab}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(Buffer.from(buffer));
};

// ─────────────────────────── Первичное наполнение из графиков ───────────────────────────

const previewRepo = AppDataSource.getRepository(OperationsPreviewState);

type PreviewPersonRow = {
  id?: string;
  name?: string;
  secondName?: string;
  plate?: string;
  department?: string;
};

const POSITION_BY_DEPARTMENT: Record<string, string> = {
  'Контейнеры': 'водитель',
  'Авто': 'водитель',
};

const KIND_BY_DEPARTMENT: Record<string, string> = {
  'Контейнеры': 'контейнеровоз',
  'Авто': 'автовоз',
};

const BOOTSTRAP_SOURCES: Array<{ scopeKey: string; location: FleetLocation }> = [
  { scopeKey: 'ktk_vvo_preview_v1', location: 'vvo' },
  { scopeKey: 'ktk_mow_preview_v1', location: 'mow' },
];

/**
 * Одноразовое наполнение справочников из уже накопленных строк графиков:
 * уникальные ФИО становятся сотрудниками, уникальные госномера — техникой.
 * Существующие записи не трогаются, операция идемпотентна. Только админ.
 */
export const bootstrapDirectoriesFromSchedules = async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') httpError(403, 'Admin only');

  const existingEmployees = await employeeRepo.find();
  const employeeKeys = new Set(existingEmployees.map((e) => `${e.location}|${e.fullName.toLowerCase()}`));
  const existingVehicles = await vehicleRepo.find();
  const vehicleKeys = new Set(existingVehicles.map((v) => v.plate.toLowerCase()));

  let createdEmployees = 0;
  let createdVehicles = 0;

  for (const source of BOOTSTRAP_SOURCES) {
    const row = await previewRepo.findOne({ where: { scopeKey: source.scopeKey } });
    if (!row) continue;
    const payload = (row.payload ?? {}) as { peopleByMonth?: Record<string, PreviewPersonRow[]> };
    const peopleByMonth = payload.peopleByMonth ?? {};
    const months = Object.keys(peopleByMonth).sort();
    if (months.length === 0) continue;
    const latestPeople = peopleByMonth[months[months.length - 1]] ?? [];

    for (const person of latestPeople) {
      const department = person.department ?? '';
      const position = POSITION_BY_DEPARTMENT[department];
      if (!position) continue;
      for (const rawName of [person.name, person.secondName]) {
        const fullName = (rawName ?? '').trim();
        if (!fullName) continue;
        const key = `${source.location}|${fullName.toLowerCase()}`;
        if (employeeKeys.has(key)) continue;
        employeeKeys.add(key);
        await employeeRepo.save(employeeRepo.create({ location: source.location, fullName, position }));
        createdEmployees += 1;
      }

      const plate = (person.plate ?? '').trim();
      if (plate && !vehicleKeys.has(plate.toLowerCase())) {
        vehicleKeys.add(plate.toLowerCase());
        await vehicleRepo.save(
          vehicleRepo.create({
            location: source.location,
            plate,
            vehicleKind: KIND_BY_DEPARTMENT[department] ?? '',
          })
        );
        createdVehicles += 1;
      }
    }
  }

  await recordAuditLog({
    action: 'DIRECTORY_BOOTSTRAPPED',
    userId: req.user?.id ?? null,
    entityType: 'directory_employee',
    entityId: 'bootstrap',
    details: { createdEmployees, createdVehicles },
    req,
  });
  res.json({ createdEmployees, createdVehicles });
};
