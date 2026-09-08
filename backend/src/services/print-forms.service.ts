import fs from 'fs';
import path from 'path';
import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { DocxBlock, DocxParagraph, buildDocx, p, pRuns } from './docx-builder.service';

/**
 * Печатные формы: шаблоны воспроизводят согласованные образцы из папки
 * «Доверки» (2026-08-24). Тексты полномочий юридические — менять только
 * решением пользователя.
 */

export type PrintOrgSettings = {
  /** строки шапки-бланка (реквизиты организации) */
  headerLines: string[];
  /** юридическое полное имя */
  fullName: string;
  /** короткое имя в кавычках */
  shortName: string;
  generalDirector: string;
  /** родительный падеж для «в лице генерального директора …» */
  generalDirectorGenitive: string;
  /** блок «ДОВЕРИТЕЛЬ» для доверенностей складского стиля */
  principalLines: string[];
  /** вводный абзац доверенности стиля «ПЛ» (без ФИО) */
  plIntro: string;
};

export const DEFAULT_PRINT_ORG: PrintOrgSettings = {
  headerLines: [
    'ООО «Симпл Вэй»',
    'ОГРН: 1222500007047',
    'ИНН: 2543164502',
    'КПП: 254301001',
    'Телефон: 8-999-618-55-65',
    'e-mail: zakazauto@simplewayllc.ru',
    'Сайт: www.simplewayllc.pro',
    'Адрес: юридический / фактический: 690108 г.Владивосток, ул.Артековская 1 – 135 / 690077 г.Владивосток, ул.Вилкова 5а,\u00A03\u00A0этаж',
  ],
  fullName: 'Общество с ограниченной ответственностью «Симпл Вэй»',
  shortName: 'ООО «Симпл Вэй»',
  generalDirector: 'Васильковский Марк Олегович',
  generalDirectorGenitive: 'Васильковского Марка Олеговича',
  principalLines: [
    'ОГРН: 1222500007047, свидетельство: выдано ИМНС (ИФНС) № 12, г. Владивостока, дата выдачи: «01» апреля 2022г.',
    'ИНН: 2543164502, свидетельство: выдано ИМНС (ИФНС) № 12, г. Владивосток, дата выдачи: «01» апреля 2022г.',
    'Юридический адрес (место нахождения): 690108, г. Владивосток, ул. Артековская, д. 1-135.',
    'Почтовый адрес: 690077, г. Владивосток, ул. Вилкова, д. 5а, 3 эт.',
  ],
  plIntro:
    'Общество с ограниченной ответственностью "Симпл Вэй" зарегистрированное 01 апреля 2022 года Межрайонной инспекцией Федеральной налоговой службы № 15 по Приморскому краю в ЕГРЮЛ за ОГРН 1222500007047 ИНН 2543164502, КПП 254301001 местонахождение: 690108, Приморский край, г. Владивосток, ул. Артековская, д. 1-135, в лице генерального директора Васильковского Марка Олеговича, действующего на основании Устава, настоящей доверенностью уполномочивает:',
};

export type PrintCounterparty = {
  label: string;
  /** многострочные реквизиты (нужны шаблону терминала) */
  details?: string;
};

export const DEFAULT_PRINT_COUNTERPARTIES: PrintCounterparty[] = [
  { label: 'ООО ВМП «Первомайский»' },
  { label: 'АО «ДАЛЬКОМХОЛОД»' },
  { label: 'ООО «ПЛ»' },
  {
    label: 'Контейнерный терминал Первая Речка ПАО «ТрансКонтейнер»',
    details:
      'Юридический адрес предприятия:\n690090, Россия, Приморский край, Владивостокский городской округ, г. Владивосток, ул. Набережная, д. 5В, помещ. 252\nБанковские реквизиты предприятия:\nИНН/КПП 2531012569/254001001, ОКПО 35681485, Р/счёт 40702810400100010124 ПАО СКБ Приморья «Примсоцбанк» г. Владивосток БИК 040507803 К/счёт 30101810200000000803',
  },
];

/**
 * Формы выбираются конкретные — контрагент зашит в форму, отдельного выбора
 * склада/терминала нет (решение пользователя 2026-09-08, чтобы исключить
 * бессмысленные комбинации «форма × контрагент»).
 */
export const PRINT_FORM_TEMPLATES = [
  { key: 'poa_vmpp', label: 'Доверенность на сотрудника (ВМПП)', kind: 'docx' },
  { key: 'poa_dkh', label: 'Доверенность на сотрудника (ДКХ)', kind: 'docx' },
  { key: 'poa_pl', label: 'Доверенность на сотрудника (терминал ПЛ)', kind: 'docx' },
  { key: 'poa_tk_vehicle', label: 'Доверенность с ТС (ТрансКонтейнер)', kind: 'docx' },
  { key: 'vmpp_vehicles_request', label: 'Заявка в ИС ВМПП: автотранспорт и водители', kind: 'docx' },
  { key: 'vmpp_drivers_approval', label: 'Согласование водителей ВМПП', kind: 'docx' },
  { key: 'carrier_vehicles', label: 'Форма перевозчику: список ТС (Excel)', kind: 'xlsx' },
] as const;

export type PrintTemplateKey = (typeof PRINT_FORM_TEMPLATES)[number]['key'];

/** Вариант доверенности → базовый шаблон + зашитый контрагент. */
export const POA_VARIANTS: Record<string, { base: 'poa_warehouse' | 'poa_pl' | 'poa_terminal_vehicle'; counterparty: string }> = {
  poa_vmpp: { base: 'poa_warehouse', counterparty: 'ООО ВМП «Первомайский»' },
  poa_dkh: { base: 'poa_warehouse', counterparty: 'АО «ДАЛЬКОМХОЛОД»' },
  poa_pl: { base: 'poa_pl', counterparty: 'ООО «ПЛ»' },
  poa_tk_vehicle: { base: 'poa_terminal_vehicle', counterparty: 'Контейнерный терминал Первая Речка ПАО «ТрансКонтейнер»' },
};

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export const formatDateWords = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `«${String(day).padStart(2, '0')}» ${MONTHS_GENITIVE[(month ?? 1) - 1]} ${year} года`;
};

export const formatDateDots = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};

const cityByLocation: Record<FleetLocation, string> = { vvo: 'г. Владивосток', mow: 'г. Москва' };

/** Строка «паспорт …» из карточки водителя. */
const passportLine = (employee: Employee): string => {
  const parts: string[] = [];
  if (employee.passportNumber) parts.push(`паспорт ${employee.passportNumber}`);
  if (employee.passportIssuedBy) parts.push(`выдан ${employee.passportIssuedBy}`);
  if (employee.passportIssueDate) parts.push(formatDateDots(employee.passportIssueDate));
  return parts.join(', ');
};

const employeeIntroLine = (employee: Employee): string => {
  const parts: string[] = [employee.fullName];
  if (employee.birthDate) parts.push(`${formatDateDots(employee.birthDate)} года рождения`);
  const passport = passportLine(employee);
  if (passport) parts.push(passport);
  if (employee.registrationAddress) parts.push(`зарегистрированный по адресу: ${employee.registrationAddress}`);
  return parts.join(', ');
};

/** Логотип бланка: ищем как остальные ассеты — от cwd и от dist. */
const LOGO_CANDIDATES = [
  path.resolve(process.cwd(), 'assets', 'print-forms', 'simple-way-logo.png'),
  path.resolve(process.cwd(), 'backend', 'assets', 'print-forms', 'simple-way-logo.png'),
  path.resolve(__dirname, '..', '..', 'assets', 'print-forms', 'simple-way-logo.png'),
];

let cachedLogo: Buffer | null | undefined;
const loadLogo = (): Buffer | null => {
  if (cachedLogo !== undefined) return cachedLogo;
  const found = LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  cachedLogo = found ? fs.readFileSync(found) : null;
  return cachedLogo;
};

/** Шапка-бланк как в образцах: логотип слева, реквизиты мелким кеглем справа. */
const headerBlocks = (org: PrintOrgSettings): DocxBlock[] => {
  const requisites: DocxParagraph[] = org.headerLines.map((line, index) =>
    pRuns([{ text: line, bold: index === 0, size: 9 }], { align: 'right', spacingAfter: 0 })
  );
  const logo = loadLogo();
  if (!logo) {
    // без логотипа (ассет не нашёлся) — реквизиты столбцом справа
    return [...requisites, p('', { spacingAfter: 6 })];
  }
  return [
    {
      kind: 'table',
      borders: false,
      // отбивка шапки-бланка линией, как в согласованных образцах
      bottomBorder: true,
      rows: [
        [
          { image: { data: logo, widthCm: 5.8, heightCm: 3.78 }, widthPct: 40, align: 'left' },
          { paragraphs: requisites, widthPct: 60 },
        ],
      ],
    },
    p('', { spacingAfter: 8 }),
  ];
};

const vehicleLabel = (vehicle: FleetVehicle): string => {
  const model = vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '';
  return [vehicle.vehicleKind, model, vehicle.color, vehicle.manufactureYear ? `${vehicle.manufactureYear} г.в.` : '']
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
};

// ─────────────────────────── Шаблоны ───────────────────────────

export type PoaWarehouseParams = {
  number: number;
  issueDate: string;
  validUntil: string;
  counterparty: string;
  withSignature: boolean;
  location: FleetLocation;
};

export function buildPoaWarehouse(org: PrintOrgSettings, employee: Employee, params: PoaWarehouseParams): Buffer {
  const blocks: DocxBlock[] = [
    ...headerBlocks(org),
    p(`ДОВЕРЕННОСТЬ № ${params.number}`, { align: 'center', bold: true, size: 13, spacingAfter: 2 }),
    p(`(${cityByLocation[params.location]}, дата выдачи: ${formatDateWords(params.issueDate)}).`, {
      align: 'center',
      spacingAfter: 10,
    }),
    p('ДОВЕРИТЕЛЬ:', { bold: true, spacingAfter: 2 }),
    p(org.shortName, { bold: true, spacingAfter: 4 }),
    ...org.principalLines.map((line) => p(line, { spacingAfter: 2 })),
    p(`в лице генерального директора ${org.generalDirectorGenitive}, действующего на основании устава.`, {
      spacingAfter: 10,
    }),
    p('ДОВЕРЕННЫЙ:', { bold: true, spacingAfter: 2 }),
    p(employeeIntroLine(employee), { spacingAfter: 10 }),
    p(
      'Настоящей доверенностью Доверенный наделяется полномочиями на совершение от имени и в интересах Доверителя следующих юридически значимых действий:',
      { spacingAfter: 4 }
    ),
    p(`•  Получать со склада ${params.counterparty} товары и товароматериальные ценности, грузы в контейнерах, порожние контейнеры.`, {
      spacingAfter: 10,
    }),
    p(
      `Настоящая доверенность выдана без права передоверия переданных полномочий по настоящей доверенности. Доверенность действительна по ${formatDateDots(params.validUntil)}г.`,
      { spacingAfter: 14 }
    ),
  ];
  if (params.withSignature) {
    blocks.push(
      pRuns(
        [
          { text: 'Подпись Доверенного: _______________________/ ' },
          { text: employee.fullName, bold: true },
          { text: ' /' },
        ],
        { spacingAfter: 12 }
      ),
      p('Подпись Доверителя:', { spacingAfter: 8 })
    );
  }
  blocks.push(
    pRuns(
      [
        { text: `Генеральный директор ${org.generalDirector} ` },
        { text: '/___________________/' },
      ],
      { spacingAfter: 2 }
    ),
    p('                                                                                                  МП', { spacingAfter: 0 })
  );
  return buildDocx(blocks);
}

export type PoaPlParams = {
  number: number | null;
  issueDate: string;
  validUntil: string;
  counterparty: string;
  withSignature: boolean;
  location: FleetLocation;
};

export function buildPoaPl(org: PrintOrgSettings, employee: Employee, params: PoaPlParams): Buffer {
  const blocks: DocxBlock[] = [
    ...headerBlocks(org),
    p(`от ${formatDateDots(params.issueDate)}   № ${params.number ?? 'б/н'}`, { spacingAfter: 8 }),
    p('ДОВЕРЕННОСТЬ', { align: 'center', bold: true, size: 14, spacingAfter: 10 }),
    p(`${org.plIntro} водителя ${org.fullName.replace('Общество с ограниченной ответственностью', 'Общества с ограниченной ответственностью')}`, {
      firstLineIndentCm: 1,
      spacingAfter: 8,
    }),
    p(employee.fullName, { bold: true, align: 'center', spacingAfter: 4 }),
    p(
      [
        passportLine(employee),
        employee.birthDate ? formatDateDots(employee.birthDate) : '',
        employee.birthPlace,
        employee.registrationAddress,
      ]
        .filter(Boolean)
        .join(', '),
      { spacingAfter: 10 }
    ),
    p(
      `•  Получать со склада терминала ${params.counterparty} товары и товароматериальные ценности, в том числе в контейнерах без проведения внутритарной проверки, а также порожние контейнеры;`,
      { spacingAfter: 4 }
    ),
    p(
      `•  Расписываться во всех необходимых случаях на всех документах, необходимых для выполнения поручений по настоящей доверенности, в том числе на заявках на вывоз/завоз грузов (контейнеров) с/на территории терминала ${params.counterparty}, приемосдаточных ордерах, актах и иных документах.`,
      { spacingAfter: 10 }
    ),
    p(
      `Настоящая доверенность выдана по ${formatDateDots(params.validUntil)} г. (включительно) с запретом передоверия полномочий по настоящей доверенности другим лицам.`,
      { firstLineIndentCm: 1, spacingAfter: 12 }
    ),
  ];
  if (params.withSignature) {
    blocks.push(pRuns([{ text: `Подпись ${employee.fullName}. _________________ удостоверяю.` }], { spacingAfter: 14 }));
  }
  blocks.push(
    pRuns(
      [
        { text: `Генеральный директор ${org.shortName}` },
        { text: '                                    ' },
        { text: org.generalDirector, bold: true },
      ],
      { spacingAfter: 0 }
    )
  );
  return buildDocx(blocks);
}

export type PoaTerminalVehicleParams = {
  number: number;
  issueDate: string;
  validFrom: string;
  validUntil: string;
  counterparty: string;
  counterpartyDetails: string;
  location: FleetLocation;
};

export function buildPoaTerminalVehicle(
  org: PrintOrgSettings,
  employee: Employee,
  vehicle: FleetVehicle,
  params: PoaTerminalVehicleParams
): Buffer {
  const detailBlocks: DocxBlock[] = params.counterpartyDetails
    ? params.counterpartyDetails
        .split('\n')
        .map((line) =>
          p(line.trim(), {
            align: line.trim().endsWith(':') ? 'center' : 'left',
            spacingAfter: 2,
          })
        )
    : [];
  const blocks: DocxBlock[] = [
    ...headerBlocks(org),
    p(`От ${formatDateDots(params.issueDate)}г.`, { spacingAfter: 8 }),
    p(`ДОВЕРЕННОСТЬ № ${params.number}`, { align: 'center', bold: true, size: 13, spacingAfter: 10 }),
    p(
      `Настоящей доверенностью ${org.shortName} (далее-Доверитель), в лице генерального директора ${org.generalDirectorGenitive}, действующего на основании Устава, доверяет ${employee.position || 'водителю'} ${employee.fullName}, быть представителем и совершать от имени и в интересах Доверителя следующие действия и операции на ${params.counterparty}:`,
      { firstLineIndentCm: 1, spacingAfter: 6 }
    ),
    p('1. Подписывать приемо-сдаточные акты (форма КЭУ-16)', { spacingAfter: 2 }),
    p(
      `2. Осуществлять завоз-вывоз контейнеров транспортным средством (транспортными средствами), принадлежащим Доверителю с государственным регистрационным знаком: ${vehicle.plate}`,
      { spacingAfter: 10 }
    ),
    ...detailBlocks,
    p('Паспортные данные представителя:', { align: 'center', spacingAfter: 4 }),
    p(employeeIntroLine(employee), { spacingAfter: 10 }),
    p(
      `При увольнении ${employee.fullName} предприятие гарантирует письменное уведомление ${params.counterparty}.`,
      { firstLineIndentCm: 1, spacingAfter: 8 }
    ),
    p(
      `Настоящая доверенность действительна с ${formatDateDots(params.validFrom)}г. по ${formatDateDots(params.validUntil)}г.`,
      { spacingAfter: 14 }
    ),
    pRuns(
      [
        { text: `Генеральный директор ${org.shortName}   ` },
        { text: '/___________________/  ' },
        { text: org.generalDirector, bold: true },
      ],
      { spacingAfter: 0 }
    ),
  ];
  return buildDocx(blocks);
}

export type VmppPair = { employee: Employee; vehicle: FleetVehicle | null };

export type VmppParams = {
  contractLine: string;
  carrierName: string;
  location: FleetLocation;
};

const passportFullCell = (employee: Employee): string =>
  [
    employee.passportNumber,
    employee.passportIssuedBy,
    employee.passportIssueDate ? formatDateDots(employee.passportIssueDate) : '',
    employee.birthPlace,
    employee.registrationAddress ? `прописан: ${employee.registrationAddress}` : '',
  ]
    .filter(Boolean)
    .join(' ');

export function buildVmppVehiclesRequest(org: PrintOrgSettings, pairs: VmppPair[], params: VmppParams): Buffer {
  const rows = [
    [
      { runs: [{ text: 'п/п' }], widthPct: 5, bold: true, align: 'center' as const },
      { runs: [{ text: 'Транспортное средство: вид, марка, модель, цвет, год выпуска' }], widthPct: 25, bold: true, align: 'center' as const },
      { runs: [{ text: 'Государственный регистрационный знак (номер и регион)' }], widthPct: 15, bold: true, align: 'center' as const },
      { runs: [{ text: 'Водитель: Фамилия Имя Отчество - полностью' }], widthPct: 20, bold: true, align: 'center' as const },
      { runs: [{ text: 'Серия № паспорта, дата и место выдачи документа лица, под управлением которого будет находиться транспортное средство' }], widthPct: 35, bold: true, align: 'center' as const },
    ],
    ...pairs.map((pair, index) => [
      { runs: [{ text: String(index + 1) }], align: 'center' as const },
      { runs: [{ text: pair.vehicle ? vehicleLabel(pair.vehicle) : '' }] },
      { runs: [{ text: pair.vehicle?.plate ?? '' }], align: 'center' as const },
      { runs: [{ text: pair.employee.fullName }] },
      { runs: [{ text: passportFullCell(pair.employee) }] },
    ]),
  ];
  const blocks: DocxBlock[] = [
    ...headerBlocks(org),
    p('Заявка на внесение в ИС ВМПП автотранспорта/водителей', { align: 'center', bold: true, size: 13, spacingAfter: 8 }),
    p(
      `Прошу Вас в рамках договора на аккредитацию автотранспорта ${params.contractLine}, внести список автотранспорта со следующими данными водителей в систему ООО ВМП «Первомайский» под автоперевозчиком: ${params.carrierName}`,
      { firstLineIndentCm: 1, spacingAfter: 8 }
    ),
    { kind: 'table', rows },
    p('', { spacingAfter: 10 }),
    pRuns(
      [{ text: `Генеральный директор ${org.shortName}   /___________________/  ` }, { text: org.generalDirector, bold: true }],
      { spacingAfter: 0 }
    ),
  ];
  return buildDocx(blocks);
}

export function buildVmppDriversApproval(org: PrintOrgSettings, employees: Employee[], params: VmppParams): Buffer {
  const rows = [
    [
      { runs: [{ text: 'п/п' }], widthPct: 6, bold: true, align: 'center' as const },
      { runs: [{ text: 'Водитель: Фамилия Имя Отчество - полностью' }], widthPct: 34, bold: true, align: 'center' as const },
      { runs: [{ text: 'Серия № паспорта, дата и место выдачи документа лица, под управлением которого будет находиться транспортное средство' }], widthPct: 60, bold: true, align: 'center' as const },
    ],
    ...employees.map((employee, index) => [
      { runs: [{ text: String(index + 1) }], align: 'center' as const },
      { runs: [{ text: employee.fullName }] },
      { runs: [{ text: passportFullCell(employee) }] },
    ]),
  ];
  const blocks: DocxBlock[] = [
    ...headerBlocks(org),
    p('Заявка на внесение в ИС ВМПП водителей', { align: 'center', bold: true, size: 13, spacingAfter: 8 }),
    p(
      `Прошу Вас в рамках договора на аккредитацию автотранспорта ${params.contractLine}, внести список автотранспорта со следующими данными водителей в систему ООО ВМП «Первомайский» под автоперевозчиком: ${params.carrierName}`,
      { firstLineIndentCm: 1, spacingAfter: 8 }
    ),
    { kind: 'table', rows },
    p('', { spacingAfter: 10 }),
    pRuns(
      [{ text: `Генеральный директор ${org.shortName}   /___________________/  ` }, { text: org.generalDirector, bold: true }],
      { spacingAfter: 0 }
    ),
  ];
  return buildDocx(blocks);
}
