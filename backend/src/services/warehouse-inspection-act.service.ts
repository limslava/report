import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { WarehouseVehicleInspection } from '../models/warehouse-vehicle-inspection.model';
import { WarehouseVehicle } from '../models/warehouse-vehicle.model';
import { WAREHOUSE_VEHICLE_TYPE_LABELS } from '../constants/warehouse';

const PAGE_BOTTOM = 770;
type DamageSchemeType = 'passenger' | 'truck' | 'trailer' | 'special' | 'full';

const resolveAssetPath = (fileName: string): string => {
  const candidates = [
    path.resolve(process.cwd(), 'assets', fileName),
    path.resolve(process.cwd(), 'backend', 'assets', fileName),
    path.resolve(__dirname, '..', '..', 'assets', fileName),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const DAMAGE_SCHEME_PATHS: Record<DamageSchemeType, string> = {
  passenger: resolveAssetPath('warehouse-damage-scheme-passenger.png'),
  truck: resolveAssetPath('warehouse-damage-scheme-truck.png'),
  trailer: resolveAssetPath('warehouse-damage-scheme-trailer.png'),
  special: resolveAssetPath('warehouse-damage-scheme-special.png'),
  full: resolveAssetPath('warehouse-damage-scheme-full.png'),
};

type DamageMark = {
  id?: string;
  code?: string;
  x?: number;
  y?: number;
  comment?: string;
  schemeType?: DamageSchemeType;
};

const damageSchemeTypeForVehicle = (vehicle: WarehouseVehicle): DamageSchemeType => {
  if (vehicle.vehicleType === 'passenger') return 'passenger';
  if (vehicle.vehicleType === 'light_commercial' || vehicle.vehicleType === 'truck') return 'truck';
  if (vehicle.vehicleType === 'trailer') return 'trailer';
  if (vehicle.vehicleType === 'special') return 'special';
  return 'full';
};

const value = (source: Record<string, unknown> | null | undefined, key: string): string => {
  const raw = source?.[key];
  if (raw === true) return 'Да';
  if (raw === false) return 'Нет';
  if (raw === null || raw === undefined || raw === '') return '-';
  return String(raw);
};

const moneyText = (amount: string | null): string => {
  if (!amount) return '-';
  return `${Number(amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} руб.`;
};

const ensureSpace = (doc: PDFKit.PDFDocument, height: number) => {
  if (doc.y + height > PAGE_BOTTOM) doc.addPage();
};

const sectionTitle = (doc: PDFKit.PDFDocument, title: string) => {
  ensureSpace(doc, 26);
  doc.moveDown(0.5);
  doc.fontSize(10).font('ActBold').text(title);
  doc.moveDown(0.25);
};

const drawCellText = (
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PDFKit.Mixins.TextOptions = {},
) => {
  doc.text(text || '-', x + 4, y + 4, {
    width: width - 8,
    height: height - 8,
    ellipsis: true,
    ...options,
  });
};

const tableRows = (
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
  columns = 2,
) => {
  const x = doc.page.margins.left;
  const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const labelWidth = columns === 2 ? 190 : 150;
  const valueWidth = columns === 2 ? fullWidth - labelWidth : (fullWidth - labelWidth * 2) / 2;
  const rowHeight = 19;

  for (let index = 0; index < rows.length; index += columns === 2 ? 1 : 2) {
    ensureSpace(doc, rowHeight + 2);
    const y = doc.y;
    const first = rows[index];
    const second = rows[index + 1];

    doc.rect(x, y, labelWidth, rowHeight).stroke();
    doc.rect(x + labelWidth, y, valueWidth, rowHeight).stroke();
    doc.fontSize(8).font('ActBold');
    drawCellText(doc, first[0], x, y, labelWidth, rowHeight);
    doc.font('ActRegular');
    drawCellText(doc, first[1], x + labelWidth, y, valueWidth, rowHeight);

    if (columns === 4) {
      const secondLabelX = x + labelWidth + valueWidth;
      doc.rect(secondLabelX, y, labelWidth, rowHeight).stroke();
      doc.rect(secondLabelX + labelWidth, y, valueWidth, rowHeight).stroke();
      if (second) {
        doc.font('ActBold');
        drawCellText(doc, second[0], secondLabelX, y, labelWidth, rowHeight);
        doc.font('ActRegular');
        drawCellText(doc, second[1], secondLabelX + labelWidth, y, valueWidth, rowHeight);
      }
    }

    doc.y = y + rowHeight;
  }
};

const paragraphBox = (doc: PDFKit.PDFDocument, title: string, text: string) => {
  ensureSpace(doc, 70);
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 58;
  doc.fillColor('#000000').strokeColor('#000000');
  doc.rect(x, y, width, height).stroke();
  doc.fontSize(8).font('ActBold').text(title, x + 6, y + 5, { width: width - 12 });
  doc.font('ActRegular').text(text || '-', x + 6, y + 19, { width: width - 12, height: height - 24 });
  doc.y = y + height;
};

const drawDamageLegend = (doc: PDFKit.PDFDocument) => {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = width / 3;
  const rowHeight = 18;
  const rows = [
    ['Ц - царапина', 'О - отсутствие', 'К - коррозия металла'],
    ['В - вмятина', 'Т - трещина', 'С - скол'],
    ['П - перекос', '', ''],
  ];

  ensureSpace(doc, 76);
  doc.fontSize(9).font('ActBold').text('7. Состояние кузова (указать повреждения на схеме соответствующего типа ТС):');
  const startY = doc.y + 6;
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cellX = x + colWidth * colIndex;
      const cellY = startY + rowHeight * rowIndex;
      doc.rect(cellX, cellY, colWidth, rowHeight).stroke();
      doc.fontSize(8).font('ActBold');
      drawCellText(doc, cell, cellX, cellY, colWidth, rowHeight);
    });
  });
  doc.y = startY + rowHeight * rows.length + 10;
};

const drawDamageScheme = (doc: PDFKit.PDFDocument, schemeType: DamageSchemeType) => {
  drawDamageLegend(doc);
  ensureSpace(doc, 320);
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 292;
  const schemePath = DAMAGE_SCHEME_PATHS[schemeType];
  if (fs.existsSync(schemePath)) {
    doc.image(schemePath, x, y, {
      fit: [width, height],
      align: 'center',
      valign: 'center',
    });
  } else {
    doc.rect(x, y, width, height).stroke();
    doc.fontSize(8).font('ActRegular').text('Схема повреждений ТС', x, y + height / 2 - 5, {
      width,
      align: 'center',
    });
  }
  doc.y = y + height + 8;
  return { x, y, width, height };
};

const getDamageMarks = (inspection: WarehouseVehicleInspection): DamageMark[] => {
  const raw = inspection.technicalCondition?.damageMarks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((mark): mark is DamageMark => (
    typeof mark === 'object'
    && mark !== null
    && typeof mark.code === 'string'
    && typeof mark.x === 'number'
    && typeof mark.y === 'number'
  ));
};

const getDamageMarksForScheme = (
  inspection: WarehouseVehicleInspection,
  schemeType: DamageSchemeType,
): DamageMark[] => getDamageMarks(inspection)
  .filter((mark) => (mark.schemeType ?? schemeType) === schemeType);

const drawDamageMarks = (
  doc: PDFKit.PDFDocument,
  marks: DamageMark[],
  schemeX: number,
  schemeY: number,
  schemeWidth: number,
  schemeHeight: number,
) => {
  const previousY = doc.y;
  const previousX = doc.x;
  marks.forEach((mark, index) => {
    const x = schemeX + Math.max(0, Math.min(100, mark.x ?? 0)) / 100 * schemeWidth;
    const y = schemeY + Math.max(0, Math.min(100, mark.y ?? 0)) / 100 * schemeHeight;
    const label = `${mark.code}${index + 1}`;
    doc.strokeColor('#d32f2f');
    doc.circle(x, y, 9).fillAndStroke('#ffffff', '#d32f2f');
    doc.fillColor('#d32f2f').fontSize(7).font('ActBold').text(label, x - 8, y - 4, {
      width: 16,
      align: 'center',
    });
    doc.fillColor('#000000').strokeColor('#000000');
  });
  doc.x = previousX;
  doc.y = previousY;
};

export const buildWarehouseInspectionActPdf = (
  vehicle: WarehouseVehicle,
  inspection: WarehouseVehicleInspection,
): Promise<Buffer> => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const fontPath = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ].find((candidate) => fs.existsSync(candidate));
  if (fontPath) {
    doc.registerFont('ActRegular', fontPath);
    doc.registerFont('ActBold', fontPath);
    doc.font('ActRegular');
  }

  const isIssue = inspection.phase === 'issue';
  const title = isIssue ? 'Акт возврата ТС с хранения' : 'Акт приема-передачи ТС на хранение';
  const city = 'г. Владивосток';
  const formedAt = new Date().toLocaleDateString('ru-RU');

  doc.fontSize(13).font('ActBold').text(title, { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(8).font('ActRegular').text(`Складской номер: ${vehicle.warehouseNumber}`, { align: 'center' });
  doc.text(`Дата формирования: ${formedAt}`, { align: 'center' });
  doc.moveDown(0.8);

  const y = doc.y;
  doc.fontSize(9).text(city, doc.page.margins.left, y);
  doc.text(`Дата: ${formedAt}`, doc.page.width - doc.page.margins.right - 120, y, { width: 120, align: 'right' });
  doc.y = y + 18;

  doc.fontSize(8).text(
    isIssue
      ? 'Хранитель передал, а Поклажедатель принял транспортное средство с хранения в состоянии, отраженном в настоящем акте.'
      : 'Поклажедатель передал, а Хранитель принял транспортное средство на хранение в состоянии и комплектности, отраженных в настоящем акте.',
    { align: 'justify' },
  );

  sectionTitle(doc, '1. Стороны и реквизиты хранения');
  tableRows(doc, [
    ['Поклажедатель', vehicle.counterparty?.nameShort || vehicle.counterparty?.nameFull || '-'],
    ['Хранитель', 'ООО "Симпл Вэй"'],
    ['Входящая заявка клиента', vehicle.storageRequest?.requestNumber || '-'],
    ['Дата заявки', vehicle.storageRequest?.requestDate || '-'],
  ]);

  sectionTitle(doc, '2. Транспортное средство');
  tableRows(doc, [
    ['Тип ТС', WAREHOUSE_VEHICLE_TYPE_LABELS[vehicle.vehicleType]],
    ['Марка, модель', `${vehicle.brand} ${vehicle.model}`.trim()],
    ['Государственный номер', vehicle.registrationNumber || '-'],
    ['VIN', vehicle.vin || '-'],
    ['Шасси / рама', vehicle.chassisNumber || '-'],
    ['Модель и номер двигателя', value(inspection.vehicleDetails, 'engineNumber')],
    ['Кузов / кабина / прицеп', value(inspection.vehicleDetails, 'bodyNumber')],
    ['Год изготовления', value(inspection.vehicleDetails, 'manufactureYear')],
    ['Цвет кузова', value(inspection.vehicleDetails, 'bodyColor')],
    ['ПТС серия, номер', value(inspection.vehicleDetails, 'ptsNumber')],
    ['Показания одометра, км', value(inspection.vehicleDetails, 'odometerKm')],
    ['Показания счетчика установки, м/ч', value(inspection.vehicleDetails, 'hourMeter')],
  ], 4);

  sectionTitle(doc, '3. Документы, ключи и комплектность');
  tableRows(doc, [
    ['Сервисная книжка', value(inspection.documentsAndKeys, 'serviceBook')],
    ['Руководство по эксплуатации', value(inspection.documentsAndKeys, 'manual')],
    ['Ключи от замка зажигания', value(inspection.documentsAndKeys, 'ignitionKeys')],
    ['Ключи от дверей / спецоборудования', value(inspection.documentsAndKeys, 'specialEquipmentKeys')],
    ['Инструмент / ЗИП', value(inspection.equipment, 'toolKit')],
    ['Аптечка', value(inspection.equipment, 'firstAidKit')],
    ['Огнетушитель', value(inspection.equipment, 'fireExtinguisher')],
    ['Домкрат', value(inspection.equipment, 'jack')],
    ['Запасное колесо', value(inspection.equipment, 'spareWheel')],
    ['Знак аварийной остановки', value(inspection.equipment, 'warningTriangle')],
    ['Баллонный ключ', value(inspection.equipment, 'wheelWrench')],
  ], 4);
  paragraphBox(doc, 'Личные вещи и примечания', inspection.personalItemsNotes || value(inspection.technicalCondition, 'personalItems'));

  sectionTitle(doc, '4. Состояние узлов и агрегатов');
  tableRows(doc, [
    ['Двигатель запускается', value(inspection.technicalCondition, 'engineStarts')],
    ['ТС передвигается своим ходом', value(inspection.technicalCondition, 'movesOnOwn')],
    ['Наличие аккумуляторов', value(inspection.technicalCondition, 'batteryPresent')],
    ['Отсутствие крупных узлов и агрегатов', value(inspection.technicalCondition, 'majorUnitsMissing')],
    ['Салон чистый, без царапин', value(inspection.technicalCondition, 'interiorClean')],
    ['Разукомплектованность салона', value(inspection.technicalCondition, 'interiorIncomplete')],
    ['Марка, модель колес и год', value(inspection.technicalCondition, 'wheelInfo')],
    ['Наличие всех колес', value(inspection.technicalCondition, 'allWheelsPresent')],
    ['Соответствие комплектности документам', value(inspection.technicalCondition, 'completenessMatches')],
    ['Повреждения фар / фонарей', value(inspection.technicalCondition, 'lightsDamage')],
    ['Повреждения стекол', value(inspection.technicalCondition, 'glassDamage')],
    ['Повреждения зеркал заднего вида', value(inspection.technicalCondition, 'mirrorsDamage')],
    ['Наличие ковров в салоне', value(inspection.technicalCondition, 'floorMatsPresent')],
  ], 4);
  paragraphBox(doc, 'Повреждения и замечания', inspection.damageNotes || '-');

  sectionTitle(doc, '5. Фотофиксация');
  tableRows(doc, [
    ['Спереди', value(inspection.photoChecklist, 'front')],
    ['Спереди слева', value(inspection.photoChecklist, 'frontLeft')],
    ['Спереди справа', value(inspection.photoChecklist, 'frontRight')],
    ['Сбоку слева', value(inspection.photoChecklist, 'leftSide')],
    ['Сбоку справа', value(inspection.photoChecklist, 'rightSide')],
    ['Сзади слева', value(inspection.photoChecklist, 'rearLeft')],
    ['Сзади справа', value(inspection.photoChecklist, 'rearRight')],
    ['Сзади', value(inspection.photoChecklist, 'rear')],
    ['Салон и лобовое стекло', value(inspection.photoChecklist, 'interiorWindshield')],
    ['Все колеса', value(inspection.photoChecklist, 'wheels')],
    ['Приборная панель с пробегом', value(inspection.photoChecklist, 'dashboardOdometer')],
    ['Все дефекты', value(inspection.photoChecklist, 'defects')],
  ], 4);

  sectionTitle(doc, '6. Ответственность и осмотр');
  tableRows(doc, [
    ['Размер ответственности Хранителя', moneyText(inspection.responsibilityAmount)],
    ['Осмотр выполнил', inspection.inspectedByName],
  ]);

  doc.addPage();
  const schemeType = damageSchemeTypeForVehicle(vehicle);
  const damageScheme = drawDamageScheme(doc, schemeType);
  const damageMarks = getDamageMarksForScheme(inspection, schemeType);
  drawDamageMarks(doc, damageMarks, damageScheme.x, damageScheme.y, damageScheme.width, damageScheme.height);
  if (damageMarks.length > 0) {
    paragraphBox(
      doc,
      'Расшифровка отметок на схеме',
      damageMarks.map((mark, index) => `${mark.code}${index + 1}: ${mark.comment || '-'}`).join('; '),
    );
  }

  sectionTitle(doc, '8. Подписи сторон');
  const signatureY = doc.y + 8;
  const leftX = doc.page.margins.left;
  const rightX = doc.page.width / 2 + 18;
  const lineWidth = 210;
  doc.fontSize(8).font('ActRegular');
  doc.text(isIssue ? 'ТС с хранения передал' : 'ТС на хранение передал', leftX, signatureY);
  doc.moveTo(leftX, signatureY + 34).lineTo(leftX + lineWidth, signatureY + 34).stroke();
  doc.text('/подпись, Ф.И.О./', leftX, signatureY + 38, { width: lineWidth, align: 'center' });
  doc.text(isIssue ? 'ТС с хранения принял' : 'ТС на хранение принял', rightX, signatureY);
  doc.moveTo(rightX, signatureY + 34).lineTo(rightX + lineWidth, signatureY + 34).stroke();
  doc.text('/подпись, Ф.И.О./', rightX, signatureY + 38, { width: lineWidth, align: 'center' });

  doc.end();
});
