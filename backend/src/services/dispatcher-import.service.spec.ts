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

  it('переживает особенности реальной таблицы: затёртая шапка ФИО, «пин» без заголовка, даты вместо слотов, время числом', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Май2026');
    const header = [...HEADER] as Array<string | null>;
    header[0] = ' дата';
    header[4] = 'Анциферов ';     // заголовок ФИО затёрт фамилией
    header[15] = null;            // вторая «пин» без заголовка
    header.splice(22, 0, 'Ставка ЧАСТНИКА');
    sheet.addRow(header);
    const row: unknown[] = new Array(header.length).fill(null);
    row[0] = new Date(Date.UTC(2026, 4, 1));
    row[1] = 'выполнена';
    row[3] = 'Глоуб Экспресс';
    row[4] = 'Руденко';
    row[5] = ' М604ХР 125';
    row[13] = new Date(Date.UTC(2026, 11, 10)); // «10-12», превращённое google в 10 декабря
    row[14] = 'пин';
    row[15] = 5825;
    row[16] = 8;                                 // время подачи числом
    row[22] = 22000;                             // ставка частника — не сопоставляется
    row[34] = 1;                                 // перецеп = 1
    sheet.addRow(row);
    const second = [...row];
    second[16] = '10-00';
    sheet.addRow(second);
    const [parsed] = await parseDispatcherWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.unmappedColumns).toEqual(['ставка частника']);
    expect(parsed.orders[0]).toMatchObject({
      driverName: 'Руденко',
      vehiclePlate: 'М604ХР 125',
      slotFrom: '10-12',
      pinFrom: '5825',
      submitTime: '08:00',
      recoupling: true,
    });
    expect(parsed.orders[1].submitTime).toBe('10:00');
  });
});
