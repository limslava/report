import { AppDataSource } from '../config/data-source';
import { Contract, ContractIncomeSubtype, ContractType } from '../models/contract.model';
import { ContractSlaRule } from '../models/contract-sla-rule.model';
import { addWorkingDays } from './workday-calendar.service';

const slaRepo = AppDataSource.getRepository(ContractSlaRule);

const DEFAULT_ROLES = ['security', 'lawyer', 'chief_accountant', 'financer', 'secretary'] as const;

type SlaSeedRule = {
  contractType: ContractType;
  incomeSubtype: ContractIncomeSubtype | null;
  roleCode: string;
  slaWorkdays: number;
};

function defaultSlaWorkdays(roleCode: typeof DEFAULT_ROLES[number]): number {
  return roleCode === 'secretary' ? 1 : 2;
}

function defaultRules(): SlaSeedRule[] {
  const expenseRoles = [...DEFAULT_ROLES];
  const incomeStandardRoles = [...DEFAULT_ROLES];
  const incomePsrRoles = [...DEFAULT_ROLES];
  return [
    ...expenseRoles.map((roleCode) => ({
      contractType: ContractType.EXPENSE,
      incomeSubtype: null,
      roleCode,
      slaWorkdays: defaultSlaWorkdays(roleCode),
    })),
    ...incomeStandardRoles.map((roleCode) => ({
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.STANDARD,
      roleCode,
      slaWorkdays: defaultSlaWorkdays(roleCode),
    })),
    ...incomePsrRoles.map((roleCode) => ({
      contractType: ContractType.INCOME,
      incomeSubtype: ContractIncomeSubtype.WITH_PSR,
      roleCode,
      slaWorkdays: defaultSlaWorkdays(roleCode),
    })),
  ];
}

async function findRule(contractType: ContractType, incomeSubtype: ContractIncomeSubtype | null, roleCode: string, isActive?: boolean) {
  const qb = slaRepo
    .createQueryBuilder('r')
    .where('r.contractType = :contractType', { contractType })
    .andWhere('r.roleCode = :roleCode', { roleCode });
  if (incomeSubtype) {
    qb.andWhere('r.incomeSubtype = :incomeSubtype', { incomeSubtype });
  } else {
    qb.andWhere('r.incomeSubtype IS NULL');
  }
  if (typeof isActive === 'boolean') {
    qb.andWhere('r.isActive = :isActive', { isActive });
  }
  return qb.getOne();
}

export async function ensureDefaultSlaRules(): Promise<void> {
  const rules = defaultRules();
  for (const rule of rules) {
    const exists = await findRule(rule.contractType, rule.incomeSubtype, rule.roleCode);
    if (!exists) {
      await slaRepo.save(slaRepo.create({ ...rule, isActive: true }));
    }
  }
}

export async function resolveSlaWorkdays(contract: Contract, roleCode: string): Promise<number> {
  await ensureDefaultSlaRules();
  const rule = await findRule(
    contract.contractType,
    contract.contractType === ContractType.INCOME ? contract.incomeSubtype : null,
    roleCode,
    true
  );
  return Math.max(1, rule?.slaWorkdays ?? 1);
}

export async function calculateDeadline(assignedAt: Date, slaWorkdays: number): Promise<Date> {
  return addWorkingDays(assignedAt, Math.max(1, slaWorkdays));
}

export async function listSlaRules(): Promise<ContractSlaRule[]> {
  await ensureDefaultSlaRules();
  return slaRepo.find({ order: { contractType: 'ASC', incomeSubtype: 'ASC', roleCode: 'ASC' } });
}

export async function upsertSlaRules(
  rules: Array<{
    contractType: ContractType;
    incomeSubtype: ContractIncomeSubtype | null;
    roleCode: string;
    slaWorkdays: number;
    isActive?: boolean;
  }>
): Promise<void> {
  for (const item of rules) {
    const existing = await findRule(item.contractType, item.incomeSubtype, item.roleCode);
    if (existing) {
      existing.slaWorkdays = Math.max(1, item.slaWorkdays);
      existing.isActive = item.isActive ?? true;
      await slaRepo.save(existing);
    } else {
      await slaRepo.save(
        slaRepo.create({
          contractType: item.contractType,
          incomeSubtype: item.incomeSubtype,
          roleCode: item.roleCode,
          slaWorkdays: Math.max(1, item.slaWorkdays),
          isActive: item.isActive ?? true,
        })
      );
    }
  }
}
