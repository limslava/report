import ExcelJS from 'exceljs';
import { parseDispatcherWorkbook } from './dispatcher-import.service';

const HEADER = [
  null, 'статус', 'инфо', 'клиент', 'ФИО водителя\n', 'гос номер', '№ ктк', 'Тип ктк', 'вес', 'Вес ктк (брутто)',
  'комментарии', 'Операция', 'Терминал постановки', 'слот', 'пин', 'пин', 'Время подачи', 'Адрес доставки',
  'Терминал снятия', 'слот', 'пин', 'пин', 'Ставка водителя', 'НДС', 'Ставка', 'пропуска\n', 'доп адрес',
  'Простой/руб клиенту', null, 'Заказ на ТС', 'Отправка счета', 'доп тонна', 'Пломба', 'Перецеп', 'замечания к водителю',
];

async function buildWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Сентябрь 2026');
  sheet.addRow(HEADER);
  sheet.addRow([
    new Date(Date.UTC(2026, 8, 1)), 'выполнена', 'озон', 'ДелТрансЛогистика', 'Усынин', 'Н099СВ 125', 'TRZU1103134', 40,
    'вес', 9200, null, 'выгрузка', 'Сухой порт', 'ам 9164', 'пин', null, new Date(Date.UTC(1899, 11, 30, 10, 0)),
    'г.Артем Солнечная 46', 'Первомайский', new Date(Date.UTC(2018, 7, 1)), 'пин', 9540, 4000, 'НДС22%', 28200, '2x2500',
    null, null, null, 'TRUE', 'FALSE', null, null, 'FALSE', null,
  ]);
  // разделитель дня — только дата
  sheet.addRow([new Date(Date.UTC(2026, 8, 1))]);
  sheet.addRow([null, 'новая', null, 'Хасан']);
  workbook.addWorksheet('терминалы').addRow(['Название', 'Адрес']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseDispatcherWorkbook', () => {
  it('разбирает лист-месяц по шапке и пропускает служебное', async () => {
    const sheets = await parseDispatcherWorkbook(await buildWorkbook());
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Сентябрь 2026']);
    const [sheet] = sheets;
    expect(sheet.orders).toHaveLength(1);
    expect(sheet.skippedRows).toBe(2);
    const [order] = sheet.orders;
    expect(order).toMatchObject({
      orderDate: '2026-09-01',
      status: 'выполнена',
      driverName: 'Усынин',
      ktkType: '40',
      grossWeight: '9200',
      terminalFrom: 'Сухой порт',
      slotFrom: 'ам 9164',
      pinFrom: null,
      submitTime: '10:00',
      terminalTo: 'Первомайский',
      slotTo: '8-18',
      pinTo: '9540',
      driverRate: '4000',
      vat: 'НДС22%',
      clientRate: '28200',
      passes: '2x2500',
      orderOnVehicle: true,
      invoiceSent: false,
      recoupling: false,
    });
  });
});
