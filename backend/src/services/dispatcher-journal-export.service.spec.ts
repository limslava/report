import { buildDispatcherJournalWorkbook, parseRegistryAmount } from './dispatcher-journal-export.service';

describe('Excel реестра', () => {
  const orders = [
    { orderDate: '2026-09-15', position: 2000, status: 'выполнена', clientRate: '12000+3000', passes: '', vat: 'НДС22%', orderOnVehicle: true },
    { orderDate: '2026-08-31', position: 1000, status: 'новая', clientRate: 'договорная', vat: null, orderOnVehicle: false },
    { orderDate: '2026-09-14', position: 3000, status: null, clientRate: null, vat: null },
  ];
  const palettes = { status: new Map([['выполнена', { color: '#38761d', textColor: null }]]) };

  it('лист на каждый месяц, строки в порядке реестра, деньги числами', () => {
    const workbook = buildDispatcherJournalWorkbook({ orders, palettes, hideFinance: false });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Август 2026', 'Сентябрь 2026']);
    const september = workbook.getWorksheet('Сентябрь 2026')!;
    expect(september.getRow(1).getCell(3).value).toBe('№ заказа');
    expect(september.getRow(1).getCell(4).value).toBe('Статус');
    expect(september.getRow(1).getCell(september.getRow(1).cellCount).value).toBe('Ответственный');
    expect(september.getRow(2).getCell('status').value).toBe('выполнена');
    expect(september.getRow(2).getCell('clientRate').value).toBe(15000);
    expect(september.getRow(2).getCell('amountWithoutVat').value).toBeCloseTo(12295.08);
    expect(september.getRow(2).getCell('orderOnVehicle').value).toBe('да');
    expect((september.getRow(2).getCell('status').fill as any).fgColor.argb).toBe('FF38761D');
    expect(workbook.getWorksheet('Август 2026')!.getRow(2).getCell('clientRate').value).toBe('договорная');
  });

  it('роли просмотра — без денежных столбцов', () => {
    const workbook = buildDispatcherJournalWorkbook({ orders, palettes, hideFinance: true });
    const titles = (workbook.worksheets[0].getRow(1).values as unknown[]).filter(Boolean);
    expect(titles).not.toContain('Ставка');
    expect(titles).not.toContain('Без НДС');
    expect(titles).toContain('Пломба');
  });

  it('разбирает суммы', () => {
    expect(parseRegistryAmount('2x2 500')).toBe(5000);
    expect(parseRegistryAmount('')).toBeNull();
  });
});
