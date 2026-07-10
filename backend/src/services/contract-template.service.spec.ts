import PizZip from 'pizzip';
import { ContractTemplateType } from '../models/contract-template-version.model';
import { renderDocxTemplate, validateDocxTemplate } from './contract-template.service';

const buildDocx = (documentText: string) => {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" />');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${documentText}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
};

const requiredIncomeStandardPlaceholders = [
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
];

describe('contract template service', () => {
  it('rejects templates with missing required placeholders', () => {
    const buffer = buildDocx('{{contractNumber}} {{counterpartyName}}');

    expect(() => validateDocxTemplate({
      templateType: ContractTemplateType.INCOME_STANDARD,
      originalName: 'template.docx',
      buffer,
    })).toThrow('В шаблоне нет обязательных плейсхолдеров');
  });

  it('rejects unknown placeholders', () => {
    const buffer = buildDocx(`${requiredIncomeStandardPlaceholders.map((item) => `{{${item}}}`).join(' ')} {{unknownField}}`);

    expect(() => validateDocxTemplate({
      templateType: ContractTemplateType.INCOME_STANDARD,
      originalName: 'template.docx',
      buffer,
    })).toThrow('В шаблоне есть неизвестные плейсхолдеры');
  });

  it('renders known placeholders into document xml', () => {
    const buffer = buildDocx('{{contractNumber}} {{counterpartyName}}');
    const rendered = renderDocxTemplate(buffer, {
      contractNumber: 'SW-2026-0001',
      counterpartyName: 'ООО Тест',
    });
    const xml = new PizZip(rendered).file('word/document.xml')?.asText() ?? '';

    expect(xml).toContain('SW-2026-0001');
    expect(xml).toContain('ООО Тест');
    expect(xml).not.toContain('{{contractNumber}}');
  });
});
