import fs from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';
import { Contract, ContractIncomeSubtype, ContractType } from '../models/contract.model';
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

function isIncomeStandardContract(contract: Contract): boolean {
  return contract.contractType === ContractType.INCOME
    && contract.incomeSubtype !== ContractIncomeSubtype.WITH_PSR;
}

export function shouldGenerateIncomeStandardContract(contract: Contract): boolean {
  return isIncomeStandardContract(contract);
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
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `${paragraphOpen}${paragraphProperties}<w:r><w:t${preserve}>${escapeXml(text)}</w:t></w:r></w:p>`;
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

function customerSignerLine(contract: Contract): string {
  const position = normalizeText(contract.counterpartySignerPosition);
  const name = normalizeText(contract.counterpartySignerName);
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
  const signerName = normalizeText(contract.counterpartySignerName);
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
      return paragraphXml;
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
        return paragraphWithText(paragraphXml, `_______________ / ${signatureName(contract.counterpartySignerName)}`);
      }
      if (text.startsWith('Приложение №1')) {
        inCustomerRequisites = false;
      }
    }

    if (text === 'Клиент ООО «_________________»') {
      return paragraphWithText(paragraphXml, `Клиент ${customerName(contract)}`);
    }
    if (text.startsWith('ООО  ________')) {
      return paragraphWithText(paragraphXml, buildAttorneyIntro(contract));
    }
    if (text === 'ООО _____________________________             /___________________/') {
      return paragraphWithText(paragraphXml, `${customerName(contract)}             /${signatureName(contract.counterpartySignerName)}/`);
    }
    if (text.includes('___________________ /_____________/') && text.includes('_____________________/_______________ /')) {
      appendixSignaturesPatched += 1;
      return paragraphWithText(paragraphXml, `Экспедитор ООО «Симпл Вэй»                                       Заказчик ${customerName(contract)}
___________________ /_____________/                           _____________________/${signatureName(contract.counterpartySignerName)}/`);
    }

    return paragraphXml;
  });
}

export async function generateIncomeStandardContractDocument(contract: Contract): Promise<GeneratedContractDocument | null> {
  if (!shouldGenerateIncomeStandardContract(contract)) return null;
  const activeTemplate = await getActiveContractTemplate(ContractTemplateType.INCOME_STANDARD);
  if (activeTemplate) {
    const templateBuffer = await fs.readFile(activeTemplate.storagePath);
    return {
      name: generatedFileName(contract),
      mimeType: DOCX_MIME_TYPE,
      buffer: renderDocxTemplate(templateBuffer, buildContractTemplateValues(contract)),
      templateVersionId: activeTemplate.id,
    };
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
