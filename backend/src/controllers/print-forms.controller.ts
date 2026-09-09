import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { AppSetting } from '../models/app-setting.model';
import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { PrintedForm } from '../models/printed-form.model';
import { User } from '../models/user.model';
import { recordAuditLog } from '../services/audit-log.service';
import {
  DEFAULT_PRINT_COUNTERPARTIES,
  DEFAULT_PRINT_ORG,
  PRINT_FORM_TEMPLATES,
  PrintCounterparty,
  PrintOrgSettings,
  PrintTemplateKey,
  buildPoaPl,
  buildPoaTerminalVehicle,
  buildPoaWarehouse,
  buildVmppDriversApproval,
  buildVmppVehiclesRequest,
  formatDateDots,
  POA_VARIANTS,
} from '../services/print-forms.service';
import { convertDocxBufferToPdf } from '../services/docx-pdf-preview.service';
import { directoryLocationsForRole, isValidLocation } from '../constants/directories';

const settingsRepo = AppDataSource.getRepository(AppSetting);
const employeeRepo = AppDataSource.getRepository(Employee);
const vehicleRepo = AppDataSource.getRepository(FleetVehicle);
const formRepo = AppDataSource.getRepository(PrintedForm);
const userRepo = AppDataSource.getRepository(User);

const PRINT_SETTINGS_KEY = 'print_forms_settings';

const httpError = (statusCode: number, message: string): never => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const requireLocation = (req: Request, raw: unknown): FleetLocation => {
  if (!isValidLocation(raw)) return httpError(400, 'Unknown location') as never;
  if (!directoryLocationsForRole(req.user?.role).includes(raw)) {
    httpError(403, 'Access denied for this location');
  }
  return raw;
};

type PrintSettings = { org: PrintOrgSettings; counterparties: PrintCounterparty[] };

async function loadPrintSettings(): Promise<PrintSettings> {
  const row = await settingsRepo.findOne({ where: { key: PRINT_SETTINGS_KEY } });
  if (!row) return { org: DEFAULT_PRINT_ORG, counterparties: DEFAULT_PRINT_COUNTERPARTIES };
  try {
    const parsed = JSON.parse(row.value);
    return {
      org: { ...DEFAULT_PRINT_ORG, ...(parsed?.org ?? {}) },
      counterparties: Array.isArray(parsed?.counterparties) && parsed.counterparties.length
        ? parsed.counterparties
        : DEFAULT_PRINT_COUNTERPARTIES,
    };
  } catch {
    return { org: DEFAULT_PRINT_ORG, counterparties: DEFAULT_PRINT_COUNTERPARTIES };
  }
}

/** Следующий номер доверенности: сквозной по региону и году выдачи. */
/** Ключи заявок — у них своя сквозная нумерация, отдельная от доверенностей. */
const REQUEST_TEMPLATE_KEYS = ['vmpp_vehicles_request', 'vmpp_drivers_approval', 'carrier_vehicles'];

async function nextFormNumber(location: FleetLocation, issueDate: string, requestKeys: boolean): Promise<number> {
  const year = issueDate.slice(0, 4);
  const query = formRepo
    .createQueryBuilder('form')
    .select('MAX(form.form_number)', 'max')
    .where('form.location = :location', { location })
    .andWhere("to_char(form.issue_date, 'YYYY') = :year", { year });
  if (requestKeys) query.andWhere('form.template_key IN (:...keys)', { keys: REQUEST_TEMPLATE_KEYS });
  else query.andWhere('form.template_key NOT IN (:...keys)', { keys: REQUEST_TEMPLATE_KEYS });
  const row = await query.getRawOne<{ max: number | null }>();
  return (row?.max ?? 0) + 1;
}

const nextPoaNumber = (location: FleetLocation, issueDate: string) => nextFormNumber(location, issueDate, false);

export const getPrintFormsMeta = async (req: Request, res: Response) => {
  const location = requireLocation(req, req.query.location);
  const settings = await loadPrintSettings();
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    templates: PRINT_FORM_TEMPLATES,
    counterparties: settings.counterparties,
    org: { shortName: settings.org.shortName, generalDirector: settings.org.generalDirector },
    nextNumber: await nextPoaNumber(location, today),
  });
};

const isoDate = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    httpError(400, `Некорректная дата в поле ${field}`);
  }
  return value as string;
};

const loadEmployee = async (id: unknown, location: FleetLocation): Promise<Employee> => {
  if (typeof id !== 'string' || !id) httpError(400, 'Не выбран сотрудник');
  const employee = await employeeRepo.findOne({ where: { id: id as string } });
  if (!employee || employee.location !== location) return httpError(404, 'Сотрудник не найден в справочнике региона') as never;
  return employee;
};

const loadVehicle = async (id: unknown, location: FleetLocation): Promise<FleetVehicle> => {
  if (typeof id !== 'string' || !id) httpError(400, 'Не выбрано ТС');
  const vehicle = await vehicleRepo.findOne({ where: { id: id as string }, relations: { model: true } });
  if (!vehicle || vehicle.location !== location) return httpError(404, 'ТС не найдено в справочнике региона') as never;
  return vehicle;
};

type GeneratedFile = { buffer: Buffer; filename: string; formNumber: number | null; summary: string };

async function generateByTemplate(
  rawTemplateKey: string,
  location: FleetLocation,
  rawParams: Record<string, unknown>
): Promise<GeneratedFile> {
  const settings = await loadPrintSettings();
  const org = settings.org;

  // Вариант доверенности → базовый шаблон с зашитым контрагентом.
  // Старые ключи журнала (poa_warehouse/poa_terminal_vehicle с counterparty в params) обрабатываются как есть.
  const variant = POA_VARIANTS[rawTemplateKey];
  const templateKey = variant ? variant.base : rawTemplateKey;
  const params = variant
    ? { ...rawParams, counterparty: variant.counterparty, withSignature: variant.withSignature }
    : rawParams;

  if (templateKey === 'poa_warehouse' || templateKey === 'poa_pl') {
    const employee = await loadEmployee(params.employeeId, location);
    const issueDate = isoDate(params.issueDate, 'дата выдачи');
    const validUntil = isoDate(params.validUntil, 'действительна по');
    const counterparty = typeof params.counterparty === 'string' && params.counterparty ? params.counterparty : httpError(400, 'Не выбран контрагент') as never;
    const withSignature = Boolean(params.withSignature);
    const numberRaw = params.number;
    const number = numberRaw === null || numberRaw === '' ? null : Number(numberRaw);
    if (number !== null && (!Number.isInteger(number) || number < 1)) httpError(400, 'Некорректный номер');
    const shortName = employee.fullName.split(/\s+/).slice(0, 2).join(' ');
    if (templateKey === 'poa_warehouse') {
      if (number === null) httpError(400, 'У этой доверенности должен быть номер');
      const buffer = buildPoaWarehouse(org, employee, {
        number: number as number,
        issueDate,
        validUntil,
        counterparty: counterparty as string,
        withSignature,
        location,
      });
      return {
        buffer,
        filename: `Доверенность №${number} ${shortName}.docx`,
        formNumber: number as number,
        summary: `${employee.fullName} · ${counterparty}`,
      };
    }
    const buffer = buildPoaPl(org, employee, {
      number,
      issueDate,
      validUntil,
      counterparty: counterparty as string,
      withSignature,
      location,
    });
    return {
      buffer,
      filename: `Доверенность ${number === null ? 'б-н' : `№${number}`} ${shortName}.docx`,
      formNumber: number,
      summary: `${employee.fullName} · ${counterparty}`,
    };
  }

  if (templateKey === 'poa_terminal_vehicle') {
    const employee = await loadEmployee(params.employeeId, location);
    const vehicle = await loadVehicle(params.vehicleId, location);
    const issueDate = isoDate(params.issueDate, 'дата выдачи');
    const validFrom = isoDate(params.validFrom, 'действительна с');
    const validUntil = isoDate(params.validUntil, 'действительна по');
    const counterparty = typeof params.counterparty === 'string' && params.counterparty ? params.counterparty : httpError(400, 'Не выбран терминал') as never;
    const number = Number(params.number);
    if (!Number.isInteger(number) || number < 1) httpError(400, 'Некорректный номер');
    const details = settings.counterparties.find((c) => c.label === counterparty)?.details ?? '';
    const buffer = buildPoaTerminalVehicle(org, employee, vehicle, {
      number,
      issueDate,
      validFrom,
      validUntil,
      counterparty: counterparty as string,
      counterpartyDetails: details,
      location,
    });
    const shortName = employee.fullName.split(/\s+/).slice(0, 2).join(' ');
    return {
      buffer,
      filename: `Доверенность №${number} ${shortName} ${vehicle.plate}.docx`,
      formNumber: number,
      summary: `${employee.fullName} · ${vehicle.plate} · ${counterparty}`,
    };
  }

  if (templateKey === 'vmpp_vehicles_request' || templateKey === 'vmpp_drivers_approval') {
    const contractLine = typeof params.contractLine === 'string' && params.contractLine.trim()
      ? params.contractLine.trim()
      : httpError(400, 'Укажите договор аккредитации') as never;
    const carrierName = typeof params.carrierName === 'string' && params.carrierName.trim() ? params.carrierName.trim() : org.shortName;
    if (templateKey === 'vmpp_drivers_approval') {
      const ids = Array.isArray(params.employeeIds) ? params.employeeIds.filter((x): x is string => typeof x === 'string') : [];
      if (!ids.length) httpError(400, 'Выберите водителей');
      const employees = await employeeRepo.find({ where: { id: In(ids), location }, order: { fullName: 'ASC' } });
      if (!employees.length) httpError(404, 'Водители не найдены');
      const buffer = buildVmppDriversApproval(org, employees, { contractLine: contractLine as string, carrierName, location });
      return {
        buffer,
        filename: `Согласование водителей ВМПП (${employees.length}).docx`,
        formNumber: null,
        summary: employees.map((e) => e.fullName).join(', ').slice(0, 5000),
      };
    }
    const pairsRaw = Array.isArray(params.pairs) ? params.pairs : [];
    const pairs: Array<{ employee: Employee; vehicle: FleetVehicle | null }> = [];
    for (const raw of pairsRaw as Array<Record<string, unknown>>) {
      const employee = await loadEmployee(raw.employeeId, location);
      const vehicle = typeof raw.vehicleId === 'string' && raw.vehicleId ? await loadVehicle(raw.vehicleId, location) : null;
      pairs.push({ employee, vehicle });
    }
    if (!pairs.length) httpError(400, 'Добавьте хотя бы одну строку «водитель + ТС»');
    const buffer = buildVmppVehiclesRequest(org, pairs, { contractLine: contractLine as string, carrierName, location });
    return {
      buffer,
      filename: `Заявка ИС ВМПП автотранспорт (${pairs.length}).docx`,
      formNumber: null,
      summary: pairs
        .map((pair) => `${pair.employee.fullName}${pair.vehicle ? ` — ${pair.vehicle.plate}` : ''}`)
        .join('; ')
        .slice(0, 5000),
    };
  }

  // carrier_vehicles — Excel со списком ТС
  const ids = Array.isArray(params.vehicleIds) ? params.vehicleIds.filter((x): x is string => typeof x === 'string') : [];
  const vehicles = ids.length
    ? await vehicleRepo.find({ where: { id: In(ids), location }, relations: { model: true }, order: { plate: 'ASC' } })
    : await vehicleRepo.find({ where: { location, status: 'active' }, relations: { model: true }, order: { plate: 'ASC' } });
  if (!vehicles.length) httpError(404, 'Техника не найдена');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Лист1');
  sheet.columns = [
    { header: 'Марка / модель', key: 'model', width: 26 },
    { header: '№ СОР и дата выдачи', key: 'sor', width: 24 },
    { header: 'Регистрационный знак', key: 'plate', width: 16 },
    { header: 'VIN / № кузова', key: 'vin', width: 24 },
    { header: 'Год выпуска ТС', key: 'year', width: 14 },
  ];
  sheet.insertRow(1, ['Транспортное средство']);
  sheet.mergeCells(1, 1, 1, 5);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: 'center' };
  sheet.getRow(2).font = { bold: true };
  const sorWithDate = (vehicle: (typeof vehicles)[number]): string => {
    if (!vehicle.sor) return '';
    if (!vehicle.sorIssueDate) return vehicle.sor;
    const [year, month, day] = vehicle.sorIssueDate.slice(0, 10).split('-');
    return day && month && year ? `${vehicle.sor} от ${day}.${month}.${year}` : vehicle.sor;
  };
  vehicles.forEach((vehicle) =>
    sheet.addRow({
      model: vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '',
      sor: sorWithDate(vehicle),
      plate: vehicle.plate,
      vin: vehicle.vin,
      year: vehicle.manufactureYear,
    })
  );
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: `Форма перевозчику ТС (${vehicles.length}).xlsx`,
    formNumber: null,
    summary: `ТС (${vehicles.length}): ${vehicles.map((v) => v.plate).join(', ')}`.slice(0, 5000),
  };
}

const isTemplateKey = (value: unknown): value is PrintTemplateKey =>
  PRINT_FORM_TEMPLATES.some((template) => template.key === value);

/** format=pdf: DOCX конвертируется в PDF и отдаётся inline — браузер открывает и печатает. */
const sendGenerated = async (res: Response, file: GeneratedFile, format?: unknown) => {
  const isXlsx = file.filename.endsWith('.xlsx');
  if (format === 'pdf' && !isXlsx) {
    const pdf = await convertDocxBufferToPdf(file.buffer);
    const pdfName = file.filename.replace(/\.docx$/i, '.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="form.pdf"; filename*=UTF-8''${encodeURIComponent(pdfName)}`);
    res.send(pdf);
    return;
  }
  res.setHeader(
    'Content-Type',
    isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="form.${isXlsx ? 'xlsx' : 'docx'}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`
  );
  res.send(file.buffer);
};

export const generatePrintForm = async (req: Request, res: Response) => {
  const location = requireLocation(req, req.body?.location);
  const templateKey = req.body?.templateKey;
  if (!isTemplateKey(templateKey)) return httpError(400, 'Неизвестный шаблон') as never;
  const params = (req.body?.params ?? {}) as Record<string, unknown>;
  const issueDateForJournal =
    typeof params.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.issueDate)
      ? (params.issueDate as string)
      : new Date().toISOString().slice(0, 10);

  // Номер присваивается автоматически (сквозной по региону и году; у заявок
  // свой счётчик, отдельный от доверенностей); при перегенерации из журнала
  // используется сохранённый номер из params.
  const isRequestForm = REQUEST_TEMPLATE_KEYS.includes(templateKey);
  const autoNumber =
    params.number === undefined || params.number === null || params.number === ''
      ? await nextFormNumber(location, issueDateForJournal, isRequestForm)
      : null;
  if (POA_VARIANTS[templateKey] && autoNumber !== null) params.number = autoNumber;

  const file = await generateByTemplate(templateKey, location, params);
  // заявки: номер только для журнала («для себя»), в сам документ не печатается
  if (isRequestForm && file.formNumber === null && autoNumber !== null) file.formNumber = autoNumber;

  const record = await formRepo.save(
    formRepo.create({
      location,
      templateKey,
      formNumber: file.formNumber,
      issueDate: issueDateForJournal,
      summary: file.summary,
      params,
      createdByUserId: req.user?.id ?? null,
    })
  );
  await recordAuditLog({
    action: 'PRINT_FORM_GENERATED',
    userId: req.user?.id ?? null,
    entityType: 'printed_form',
    entityId: record.id,
    details: { templateKey, location, summary: file.summary, formNumber: file.formNumber },
    req,
  });
  // saveOnly: форма только записывается в журнал, файл забирают из «Действий»
  if (req.body?.saveOnly) {
    res.status(201).json({ ok: true, id: record.id, formNumber: file.formNumber, summary: file.summary });
    return;
  }
  await sendGenerated(res, file, req.body?.format);
};

export const listPrintFormsJournal = async (req: Request, res: Response) => {
  const location = requireLocation(req, req.query.location);
  const rows = await formRepo.find({ where: { location }, order: { createdAt: 'DESC' }, take: 100 });
  const userIds = [...new Set(rows.map((row) => row.createdByUserId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length ? await userRepo.find({ where: { id: In(userIds) } }) : [];
  const nameById = new Map(users.map((user) => [user.id, user.fullName]));
  res.json(
    rows.map((row) => ({
      id: row.id,
      templateKey: row.templateKey,
      formNumber: row.formNumber,
      issueDate: formatDateDots(row.issueDate),
      validUntil:
        typeof (row.params as Record<string, unknown>)?.validUntil === 'string'
          ? formatDateDots((row.params as Record<string, string>).validUntil)
          : '',
      summary: row.summary,
      createdBy: row.createdByUserId ? nameById.get(row.createdByUserId) ?? '—' : '—',
      createdAt: row.createdAt,
    }))
  );
};

/** Повторное скачивание формы из журнала — с теми же параметрами. */
export const downloadPrintFormAgain = async (req: Request, res: Response) => {
  const record = await formRepo.findOne({ where: { id: req.params.id } });
  if (!record) return httpError(404, 'Запись журнала не найдена') as never;
  requireLocation(req, record.location);
  const file = await generateByTemplate(record.templateKey as PrintTemplateKey, record.location, record.params);
  await recordAuditLog({
    action: 'PRINT_FORM_DOWNLOADED_AGAIN',
    userId: req.user?.id ?? null,
    entityType: 'printed_form',
    entityId: record.id,
    details: { templateKey: record.templateKey, location: record.location },
    req,
  });
  await sendGenerated(res, file, req.query?.format);
};
