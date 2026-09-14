import { summarizeWarehouseOperation } from './warehouse-operation-summary.service';

describe('История операций карточки ТС', () => {
  it('изменение карточки перечисляет только поменявшиеся поля', () => {
    const result = summarizeWarehouseOperation('updated', {
      before: { brand: 'Toyota', registrationNumber: null, fuelLevelPercent: 30 },
      after: { brand: 'Toyota', registrationNumber: 'А123ВС125', fuelLevelPercent: 35 },
    });
    expect(result.title).toBe('Изменена карточка');
    expect(result.description).toBe('госномер: — → А123ВС125; топливо: 30 % → 35 %');
  });

  it('корректировка дат показывает было/стало и причину', () => {
    const result = summarizeWarehouseOperation('dates_corrected', {
      before: { receivedAt: '2026-09-08T07:50:00.000Z' },
      after: { receivedAt: '2026-09-08T08:17:00.000Z' },
      reason: 'приёмка оформлена позже',
    });
    expect(result.description).toContain('08.09.2026, 17:50 → 08.09.2026, 18:17');
    expect(result.description).toContain('причина: «приёмка оформлена позже»');
  });

  it('услуга по прайсу клиента помечается', () => {
    const result = summarizeWarehouseOperation('service_performed', {
      serviceName: 'Фотоотчет', quantity: 1, unitPrice: 800, totalAmount: 800, individualTariff: true,
    });
    expect(result.title).toBe('Выполнена услуга «Фотоотчет»');
    expect(result.description).toContain('прайс клиента');
  });

  it('неизвестный тип не падает', () => {
    expect(summarizeWarehouseOperation('something_new', null)).toEqual({ title: 'something_new', description: null });
  });
});
