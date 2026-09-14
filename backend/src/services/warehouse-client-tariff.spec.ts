jest.mock('../config/data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

import { calculateWarehouseStorage, findWarehouseTariffForDate, pickWarehouseTariff } from './warehouse-billing.service';

const base = (validFrom: string, validTo: string | null, price: string) => ({
  serviceId: 'storage', vehicleType: 'passenger' as const, validFrom, validTo, price, counterpartyId: null,
});
const individual = (counterpartyId: string, validFrom: string, validTo: string | null, price: string) => ({
  serviceId: 'storage', vehicleType: 'passenger' as const, validFrom, validTo, price, counterpartyId,
});

describe('индивидуальные тарифы клиентов склада (решение 2026-09-14)', () => {
  const tariffs = [
    base('2026-01-01', null, '500.00'),
    individual('client-a', '2026-09-10', '2026-09-19', '350.00'),
    individual('client-b', '2026-01-01', null, '420.00'),
  ];

  it('клиент с индивидуальной ценой получает её на датах её действия', () => {
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-12', 'client-a')?.price).toBe('350.00');
  });

  it('вне периода индивидуальной цены действует базовая', () => {
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-09', 'client-a')?.price).toBe('500.00');
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-20', 'client-a')?.price).toBe('500.00');
  });

  it('индивидуальная цена одного клиента не влияет на других и на базовый прайс', () => {
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-12', 'client-c')?.price).toBe('500.00');
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-12', null)?.price).toBe('500.00');
    expect(pickWarehouseTariff(tariffs, 'passenger', '2026-09-12', 'client-b')?.price).toBe('420.00');
  });

  it('разовые услуги (приёмка/выдача) тоже берут цену клиента', () => {
    const operations = [
      { ...base('2026-01-01', null, '1000.00'), serviceId: 'acceptance' },
      { ...individual('client-a', '2026-01-01', null, '800.00'), serviceId: 'acceptance' },
    ] as any;
    expect(findWarehouseTariffForDate(operations, 'acceptance', 'passenger', '2026-09-12', 'client-a')?.price)
      .toBe('800.00');
    expect(findWarehouseTariffForDate(operations, 'acceptance', 'passenger', '2026-09-12', 'client-z')?.price)
      .toBe('1000.00');
  });

  it('хранение за период считается посуточно со сменой цены на границе индивидуального периода', () => {
    const result = calculateWarehouseStorage({
      receivedDate: '2026-09-08',
      issuedDate: '2026-09-11',
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      vehicleType: 'passenger',
      tariffs,
      counterpartyId: 'client-a',
    });
    // 08, 09 — базовая 500; 10, 11 — индивидуальная 350
    expect(result.storageDays).toBe(4);
    expect(result.storageAmount).toBe(1700);
    expect(result.storageRates).toEqual(expect.arrayContaining([
      { price: 500, days: 2, amount: 1000 },
      { price: 350, days: 2, amount: 700 },
    ]));
  });
});
