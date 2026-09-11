import {
  approvalRoleForUser,
  contractApprovalStepRoleLabel,
  userMatchesApprovalStep,
} from './contract-approval';

const chiefStep = { roleCode: 'chief_accountant', approverUserId: 'chief-1' };
const lawyerStep = { roleCode: 'lawyer', approverUserId: 'lawyer-1' };

describe('Шаг «Главный бухгалтер» — общая очередь главбуха и зама (решение 2026-09-11)', () => {
  test('зам главбуха действует на шаге главбуха', () => {
    expect(approvalRoleForUser('deputy_chief_accountant')).toBe('chief_accountant');
    expect(userMatchesApprovalStep(chiefStep, 'deputy-1', 'deputy_chief_accountant')).toBe(true);
  });

  test('главбух действует на шаге, назначенном заму', () => {
    const stepOnDeputy = { roleCode: 'chief_accountant', approverUserId: 'deputy-1' };
    expect(userMatchesApprovalStep(stepOnDeputy, 'chief-1', 'chief_accountant')).toBe(true);
  });

  test('назначенный пользователь любой роли проходит', () => {
    expect(userMatchesApprovalStep(lawyerStep, 'lawyer-1', 'lawyer')).toBe(true);
  });

  test('чужие роли на шаг главбуха не проходят', () => {
    expect(userMatchesApprovalStep(chiefStep, 'lawyer-1', 'lawyer')).toBe(false);
    expect(userMatchesApprovalStep(chiefStep, undefined, 'chief_accountant')).toBe(false);
  });

  test('пара не получает доступ к чужим шагам других ролей', () => {
    expect(userMatchesApprovalStep(lawyerStep, 'deputy-1', 'deputy_chief_accountant')).toBe(false);
  });
});

describe('Подпись стороны в листе согласования', () => {
  test('если визировал зам — лист показывает «Заместитель главного бухгалтера»', () => {
    expect(contractApprovalStepRoleLabel('chief_accountant', 'deputy_chief_accountant'))
      .toBe('Заместитель главного бухгалтера');
  });

  test('если визировал главбух — подпись прежняя', () => {
    expect(contractApprovalStepRoleLabel('chief_accountant', 'chief_accountant')).toBe('Главный бухгалтер');
    expect(contractApprovalStepRoleLabel('chief_accountant', undefined)).toBe('Главный бухгалтер');
  });

  test('на остальные роли фактическая роль пользователя не влияет', () => {
    expect(contractApprovalStepRoleLabel('lawyer', 'deputy_chief_accountant')).toBe('Юрист');
  });
});
