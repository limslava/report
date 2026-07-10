jest.mock('../config/data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

import ExcelJS from 'exceljs';
import {
  assertWarehouseBillingPeriodCompleted,
  buildWarehouseBillingExcel,
  calculateWarehouseBillingTotals,
  calculateWarehouseStorage,
  findWarehouseTariffForDate,
  WarehouseBillingReport,
  WarehouseBillingVehicleLine,
} from './warehouse-billing.service';

describe('warehouse billing calculations', () => {
  it('does not allow closing the current or a future Vladivostok date', () => {
    const now = new Date('2026-06-23T02:00:00.000Z');
    expect(() => assertWarehouseBillingPeriodCompleted('2026-06-22', now)).not.toThrow();
    expect(() => assertWarehouseBillingPeriodCompleted('2026-06-23', now)).toThrow(
      'Можно закрыть только завершившийся период',
    );
    expect(() => assertWarehouseBillingPeriodCompleted('2026-06-24', now)).toThrow(
      'Можно закрыть только завершившийся период',
    );
  });

  it('selects an operation tariff by vehicle type and event date', () => {
    const tariffs = [
      {
        serviceId: 'acceptance',
        vehicleType: 'passenger',
        validFrom: '2026-01-01',
        validTo: '2026-06-30',
        price: '1000.00',
      },
      {
        serviceId: 'acceptance',
        vehicleType: 'passenger',
        validFrom: '2026-07-01',
        validTo: null,
        price: '1200.00',
      },
      {
        serviceId: 'acceptance',
        vehicleType: 'truck',
        validFrom: '2026-01-01',
        validTo: null,
        price: '2000.00',
      },
    ] as any;

    expect(findWarehouseTariffForDate(tariffs, 'acceptance', 'passenger', '2026-06-23')?.price)
      .toBe('1000.00');
    expect(findWarehouseTariffForDate(tariffs, 'acceptance', 'truck', '2026-06-23')?.price)
      .toBe('2000.00');
  });

  it('includes both reception and issue dates', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-01',
      issuedDate: '2026-06-03',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'passenger',
      tariffs: [{
        vehicleType: 'passenger',
        validFrom: '2026-01-01',
        validTo: null,
        price: '100.00',
      }],
    });

    expect(result.storageDays).toBe(3);
    expect(result.storageAmount).toBe(300);
    expect(result.storageRates).toEqual([{ price: 100, days: 3, amount: 300 }]);
  });

  it('charges one day when received and issued on the same date', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-22',
      issuedDate: '2026-06-22',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'truck',
      tariffs: [{
        vehicleType: 'truck',
        validFrom: '2026-06-01',
        validTo: null,
        price: '250.00',
      }],
    });

    expect(result.storageDays).toBe(1);
    expect(result.storageAmount).toBe(250);
  });

  it('calculates storage with a dedicated trailer tariff', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-10',
      issuedDate: '2026-06-12',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'trailer',
      tariffs: [
        {
          vehicleType: 'passenger',
          validFrom: '2026-01-01',
          validTo: null,
          price: '100.00',
        },
        {
          vehicleType: 'trailer',
          validFrom: '2026-01-01',
          validTo: null,
          price: '300.00',
        },
      ],
    });

    expect(result.storageDays).toBe(3);
    expect(result.storageAmount).toBe(900);
    expect(result.storageRates).toEqual([{ price: 300, days: 3, amount: 900 }]);
  });

  it('applies tariff versions by each calendar date', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-01',
      issuedDate: '2026-06-04',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'passenger',
      tariffs: [
        {
          vehicleType: 'passenger',
          validFrom: '2026-06-01',
          validTo: '2026-06-02',
          price: '100.00',
        },
        {
          vehicleType: 'passenger',
          validFrom: '2026-06-03',
          validTo: null,
          price: '150.00',
        },
      ],
    });

    expect(result.storageDays).toBe(4);
    expect(result.storageAmount).toBe(500);
    expect(result.storageRates).toEqual([
      { price: 100, days: 2, amount: 200 },
      { price: 150, days: 2, amount: 300 },
    ]);
  });

  it('clips storage to the selected billing period when vehicle spans outside it', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-05-20',
      issuedDate: '2026-07-10',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'passenger',
      tariffs: [{
        vehicleType: 'passenger',
        validFrom: '2026-01-01',
        validTo: null,
        price: '100.00',
      }],
    });

    expect(result.storageFrom).toBe('2026-06-01');
    expect(result.storageTo).toBe('2026-06-30');
    expect(result.storageDays).toBe(30);
    expect(result.storageAmount).toBe(3000);
  });

  it('charges an open on-site vehicle through the selected period end', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-15',
      issuedDate: null,
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'truck',
      tariffs: [{
        vehicleType: 'truck',
        validFrom: '2026-01-01',
        validTo: null,
        price: '250.00',
      }],
    });

    expect(result.storageFrom).toBe('2026-06-15');
    expect(result.storageTo).toBe('2026-06-30');
    expect(result.storageDays).toBe(16);
    expect(result.storageAmount).toBe(4000);
  });

  it('reports all storage dates that fall into a tariff gap', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-01',
      issuedDate: '2026-06-05',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'passenger',
      tariffs: [
        {
          vehicleType: 'passenger',
          validFrom: '2026-06-01',
          validTo: '2026-06-02',
          price: '100.00',
        },
        {
          vehicleType: 'passenger',
          validFrom: '2026-06-05',
          validTo: null,
          price: '150.00',
        },
      ],
    });

    expect(result.storageDays).toBe(5);
    expect(result.storageAmount).toBe(350);
    expect(result.missingTariffDates).toEqual(['2026-06-03', '2026-06-04']);
  });

  it('reports dates without a tariff but preserves calendar day count', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-06-01',
      issuedDate: '2026-06-03',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      vehicleType: 'passenger',
      tariffs: [{
        vehicleType: 'passenger',
        validFrom: '2026-06-02',
        validTo: null,
        price: '100.00',
      }],
    });

    expect(result.storageDays).toBe(3);
    expect(result.storageAmount).toBe(200);
    expect(result.missingTariffDates).toEqual(['2026-06-01']);
  });

  it('combines storage and additional service totals', () => {
    const line = {
      storageDays: 3,
      storageAmount: 300,
      servicesAmount: 100,
      totalAmount: 400,
    } as WarehouseBillingVehicleLine;

    expect(calculateWarehouseBillingTotals([line])).toEqual({
      vehicleCount: 1,
      storageDays: 3,
      storageAmount: 300,
      servicesAmount: 100,
      totalAmount: 400,
      vatRate: 0,
      vatAmount: 0,
      totalWithoutVat: 400,
      totalWithVat: 400,
    });
    expect(calculateWarehouseBillingTotals([line], 20)).toMatchObject({
      totalAmount: 400,
      vatRate: 20,
      vatAmount: 66.67,
      totalWithoutVat: 333.33,
      totalWithVat: 400,
    });
  });

  it('exports billing excel with separate act and additional service sheets', async () => {
    const report: WarehouseBillingReport = {
      periodFrom: '2026-07-01',
      periodTo: '2026-07-31',
      counterpartyId: null,
      counterpartyName: null,
      status: 'preview',
      closedPeriodId: null,
      closedAt: null,
      lines: [{
        vehicleId: 'vehicle-1',
        warehouseNumber: 'СКЛ-2026-000001',
        counterpartyId: 'counterparty-1',
        counterpartyName: 'ООО Тест',
        counterpartyInn: '7700000000',
        vehicleType: 'passenger',
        vehicleName: 'Марка Модель',
        vin: 'VIN001',
        registrationNumber: 'А001АА',
        storageFrom: '2026-07-01',
        storageTo: '2026-07-31',
        storageDays: 31,
        storageAmount: 3100,
        storageRates: [{ price: 100, days: 31, amount: 3100 }],
        services: [
          {
            id: 'automatic:vehicle_acceptance:vehicle-1',
            name: 'Прием ТС',
            performedAt: '2026-07-01T01:00:00.000Z',
            quantity: 1,
            unit: 'operation',
            unitPrice: 500,
            amount: 500,
            performedByName: 'Система',
            comment: null,
          },
          {
            id: 'service-1',
            name: 'Мойка',
            performedAt: '2026-07-03T01:00:00.000Z',
            quantity: 2,
            unit: 'operation',
            unitPrice: 700,
            amount: 1400,
            performedByName: 'Оператор',
            comment: null,
          },
        ],
        servicesAmount: 1900,
        totalAmount: 5000,
      }],
      totals: {
        vehicleCount: 1,
        storageDays: 31,
        storageAmount: 3100,
        servicesAmount: 1900,
        totalAmount: 5000,
        vatRate: 20,
        vatAmount: 833.33,
        totalWithoutVat: 4166.67,
        totalWithVat: 5000,
      },
      warnings: [],
    };

    const buffer = await buildWarehouseBillingExcel(report);
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Акт', 'Доп услуги']);
    expect(workbook.getWorksheet('Акт')?.getRow(4).values).toEqual([
      undefined,
      'Складской №',
      'Контрагент',
      'ТС',
      'VIN',
      'гос.номер',
      'Начало расчетного периода',
      'Расчетная дата',
      'Кол-во суток ',
      'Стоймость хранения сут./руб.',
      'Итого хранение',
      'Дата приема',
      'Итого за прием',
      'Дата выдачи',
      'Итого за выдачу',
      'Всего Итого',
    ]);
    expect(workbook.getWorksheet('Акт')?.getCell('I5').value).toBe('100');
    expect(workbook.getWorksheet('Акт')?.getCell('L5').value).toBe(500);
    expect(workbook.getWorksheet('Доп услуги')?.getCell('F2').value).toBe('Мойка');
    expect(workbook.getWorksheet('Доп услуги')?.getCell('J2').value).toBe(1400);
  });
});
