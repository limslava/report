import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import PizZip from 'pizzip';
import { AppDataSource } from '../config/data-source';
import { Contract } from '../models/contract.model';
import { ContractTemplateType, ContractTemplateVersion } from '../models/contract-template-version.model';

export const CONTRACT_TEMPLATE_LABELS: Record<ContractTemplateType, string> = {
  [ContractTemplateType.INCOME_STANDARD]: 'Доходный без ПСР',
  [ContractTemplateType.INCOME_WITH_PSR]: 'Доходный с ПСР',
  [ContractTemplateType.EXPENSE]: 'Расходный',
  [ContractTemplateType.ADDENDUM]: 'Доп. соглашение',
};

export const ALLOWED_CONTRACT_TEMPLATE_PLACEHOLDERS = new Set([
  'contractNumber',
  'contractDate',
  'counterpartyName',
  'counterpartyShortName',
  'inn',
  'ogrn',
  'kpp',
  'legalAddress',
  'postalAddress',
  'bankName',
  'bankBik',
  'bankAccount',
  'correspondentAccount',
  'signerPosition',
  'signerName',
  'signerAuthority',
  'phone',
  'email',
]);

const REQUIRED_PLACEHOLDERS_BY_TYPE: Record<ContractTemplateType, string[]> = {
  [ContractTemplateType.INCOME_STANDARD]: [
    'contractNumber',
    'contractDate',
    'counterpartyName',
    'inn',
    'legalAddress',
    'bankName',
    'bankBik',
    'bankAccount',
    'correspondentAccount',
    'signerName',
  ],
  [ContractTemplateType.INCOME_WITH_PSR]: ['contractNumber', 'contractDate', 'counterpartyName', 'inn'],
  [ContractTemplateType.EXPENSE]: ['contractNumber', 'contractDate', 'counterpartyName', 'inn'],
  [ContractTemplateType.ADDENDUM]: ['contractNumber', 'contractDate', 'counterpartyName', 'inn'],
};

const templateRepository = AppDataSource.getRepository(ContractTemplateVersion);

const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const formatRuDate = (value: Date | string | null | undefined): string => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(safeDate);
};

export const contractTemplateUploadRoot = () => (
  process.env.CONTRACT_TEMPLATE_UPLOAD_DIR
    ? path.resolve(process.env.CONTRACT_TEMPLATE_UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads', 'contract-templates')
);

export function decodeTemplateBase64(contentBase64: string): Buffer {
  const raw = String(contentBase64 || '').trim();
  const base64 = raw.includes(',') ? raw.split(',').pop() || '' : raw;
  return Buffer.from(base64, 'base64');
}

export function validateDocxTemplate(params: {
  templateType: ContractTemplateType;
  originalName: string;
  buffer: Buffer;
}): { placeholders: string[] } {
  if (!params.originalName.toLowerCase().endsWith('.docx')) {
    const error: any = new Error('Загрузите файл шаблона в формате .docx');
    error.statusCode = 400;
    throw error;
  }
  if (!params.buffer.length) {
    const error: any = new Error('Файл шаблона пустой');
    error.statusCode = 400;
    throw error;
  }

  let zip: PizZip;
  try {
    zip = new PizZip(params.buffer);
  } catch {
    const error: any = new Error('Некорректный .docx файл');
    error.statusCode = 400;
    throw error;
  }

  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) {
    const error: any = new Error('Некорректный .docx шаблон: отсутствует word/document.xml');
    error.statusCode = 400;
    throw error;
  }

  const placeholders = Array.from(new Set(
    Array.from(documentXml.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)).map((match) => match[1]),
  )).sort();
  const unknown = placeholders.filter((placeholder) => !ALLOWED_CONTRACT_TEMPLATE_PLACEHOLDERS.has(placeholder));
  if (unknown.length) {
    const error: any = new Error(`В шаблоне есть неизвестные плейсхолдеры: ${unknown.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const required = REQUIRED_PLACEHOLDERS_BY_TYPE[params.templateType] ?? [];
  const missing = required.filter((placeholder) => !placeholders.includes(placeholder));
  if (missing.length) {
    const error: any = new Error(`В шаблоне нет обязательных плейсхолдеров: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  return { placeholders };
}

export async function getActiveContractTemplate(templateType: ContractTemplateType): Promise<ContractTemplateVersion | null> {
  try {
    return await templateRepository.findOne({
      where: { templateType, isActive: true },
      order: { version: 'DESC' },
    });
  } catch (error: any) {
    if (error?.name === 'EntityMetadataNotFoundError') {
      return null;
    }
    throw error;
  }
}

export function buildContractTemplateValues(contract: Contract): Record<string, string> {
  return {
    contractNumber: normalize(contract.contractNumber),
    contractDate: formatRuDate(contract.contractDate),
    counterpartyName: normalize(contract.counterpartyName),
    counterpartyShortName: normalize(contract.counterpartyShortName || contract.counterpartyName),
    inn: normalize(contract.counterpartyInn),
    ogrn: normalize(contract.counterpartyOgrn),
    kpp: normalize(contract.counterpartyKpp),
    legalAddress: normalize(contract.counterpartyLegalAddress),
    postalAddress: normalize(contract.counterpartyPostalAddress || contract.counterpartyLegalAddress),
    bankName: normalize(contract.counterpartyBankName),
    bankBik: normalize(contract.counterpartyBankBik),
    bankAccount: normalize(contract.counterpartyBankAccount),
    correspondentAccount: normalize(contract.counterpartyCorrespondentAccount),
    signerPosition: normalize(contract.counterpartySignerPosition),
    signerName: normalize(contract.counterpartySignerName),
    signerAuthority: normalize(contract.counterpartySignerAuthority),
    phone: normalize(contract.counterpartyPhone),
    email: normalize(contract.counterpartyEmail),
  };
}

export function renderDocxTemplate(buffer: Buffer, values: Record<string, string>): Buffer {
  const zip = new PizZip(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Некорректный .docx шаблон: отсутствует word/document.xml');
  }
  const xml = documentFile.asText().replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => (
    String(values[key] ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  ));
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

export async function createContractTemplateVersion(params: {
  templateType: ContractTemplateType;
  originalName: string;
  buffer: Buffer;
  uploadedByUserId?: string | null;
}): Promise<ContractTemplateVersion> {
  const validation = validateDocxTemplate(params);
  const latest = await templateRepository.findOne({
    where: { templateType: params.templateType },
    order: { version: 'DESC' },
  });
  const version = (latest?.version ?? 0) + 1;
  const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');
  const root = contractTemplateUploadRoot();
  await fs.mkdir(root, { recursive: true });
  const storedName = `${params.templateType}_v${version}_${sha256.slice(0, 12)}.docx`;
  const storagePath = path.join(root, storedName);
  await fs.writeFile(storagePath, params.buffer);

  const entity = templateRepository.create({
    templateType: params.templateType,
    version,
    originalName: params.originalName,
    storagePath,
    sizeBytes: params.buffer.length,
    contentSha256: sha256,
    placeholders: validation.placeholders,
    isActive: false,
    uploadedByUserId: params.uploadedByUserId ?? null,
  });
  return templateRepository.save(entity);
}

export async function activateContractTemplateVersion(id: string): Promise<ContractTemplateVersion> {
  const template = await templateRepository.findOne({ where: { id } });
  if (!template) {
    const error: any = new Error('Версия шаблона не найдена');
    error.statusCode = 404;
    throw error;
  }
  await AppDataSource.transaction(async (manager) => {
    await manager.update(ContractTemplateVersion, { templateType: template.templateType, isActive: true }, { isActive: false });
    await manager.update(ContractTemplateVersion, { id: template.id }, { isActive: true });
  });
  return templateRepository.findOneOrFail({ where: { id } });
}

export async function listContractTemplateVersions(): Promise<ContractTemplateVersion[]> {
  return templateRepository.find({
    order: { templateType: 'ASC', version: 'DESC' },
  });
}
