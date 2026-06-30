import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import { WAREHOUSE_VEHICLE_TYPE_LABELS } from '../constants/warehouse';
import { AppDataSource } from '../config/data-source';
import { WarehouseBillingPeriod } from '../models/warehouse-billing-period.model';
import { WarehouseOperation } from '../models/warehouse-operation.model';
import { WarehousePerformedService } from '../models/warehouse-performed-service.model';
import { WarehouseServiceDefinition } from '../models/warehouse-service-definition.model';
import { WarehouseTariff } from '../models/warehouse-tariff.model';
import { WarehouseVehicle, WarehouseVehicleType } from '../models/warehouse-vehicle.model';

export interface WarehouseBillingServiceLine {
  id: string;
  name: string;
  performedAt: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  performedByName: string;
  comment: string | null;
}

export interface WarehouseBillingVehicleLine {
  vehicleId: string;
  warehouseNumber: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyInn: string;
  vehicleType: WarehouseVehicleType;
  vehicleName: string;
  vin: string | null;
  registrationNumber: string | null;
  storageFrom: string;
  storageTo: string;
  storageDays: number;
  storageAmount: number;
  storageRates: Array<{ price: number; days: number; amount: number }>;
  services: WarehouseBillingServiceLine[];
  servicesAmount: number;
  totalAmount: number;
}

export interface WarehouseBillingReport {
  periodFrom: string;
  periodTo: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  status: 'preview' | 'closed';
  closedPeriodId: string | null;
  closedAt: string | null;
  lines: WarehouseBillingVehicleLine[];
  totals: {
    vehicleCount: number;
    storageDays: number;
    storageAmount: number;
    servicesAmount: number;
    totalAmount: number;
  };
  warnings: string[];
}

export const assertWarehouseBillingPeriodCompleted = (
  periodTo: string,
  now = new Date(),
): void => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (periodTo >= today) {
    const error: any = new Error(
      `Можно закрыть только завершившийся период. Дата окончания должна быть раньше ${today}`,
    );
    error.statusCode = 409;
    throw error;
  }
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const operationDateOnly = (value: Date): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Vladivostok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value);

export const findWarehouseTariffForDate = (
  tariffs: WarehouseTariff[],
  serviceId: string,
  vehicleType: WarehouseVehicleType,
  onDate: string,
): WarehouseTariff | null => tariffs
  .filter((item) => item.serviceId === serviceId
    && item.vehicleType === vehicleType
    && item.validFrom <= onDate
    && (!item.validTo || item.validTo >= onDate))
  .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const maxDate = (a: string, b: string) => a > b ? a : b;
const minDate = (a: string, b: string) => a < b ? a : b;

export interface WarehouseStorageCalculation {
  storageFrom: string;
  storageTo: string;
  storageDays: number;
  storageAmount: number;
  storageRates: Array<{ price: number; days: number; amount: number }>;
  missingTariffDates: string[];
}

export const calculateWarehouseStorage = (params: {
  receivedDate: string;
  issuedDate: string | null;
  periodFrom: string;
  periodTo: string;
  vehicleType: WarehouseVehicleType;
  tariffs: Array<Pick<WarehouseTariff, 'vehicleType' | 'validFrom' | 'validTo' | 'price'>>;
}): WarehouseStorageCalculation => {
  const storageFrom = maxDate(params.receivedDate, params.periodFrom);
  const storageTo = minDate(params.issuedDate ?? params.periodTo, params.periodTo);
  const rateGroups = new Map<number, number>();
  const missingTariffDates: string[] = [];
  let storageDays = 0;
  let storageAmount = 0;
  for (let date = storageFrom; date <= storageTo; date = addDays(date, 1)) {
    storageDays += 1;
    const tariff = params.tariffs
      .filter((item) => item.vehicleType === params.vehicleType
        && item.validFrom <= date
        && (!item.validTo || item.validTo >= date))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (!tariff) {
      missingTariffDates.push(date);
      continue;
    }
    const price = Number(tariff.price);
    storageAmount += price;
    rateGroups.set(price, (rateGroups.get(price) ?? 0) + 1);
  }
  return {
    storageFrom,
    storageTo,
    storageDays,
    storageAmount: roundMoney(storageAmount),
    storageRates: Array.from(rateGroups.entries()).map(([price, days]) => ({
      price,
      days,
      amount: roundMoney(price * days),
    })),
    missingTariffDates,
  };
};

export const calculateWarehouseBillingTotals = (lines: WarehouseBillingVehicleLine[]) => ({
  vehicleCount: lines.length,
  storageDays: lines.reduce((sum, line) => sum + line.storageDays, 0),
  storageAmount: roundMoney(lines.reduce((sum, line) => sum + line.storageAmount, 0)),
  servicesAmount: roundMoney(lines.reduce((sum, line) => sum + line.servicesAmount, 0)),
  totalAmount: roundMoney(lines.reduce((sum, line) => sum + line.totalAmount, 0)),
});

const filterReportByVehicleType = (
  report: WarehouseBillingReport,
  vehicleType?: WarehouseVehicleType | null,
): WarehouseBillingReport => {
  if (!vehicleType) return report;
  const lines = report.lines.filter((line) => line.vehicleType === vehicleType);
  return { ...report, lines, totals: calculateWarehouseBillingTotals(lines) };
};

const findClosedPeriod = async (
  periodFrom: string,
  periodTo: string,
  counterpartyId: string,
): Promise<WarehouseBillingPeriod | null> => AppDataSource.getRepository(WarehouseBillingPeriod).findOne({
  where: { counterpartyId, periodFrom, periodTo },
  relations: { counterparty: true },
});

export const calculateWarehouseBilling = async (params: {
  periodFrom: string;
  periodTo: string;
  counterpartyId?: string | null;
  vehicleType?: WarehouseVehicleType | null;
  useClosedSnapshot?: boolean;
}): Promise<WarehouseBillingReport> => {
  const {
    periodFrom,
    periodTo,
    counterpartyId = null,
    vehicleType = null,
    useClosedSnapshot = true,
  } = params;

  if (counterpartyId && useClosedSnapshot) {
    const closed = await findClosedPeriod(periodFrom, periodTo, counterpartyId);
    if (closed) {
      return filterReportByVehicleType(
        {
          ...(closed.snapshot as unknown as WarehouseBillingReport),
          status: 'closed',
          closedPeriodId: closed.id,
          closedAt: closed.closedAt.toISOString(),
        },
        vehicleType,
      );
    }
  }

  const vehicleQuery = AppDataSource.getRepository(WarehouseVehicle)
    .createQueryBuilder('vehicle')
    .innerJoinAndSelect('vehicle.counterparty', 'counterparty')
    .where('vehicle.receivedDate <= :periodTo', { periodTo })
    .andWhere('(vehicle.issuedDate IS NULL OR vehicle.issuedDate >= :periodFrom)', { periodFrom })
    .orderBy('counterparty.nameShort', 'ASC')
    .addOrderBy('vehicle.warehouseNumber', 'ASC');
  if (counterpartyId) vehicleQuery.andWhere('vehicle.counterpartyId = :counterpartyId', { counterpartyId });
  if (vehicleType) vehicleQuery.andWhere('vehicle.vehicleType = :vehicleType', { vehicleType });
  const vehicles = await vehicleQuery.getMany();

  const storageService = await AppDataSource.getRepository(WarehouseServiceDefinition).findOne({
    where: { code: 'storage_daily' },
  });
  const tariffs = storageService
    ? await AppDataSource.getRepository(WarehouseTariff)
      .createQueryBuilder('tariff')
      .where('tariff.serviceId = :serviceId', { serviceId: storageService.id })
      .andWhere('tariff.validFrom <= :periodTo', { periodTo })
      .andWhere('(tariff.validTo IS NULL OR tariff.validTo >= :periodFrom)', { periodFrom })
      .orderBy('tariff.validFrom', 'ASC')
      .getMany()
    : [];

  const performedQuery = AppDataSource.getRepository(WarehousePerformedService)
    .createQueryBuilder('performed')
    .innerJoinAndSelect('performed.service', 'service')
    .where(`(performed.performedAt AT TIME ZONE 'Asia/Vladivostok')::date BETWEEN :periodFrom AND :periodTo`, {
      periodFrom,
      periodTo,
    })
    .andWhere('service.code NOT IN (:...automaticCodes)', {
      automaticCodes: ['vehicle_acceptance', 'vehicle_issue'],
    });
  if (vehicles.length > 0) {
    performedQuery.andWhere('performed.vehicleId IN (:...vehicleIds)', {
      vehicleIds: vehicles.map((vehicle) => vehicle.id),
    });
  } else {
    performedQuery.andWhere('1 = 0');
  }
  const performedServices = await performedQuery.getMany();
  const servicesByVehicle = new Map<string, WarehousePerformedService[]>();
  performedServices.forEach((item) => {
    servicesByVehicle.set(item.vehicleId, [...(servicesByVehicle.get(item.vehicleId) ?? []), item]);
  });

  const automaticDefinitions = await AppDataSource.getRepository(WarehouseServiceDefinition).find({
    where: [
      { code: 'vehicle_acceptance' },
      { code: 'vehicle_issue' },
    ],
  });
  const automaticByCode = new Map(automaticDefinitions.map((service) => [service.code, service]));
  const automaticServiceIds = automaticDefinitions.map((service) => service.id);
  const automaticTariffs = automaticServiceIds.length > 0
    ? await AppDataSource.getRepository(WarehouseTariff)
      .createQueryBuilder('tariff')
      .where('tariff.serviceId IN (:...serviceIds)', { serviceIds: automaticServiceIds })
      .andWhere('tariff.validFrom <= :periodTo', { periodTo })
      .andWhere('(tariff.validTo IS NULL OR tariff.validTo >= :periodFrom)', { periodFrom })
      .orderBy('tariff.validFrom', 'ASC')
      .getMany()
    : [];
  const operationQuery = AppDataSource.getRepository(WarehouseOperation)
    .createQueryBuilder('operation')
    .where('operation.type IN (:...types)', { types: ['created', 'issued'] });
  if (vehicles.length > 0) {
    operationQuery.andWhere('operation.vehicleId IN (:...vehicleIds)', {
      vehicleIds: vehicles.map((vehicle) => vehicle.id),
    });
  } else {
    operationQuery.andWhere('1 = 0');
  }
  const operations = await operationQuery.getMany();
  const operationsByVehicle = new Map<string, WarehouseOperation[]>();
  operations.forEach((operation) => {
    operationsByVehicle.set(
      operation.vehicleId,
      [...(operationsByVehicle.get(operation.vehicleId) ?? []), operation],
    );
  });

  const warnings: string[] = [];
  if (!storageService) warnings.push('Системная услуга хранения не найдена.');
  const lines: WarehouseBillingVehicleLine[] = vehicles.map((vehicle) => {
    const storage = calculateWarehouseStorage({
      receivedDate: vehicle.receivedDate,
      issuedDate: vehicle.issuedDate,
      periodFrom,
      periodTo,
      vehicleType: vehicle.vehicleType,
      tariffs,
    });
    storage.missingTariffDates.forEach((date) => {
      warnings.push(`Нет тарифа хранения: ${vehicle.warehouseNumber}, ${date}.`);
    });

    const automaticServices: WarehouseBillingServiceLine[] = [];
    const addAutomaticService = (
      code: 'vehicle_acceptance' | 'vehicle_issue',
      eventDate: string | null,
      performedAt: Date | null,
      operationType: 'created' | 'issued',
    ) => {
      if (!eventDate || eventDate < periodFrom || eventDate > periodTo || !performedAt) return;
      const definition = automaticByCode.get(code);
      if (!definition) {
        warnings.push(`Системная услуга «${code}» не найдена: ${vehicle.warehouseNumber}.`);
        return;
      }
      const tariff = findWarehouseTariffForDate(
        automaticTariffs,
        definition.id,
        vehicle.vehicleType,
        eventDate,
      );
      const operation = (operationsByVehicle.get(vehicle.id) ?? [])
        .filter((item) => item.type === operationType)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!tariff) {
        warnings.push(
          `Нет тарифа «${definition.name}» для типа «${WAREHOUSE_VEHICLE_TYPE_LABELS[vehicle.vehicleType]}»: ${vehicle.warehouseNumber}, ${eventDate}.`,
        );
      }
      const unitPrice = tariff ? Number(tariff.price) : 0;
      automaticServices.push({
        id: `automatic:${code}:${vehicle.id}`,
        name: definition.name,
        performedAt: performedAt.toISOString(),
        quantity: 1,
        unit: definition.unit,
        unitPrice,
        amount: unitPrice,
        performedByName: operation?.actorName ?? 'Система',
        comment: 'Начисляется автоматически по факту складской операции',
      });
    };
    addAutomaticService('vehicle_acceptance', vehicle.receivedDate, vehicle.receivedAt, 'created');
    addAutomaticService('vehicle_issue', vehicle.issuedDate, vehicle.issuedAt, 'issued');

    const manualServices: WarehouseBillingServiceLine[] = (servicesByVehicle.get(vehicle.id) ?? [])
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime())
      .map((item) => {
        const unitPrice = Number(item.unitPrice);
        const amount = Number(item.totalAmount);
        if (unitPrice <= 0) {
          warnings.push(
            `Нет тарифа «${item.service.name}» для типа «${WAREHOUSE_VEHICLE_TYPE_LABELS[vehicle.vehicleType]}»: ${vehicle.warehouseNumber}, ${operationDateOnly(item.performedAt)}.`,
          );
        }
        return {
          id: item.id,
          name: item.service.name,
          performedAt: item.performedAt.toISOString(),
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice,
          amount,
          performedByName: item.performedByName,
          comment: item.comment,
        };
      });
    const services = [...automaticServices, ...manualServices]
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
    const servicesAmount = roundMoney(services.reduce((sum, item) => sum + item.amount, 0));

    return {
      vehicleId: vehicle.id,
      warehouseNumber: vehicle.warehouseNumber,
      counterpartyId: vehicle.counterpartyId,
      counterpartyName: vehicle.counterparty.nameShort || vehicle.counterparty.nameFull,
      counterpartyInn: vehicle.counterparty.inn,
      vehicleType: vehicle.vehicleType,
      vehicleName: `${vehicle.brand} ${vehicle.model}`.trim(),
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      storageFrom: storage.storageFrom,
      storageTo: storage.storageTo,
      storageDays: storage.storageDays,
      storageAmount: storage.storageAmount,
      storageRates: storage.storageRates,
      services,
      servicesAmount,
      totalAmount: roundMoney(storage.storageAmount + servicesAmount),
    };
  });

  return {
    periodFrom,
    periodTo,
    counterpartyId,
    counterpartyName: counterpartyId ? lines[0]?.counterpartyName ?? null : null,
    status: 'preview',
    closedPeriodId: null,
    closedAt: null,
    lines,
    totals: calculateWarehouseBillingTotals(lines),
    warnings: Array.from(new Set(warnings)),
  };
};

export const closeWarehouseBillingPeriod = async (params: {
  periodFrom: string;
  periodTo: string;
  counterpartyId: string;
  userId: string;
  userName: string;
}): Promise<WarehouseBillingReport> => {
  assertWarehouseBillingPeriodCompleted(params.periodTo);
  const existingOverlap = await AppDataSource.getRepository(WarehouseBillingPeriod)
    .createQueryBuilder('period')
    .where('period.counterpartyId = :counterpartyId', { counterpartyId: params.counterpartyId })
    .andWhere('period.periodFrom <= :periodTo', { periodTo: params.periodTo })
    .andWhere('period.periodTo >= :periodFrom', { periodFrom: params.periodFrom })
    .getOne();
  if (existingOverlap) {
    const error: any = new Error(
      `Период пересекается с уже закрытым ${existingOverlap.periodFrom}–${existingOverlap.periodTo}`,
    );
    error.statusCode = 409;
    throw error;
  }
  const report = await calculateWarehouseBilling({
    periodFrom: params.periodFrom,
    periodTo: params.periodTo,
    counterpartyId: params.counterpartyId,
    useClosedSnapshot: false,
  });
  if (report.warnings.length > 0) {
    const error: any = new Error('Нельзя закрыть период, пока не устранены ошибки тарифов');
    error.statusCode = 409;
    error.details = report.warnings;
    throw error;
  }
  const closedAt = new Date();
  const repository = AppDataSource.getRepository(WarehouseBillingPeriod);
  const saved = await repository.save(repository.create({
    counterpartyId: params.counterpartyId,
    periodFrom: params.periodFrom,
    periodTo: params.periodTo,
    status: 'closed',
    storageAmount: String(report.totals.storageAmount),
    servicesAmount: String(report.totals.servicesAmount),
    totalAmount: String(report.totals.totalAmount),
    snapshot: {
      ...report,
      status: 'closed',
      closedAt: closedAt.toISOString(),
    },
    closedById: params.userId,
    closedByName: params.userName,
    closedAt,
  }));
  return {
    ...report,
    status: 'closed',
    closedPeriodId: saved.id,
    closedAt: saved.closedAt.toISOString(),
  };
};

export const buildWarehouseBillingExcel = async (report: WarehouseBillingReport): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Акт');
  const headers = [
    'Складской №',
    'Контрагент',
    'ТС',
    'VIN / госномер',
    'Период хранения',
    'Суток',
    'Хранение, ₽',
    'Операции и услуги, ₽',
    'Итого, ₽',
  ];
  sheet.columns = [
    { key: 'warehouseNumber', width: 22 },
    { key: 'counterparty', width: 34 },
    { key: 'vehicle', width: 28 },
    { key: 'identifiers', width: 28 },
    { key: 'storagePeriod', width: 24 },
    { key: 'days', width: 10 },
    { key: 'storage', width: 16 },
    { key: 'services', width: 18 },
    { key: 'total', width: 16 },
  ];
  sheet.addRow([`Акт оказанных услуг за ${report.periodFrom}–${report.periodTo}`]);
  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.addRow([report.counterpartyName || 'Все контрагенты']);
  sheet.mergeCells('A2:I2');
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  });
  report.lines.forEach((line) => {
    sheet.addRow({
      warehouseNumber: line.warehouseNumber,
      counterparty: `${line.counterpartyName}, ИНН ${line.counterpartyInn}`,
      vehicle: line.vehicleName,
      identifiers: [line.vin, line.registrationNumber].filter(Boolean).join(' / '),
      storagePeriod: `${line.storageFrom}–${line.storageTo}`,
      days: line.storageDays,
      storage: line.storageAmount,
      services: line.servicesAmount,
      total: line.totalAmount,
    });
    line.services.forEach((service) => {
      sheet.addRow({
        vehicle: `↳ ${service.name}`,
        identifiers: new Date(service.performedAt).toLocaleString('ru-RU'),
        days: service.quantity,
        storage: service.unitPrice,
        services: service.amount,
      });
    });
  });
  const totalRow = sheet.addRow({
    vehicle: 'ИТОГО',
    days: report.totals.storageDays,
    storage: report.totals.storageAmount,
    services: report.totals.servicesAmount,
    total: report.totals.totalAmount,
  });
  totalRow.font = { bold: true };
  ['G', 'H', 'I'].forEach((column) => {
    sheet.getColumn(column).numFmt = '#,##0.00';
  });
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const buildWarehouseBillingPdf = async (report: WarehouseBillingReport): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const fontPath = [
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ].find((candidate) => fs.existsSync(candidate));
    if (fontPath) doc.font(fontPath);
    const ensurePage = (height = 40) => {
      if (doc.y + height > 780) doc.addPage();
    };
    const rub = (amount: number) => amount.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    doc.fontSize(9).text('Приложение № 4 к Договору хранения', { align: 'right' });
    doc.moveDown(0.8);
    doc.fontSize(15).text('Акт оказанных услуг', { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(10)
      .text('ООО «Симпл Вэй», именуемое в дальнейшем «Хранитель», и ООО «Газпромбанк Автолизинг», именуемое в дальнейшем «Поклажедатель», составили настоящий Акт о нижеследующем.');
    doc.moveDown(0.6);
    doc.text('Во исполнение Договора хранения Хранитель оказал услуги по хранению Техники, находящейся на территории Хранителя.');
    doc.text(`За период с ${report.periodFrom} по ${report.periodTo}.`);
    doc.text(`Поклажедатель: ${report.counterpartyName || 'Все контрагенты'}.`);
    doc.moveDown();

    doc.fontSize(11).text('1. Хранение техники', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(8);
    doc.text('Тип | Марка (модель) | Госномер | VIN / заводской номер | Дата передачи | Дата возврата | Тариф / стоимость');
    doc.moveDown(0.2);
    report.lines.forEach((line, index) => {
      ensurePage(36);
      const rates = line.storageRates
        .map((rate) => `${rub(rate.price)} x ${rate.days} сут. = ${rub(rate.amount)}`)
        .join('; ');
      doc.text([
        `${index + 1}. ${WAREHOUSE_VEHICLE_TYPE_LABELS[line.vehicleType]}`,
        line.vehicleName,
        line.registrationNumber || '-',
        line.vin || '-',
        line.storageFrom,
        line.storageTo,
        rates || rub(line.storageAmount),
      ].join(' | '));
    });
    doc.moveDown();

    const serviceLines = report.lines.flatMap((line) => line.services.map((service) => ({
      line,
      service,
    })));
    if (serviceLines.length > 0) {
      ensurePage(80);
      doc.fontSize(11).text('2. Дополнительные услуги', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(8).text('№ | Наименование услуги | ТС | Кол-во | Цена | Стоимость');
      serviceLines.forEach(({ line, service }, index) => {
        ensurePage(24);
        doc.text([
          String(index + 1),
          service.name,
          `${line.warehouseNumber} ${line.vehicleName}`,
          String(service.quantity),
          rub(service.unitPrice),
          rub(service.amount),
        ].join(' | '));
      });
      doc.moveDown();
    }

    ensurePage(90);
    doc.fontSize(11).text(`Итого хранение: ${rub(report.totals.storageAmount)} руб.`, { align: 'right' });
    doc.text(`Итого дополнительные услуги: ${rub(report.totals.servicesAmount)} руб.`, { align: 'right' });
    doc.fontSize(13).text(`ИТОГО: ${rub(report.totals.totalAmount)} руб.`, { align: 'right' });
    doc.fontSize(9).text('Сумма НДС указывается согласно применимому налоговому режиму и закрывающим документам.', { align: 'right' });
    doc.moveDown(1.5);
    doc.fontSize(10).text('Хранитель: ____________________ / ООО «Симпл Вэй» /');
    doc.moveDown(0.8);
    doc.text('Поклажедатель: ____________________ / ООО «Газпромбанк Автолизинг» /');
    doc.end();
  });
