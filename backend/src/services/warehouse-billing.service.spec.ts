jest.mock('../config/data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

import {
  assertWarehouseBillingPeriodCompleted,
  calculateWarehouseBillingTotals,
  calculateWarehouseStorage,
  findWarehouseTariffForDate,
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
    });
  });
});
