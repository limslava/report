import { canViewContractAttachments, canViewOwnContractFile } from './contract-approval-access.service';
import { Contract } from '../models/contract.model';

const contract = (initiatorId: string) => ({ initiatorId } as Contract);

describe('Доступ к файлам договора (решение 2026-08-17)', () => {
  test('инициатор видит файлы самого договора своего БП', () => {
    expect(canViewOwnContractFile(contract('u1'), 'contract', 'u1')).toBe(true);
  });

  test('инициатору не видны файлы шагов согласования', () => {
    expect(canViewOwnContractFile(contract('u1'), 'approval_step', 'u1')).toBe(false);
  });

  test('чужой договор инициатору не доступен', () => {
    expect(canViewOwnContractFile(contract('u1'), 'contract', 'u2')).toBe(false);
    expect(canViewOwnContractFile(contract('u1'), 'contract', undefined)).toBe(false);
  });

  test('ролевой список файлов листа согласования не изменился', () => {
    for (const role of ['admin', 'general_director', 'security', 'financer', 'chief_accountant', 'lawyer']) {
      expect(canViewContractAttachments(role)).toBe(true);
    }
    for (const role of ['secretary', 'manager_sales', 'director', undefined]) {
      expect(canViewContractAttachments(role)).toBe(false);
    }
  });
});
