import PizZip from 'pizzip';
import { Contract, ContractIncomeSubtype, ContractType } from '../models/contract.model';
import { generateIncomeStandardContractDocument } from './income-contract-document.service';

function readDocumentText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml
    .replace(/<w:br\s*\/>/g, ' ')
    .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('income contract document generation', () => {
  it('fills the standard income contract template with counterparty details', async () => {
    const contract = Object.assign(new Contract(), {
      contractNumber: 'SW-2026-0007',
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.STANDARD,
      counterpartyName: 'Общество с ограниченной ответственностью "Тест"',
      counterpartyShortName: 'ООО "Тест"',
      counterpartyInn: '7700000000',
      counterpartyOgrn: '1234567890123',
      counterpartyKpp: '770001001',
      counterpartyLegalAddress: '690000, г. Владивосток, ул. Тестовая, д. 1',
      counterpartyPostalAddress: '690000, г. Владивосток, а/я 1',
      counterpartyPhone: '+7 423 000-00-00',
      counterpartyEmail: 'test@example.com',
      counterpartySignerPosition: 'Генерального директора',
      counterpartySignerName: 'Иванов Иван Иванович',
      counterpartySignerNameGenitive: 'Иванова Ивана Ивановича',
      counterpartySignerAuthority: 'Устава',
      counterpartyBankName: 'АО Тест Банк',
      counterpartyBankBik: '040507000',
      counterpartyBankAccount: '40702810000000000001',
      counterpartyCorrespondentAccount: '30101810000000000001',
      contractDate: new Date('2026-07-03'),
    });

    const generated = await generateIncomeStandardContractDocument(contract);

    expect(generated).not.toBeNull();
    const text = readDocumentText(generated!.buffer);
    expect(text).toContain('ДОГОВОР № SW-2026-0007');
    expect(text).toContain('«03» июля 2026 г.');
    expect(text).toContain('Общество с ограниченной ответственностью "Тест" именуемое в дальнейшем «Заказчик»');
    expect(text).toContain('Юридический адрес: 690000, г. Владивосток, ул. Тестовая, д. 1');
    expect(text).toContain('ИНН 7700000000 КПП 770001001');
    expect(text).toContain('р/с 40702810000000000001');
    expect(text).toContain('АО Тест Банк');
    expect(text).toContain('БИК 040507000');
    expect(text).toContain('Заказчик: ООО "Тест"');
    expect(text).toContain('Генеральный директор ООО "Тест" _______________ / Иванов И.И. м.п.');
    expect(text).toContain('Экспедитор ООО «Симпл Вэй» Заказчик ООО "Тест"');
    expect(text).toContain('___________________ /_____________/ _____________________/Иванов И.И./');
  });

  it('generates a base income contract for contracts with PSR as well', async () => {
    const contract = Object.assign(new Contract(), {
      contractNumber: 'SW-2026-0011',
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.WITH_PSR,
      counterpartyName: 'ООО "ПСР Тест"',
      counterpartyShortName: 'ООО "ПСР Тест"',
      counterpartyInn: '7700000011',
      counterpartyOgrn: '1234567890111',
      counterpartyKpp: '770001011',
      counterpartyLegalAddress: '690000, г. Владивосток, ул. ПСР, д. 1',
      counterpartyPostalAddress: '690000, г. Владивосток, ул. ПСР, д. 1',
      counterpartyPhone: '+7 423 000-00-11',
      counterpartyEmail: 'psr@example.com',
      counterpartySignerPosition: 'Генерального директора',
      counterpartySignerName: 'Петров Петр Петрович',
      counterpartySignerNameGenitive: 'Петрова Петра Петровича',
      counterpartySignerAuthority: 'Устава',
      counterpartyBankName: 'АО ПСР Банк',
      counterpartyBankBik: '040507011',
      counterpartyBankAccount: '40702810000000000011',
      counterpartyCorrespondentAccount: '30101810000000000011',
      contractDate: new Date('2026-07-11'),
    });

    const generated = await generateIncomeStandardContractDocument(contract);

    expect(generated).not.toBeNull();
    const text = readDocumentText(generated!.buffer);
    expect(text).toContain('ДОГОВОР № SW-2026-0011');
    expect(text).toContain('ООО "ПСР Тест"');
  });
});
