import fs from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';
import { Contract, ContractDocumentKind, ContractIncomeKind, ContractIncomeSubtype, ContractType } from '../models/contract.model';
import { ContractTemplateType } from '../models/contract-template-version.model';
import {
  buildContractTemplateValues,
  getActiveContractTemplate,
  renderDocxTemplate,
} from './contract-template.service';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEMPLATE_FILE_NAME = 'income-standard-simpleway-2026.docx';
const GENERATED_FILE_PREFIX = 'Сформированный_доходный_договор';

type GeneratedContractDocument = {
  name: string;
  mimeType: string;
  buffer: Buffer;
  templateVersionId?: string | null;
};

function isGeneratedIncomeContract(contract: Contract): boolean {
  return contract.contractType === ContractType.INCOME
    && contract.documentKind !== ContractDocumentKind.ADDENDUM;
}

export function shouldGenerateIncomeStandardContract(contract: Contract): boolean {
  return isGeneratedIncomeContract(contract);
}

export function isGeneratedIncomeStandardFileName(fileName: string): boolean {
  return fileName.startsWith(`${GENERATED_FILE_PREFIX}_`) && fileName.toLowerCase().endsWith('.docx');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeFilename(value: string): string {
  return normalizeText(value).replace(/[^\w.\-()\u0400-\u04FF ]/g, '_').slice(0, 120) || 'contract';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function textFromParagraph(paragraphXml: string): string {
  const chunks: string[] = [];
  const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(paragraphXml)) !== null) {
    chunks.push(unescapeXml(match[1]));
  }
  return chunks.join('');
}

function paragraphWithText(originalParagraphXml: string, text: string): string {
  const paragraphOpen = originalParagraphXml.match(/^<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
  const paragraphProperties = originalParagraphXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const runProperties = nonBoldRunProperties(originalParagraphXml);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `${paragraphOpen}${paragraphProperties}<w:r>${runProperties}<w:t${preserve}>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function paragraphWithLines(originalParagraphXml: string, lines: string[]): string {
  const paragraphOpen = originalParagraphXml.match(/^<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
  const paragraphProperties = originalParagraphXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const runProperties = nonBoldRunProperties(originalParagraphXml);
  const runs = lines.map((line, index) => {
    const breakXml = index === 0 ? '' : '<w:br/>';
    const preserve = /^\s|\s$/.test(line) ? ' xml:space="preserve"' : '';
    return `<w:r>${runProperties}${breakXml}<w:t${preserve}>${escapeXml(line)}</w:t></w:r>`;
  }).join('');
  return `${paragraphOpen}${paragraphProperties}${runs}</w:p>`;
}

function nonBoldRunProperties(paragraphXml: string): string {
  const runProperties = paragraphXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0];
  if (!runProperties) return '<w:rPr><w:b w:val="0"/><w:bCs w:val="0"/></w:rPr>';
  const withoutBold = runProperties
    .replace(/<w:b(?:\s[^>]*)?\/>/g, '')
    .replace(/<w:b>[\s\S]*?<\/w:b>/g, '')
    .replace(/<w:bCs(?:\s[^>]*)?\/>/g, '')
    .replace(/<w:bCs>[\s\S]*?<\/w:bCs>/g, '');
  return withoutBold.replace('</w:rPr>', '<w:b w:val="0"/><w:bCs w:val="0"/></w:rPr>');
}

function formatRuDate(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  return `«${String(safeDate.getDate()).padStart(2, '0')}» ${months[safeDate.getMonth()]} ${safeDate.getFullYear()} г.`;
}

function signatureName(fullName: string | null): string {
  const parts = normalizeText(fullName).split(' ').filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
  }
  return normalizeText(fullName);
}

function customerName(contract: Contract): string {
  return normalizeText(contract.counterpartyShortName || contract.counterpartyName);
}

function customerNameFull(contract: Contract): string {
  return normalizeText(contract.counterpartyName);
}

function signerPositionForSignature(contract: Contract): string {
  const position = normalizeText(contract.counterpartySignerPosition);
  const normalized = position.toLowerCase();
  if (normalized === 'генерального директора') return 'Генеральный директор';
  if (normalized === 'директора') return 'Директор';
  if (normalized === 'индивидуального предпринимателя') return 'Индивидуальный предприниматель';
  return position;
}

function customerSignatureBlock(contract: Contract): string[] {
  const position = signerPositionForSignature(contract);
  const organization = customerName(contract);
  return [
    position,
    organization,
    '',
    `_______________ / ${signatureName(contract.counterpartySignerName)}`,
    'м.п.',
  ].filter((line, index) => index === 2 || Boolean(line));
}

function customerSignerLine(contract: Contract): string {
  const position = normalizeText(contract.counterpartySignerPosition);
  const name = normalizeText(contract.counterpartySignerNameGenitive || contract.counterpartySignerName);
  const authority = normalizeText(contract.counterpartySignerAuthority);
  if (!position && !name && !authority) return '';
  return `в лице ${position} ${name}, действующего на основании ${authority}`;
}

function buildPreamble(contract: Contract): string {
  const customer = customerNameFull(contract);
  const signerLine = customerSignerLine(contract);
  return `Общество с ограниченной ответственностью «СИМПЛ ВЭЙ», именуемое в дальнейшем «Экспедитор», в лице Генерального директора Васильковского Марка Олеговича, действующего на основании Устава, с одной стороны, и ${customer} именуемое в дальнейшем «Заказчик»${signerLine ? `, ${signerLine}` : ''} с другой стороны, совместно именуемые «Стороны», заключили настоящий договор на оказание транспортно-экспедиционных услуг (далее по тексту - «Договор») о нижеследующем:`;
}

function buildAttorneyIntro(contract: Contract): string {
  const customer = customerName(contract);
  const inn = normalizeText(contract.counterpartyInn);
  const ogrn = normalizeText(contract.counterpartyOgrn);
  const address = normalizeText(contract.counterpartyLegalAddress);
  const signerPosition = normalizeText(contract.counterpartySignerPosition);
  const signerName = normalizeText(contract.counterpartySignerNameGenitive || contract.counterpartySignerName);
  const authority = normalizeText(contract.counterpartySignerAuthority);
  return `${customer} (ИНН ${inn}${ogrn ? `/ ОГРН ${ogrn}` : ''}${address ? `/ адрес места нахождения: ${address}` : ''}), являющееся получателем груза, в лице ${signerPosition} ${signerName}, действующего на основании ${authority}, именуемое далее Доверитель, настоящим уполномочивает ООО «СИМПЛ ВЭЙ» (ОГРН 1222500007047, ИНН 2543164502   КПП 254301001, юридический адрес: 690012, Приморский край, г. Владивосток, ул Артековская, дом 1, квартира 135, в лице Генерального директора Васильковского Марка Олеговича, действующего на основании Устава, на следующие действия:`;
}

function generatedFileName(contract: Contract): string {
  return `${GENERATED_FILE_PREFIX}_${sanitizeFilename(contract.contractNumber)}_${sanitizeFilename(customerName(contract))}.docx`;
}

async function readTemplate(): Promise<Buffer> {
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'contract-templates', TEMPLATE_FILE_NAME),
    path.resolve(process.cwd(), 'backend', 'assets', 'contract-templates', TEMPLATE_FILE_NAME),
    path.resolve(__dirname, '..', '..', 'assets', 'contract-templates', TEMPLATE_FILE_NAME),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Шаблон доходного договора не найден: ${TEMPLATE_FILE_NAME}`);
}

function patchDocumentXml(xml: string, contract: Contract): string {
  let inCustomerRequisites = false;
  let customerSignaturePatched = false;
  let appendixSignaturesPatched = 0;

  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const text = textFromParagraph(paragraphXml).trim();
    if (!text) return paragraphXml;

    if (text.startsWith('ДОГОВОР №')) {
      return paragraphWithText(paragraphXml, `ДОГОВОР № ${normalizeText(contract.contractNumber)}`);
    }
    if (text.startsWith('г. Владивосток')) {
      return paragraphWithText(paragraphXml, `г. Владивосток                                                                                                                             ${formatRuDate(contract.contractDate)}`);
    }
    if (text.startsWith('Общество с ограниченной ответственностью «СИМПЛ ВЭЙ»')) {
      return paragraphWithText(paragraphXml, buildPreamble(contract));
    }
    if (text === 'Заказчик:') {
      inCustomerRequisites = true;
      return paragraphWithLines(paragraphXml, ['Заказчик:', customerName(contract)]);
    }

    if (inCustomerRequisites) {
      if (text === 'Юридический адрес:') {
        return paragraphWithText(paragraphXml, `Юридический адрес: ${normalizeText(contract.counterpartyLegalAddress)}`);
      }
      if (text === 'Почтовый адрес:') {
        return paragraphWithText(paragraphXml, `Почтовый адрес: ${normalizeText(contract.counterpartyPostalAddress || contract.counterpartyLegalAddress)}`);
      }
      if (text.replace(/\s+/g, ' ') === 'ИНН КПП') {
        return paragraphWithText(paragraphXml, `ИНН ${normalizeText(contract.counterpartyInn)}${contract.counterpartyKpp ? `   КПП ${normalizeText(contract.counterpartyKpp)}` : ''}`);
      }
      if (text === 'ОГРН') {
        return paragraphWithText(paragraphXml, `ОГРН ${normalizeText(contract.counterpartyOgrn)}`);
      }
      if (text === 'р/с') {
        return paragraphWithText(paragraphXml, `р/с ${normalizeText(contract.counterpartyBankAccount)}`);
      }
      if (text === 'в (каком банке)') {
        return paragraphWithText(paragraphXml, normalizeText(contract.counterpartyBankName));
      }
      if (text === 'к/с') {
        return paragraphWithText(paragraphXml, `к/с ${normalizeText(contract.counterpartyCorrespondentAccount)}`);
      }
      if (text === 'БИК') {
        return paragraphWithText(paragraphXml, `БИК ${normalizeText(contract.counterpartyBankBik)}`);
      }
      if (text === 'Телефон:') {
        return paragraphWithText(paragraphXml, `Телефон: ${normalizeText(contract.counterpartyPhone)}`);
      }
      if (text === 'e-mail:') {
        return paragraphWithText(paragraphXml, `e-mail: ${normalizeText(contract.counterpartyEmail)}`);
      }
      if (!customerSignaturePatched && text === '_______________ /') {
        customerSignaturePatched = true;
        return paragraphWithLines(paragraphXml, customerSignatureBlock(contract));
      }
      if (text.startsWith('Приложение №1')) {
        inCustomerRequisites = false;
      }
    }

    if (text.includes('Экспедитор ООО «Симпл Вэй»') && text.includes('Заказчик ООО')) {
      return paragraphWithText(paragraphXml, `Экспедитор ООО «Симпл Вэй»                                       Заказчик ${customerName(contract)}`);
    }
    if (text.includes('Экспедитор') && text.includes('Заказчик') && text.includes('_____')) {
      return paragraphWithText(paragraphXml, `Экспедитор _____          Заказчик ${customerName(contract)} _____`);
    }
    if (text === 'Клиент ООО «_________________»') {
      return paragraphWithText(paragraphXml, `Клиент ${customerName(contract)}`);
    }
    if (text.startsWith('ООО  ________')) {
      return paragraphWithText(paragraphXml, buildAttorneyIntro(contract));
    }
    if (text === 'ООО _____________________________             /___________________/') {
      return paragraphWithLines(paragraphXml, [
        signerPositionForSignature(contract),
        `${customerName(contract)}             /${signatureName(contract.counterpartySignerName)}/`,
        'м.п.',
      ]);
    }
    if (text.includes('___________________ /_____________/') && text.includes('_____________________/_______________ /')) {
      appendixSignaturesPatched += 1;
      return paragraphWithText(paragraphXml, `___________________ /_____________/                           _____________________/${signatureName(contract.counterpartySignerName)}/`);
    }
    if (text.includes('___________________ /_____________/') && text.includes('___________________/_______________')) {
      appendixSignaturesPatched += 1;
      return paragraphWithText(paragraphXml, `___________________ /_____________/                           _____________________/${signatureName(contract.counterpartySignerName)}/`);
    }

    return paragraphXml;
  });
}

/**
 * Подбирает активную проформу СТРОГО в рамках выбранного вида договора.
 * Кросс-подстановки между ТЭУ и Агентским нет: агентский договор берёт только
 * агентскую проформу, ТЭУ — только ТЭУ. Внутри вида допускается откат
 * «с ПСР → без ПСР», т.к. это одна и та же проформа.
 */
export async function resolveActiveIncomeTemplate(contract: Contract) {
  const isAgency = contract.incomeKind === ContractIncomeKind.AGENCY;
  const withPsr = contract.incomeSubtype === ContractIncomeSubtype.WITH_PSR;
  if (isAgency) {
    return (await getActiveContractTemplate(
      withPsr ? ContractTemplateType.INCOME_AGENCY_WITH_PSR : ContractTemplateType.INCOME_AGENCY_STANDARD,
    )) ?? (await getActiveContractTemplate(ContractTemplateType.INCOME_AGENCY_STANDARD));
  }
  return (await getActiveContractTemplate(
    withPsr ? ContractTemplateType.INCOME_WITH_PSR : ContractTemplateType.INCOME_STANDARD,
  )) ?? (await getActiveContractTemplate(ContractTemplateType.INCOME_STANDARD));
}

/**
 * Есть ли чем заполнить доходный договор выбранного вида.
 * ТЭУ всегда имеет встроенную (бандловую) проформу, поэтому доступен всегда.
 * Агентский требует загруженной и активированной проформы — встроенной нет,
 * и подставлять вместо неё ТЭУ запрещено.
 */
export async function hasIncomeContractTemplate(contract: Contract): Promise<boolean> {
  if (!shouldGenerateIncomeStandardContract(contract)) return true;
  const isAgency = contract.incomeKind === ContractIncomeKind.AGENCY;
  if (!isAgency) return true;
  return Boolean(await resolveActiveIncomeTemplate(contract));
}

export async function generateIncomeStandardContractDocument(contract: Contract): Promise<GeneratedContractDocument | null> {
  if (!shouldGenerateIncomeStandardContract(contract)) return null;
  const isAgency = contract.incomeKind === ContractIncomeKind.AGENCY;
  const activeTemplate = await resolveActiveIncomeTemplate(contract);
  if (activeTemplate) {
    const templateBuffer = await fs.readFile(activeTemplate.storagePath);
    return {
      name: generatedFileName(contract),
      mimeType: DOCX_MIME_TYPE,
      buffer: renderDocxTemplate(templateBuffer, buildContractTemplateValues(contract)),
      templateVersionId: activeTemplate.id,
    };
  }

  // Для агентского договора встроенной проформы нет, а подставлять ТЭУ нельзя.
  // Если активная агентская проформа не загружена — документ не формируем.
  if (isAgency) {
    return null;
  }

  const templateBuffer = await readTemplate();
  const zip = new PizZip(templateBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Некорректный шаблон доходного договора: отсутствует word/document.xml');
  }
  const xml = documentFile.asText();
  zip.file('word/document.xml', patchDocumentXml(xml, contract));
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  return {
    name: generatedFileName(contract),
    mimeType: DOCX_MIME_TYPE,
    buffer,
    templateVersionId: null,
  };
}
