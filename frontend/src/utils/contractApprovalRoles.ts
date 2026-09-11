/**
 * Роль пользователя в терминах шага согласования договоров: заместитель
 * главного бухгалтера работает на шаге «Главный бухгалтер» (общая очередь
 * с главбухом — решение 2026-09-11). Зеркалит бэкендовый
 * constants/contract-approval.ts.
 */
export function approvalRoleForUser(role?: string | null): string | null {
  if (role === 'deputy_chief_accountant') return 'chief_accountant';
  return role ?? null;
}

export function userMatchesApprovalStep(
  step: { roleCode: string; approverUserId: string },
  userId?: string | null,
  userRole?: string | null,
): boolean {
  if (!userId) return false;
  if (step.approverUserId === userId) return true;
  return step.roleCode === 'chief_accountant' && approvalRoleForUser(userRole) === 'chief_accountant';
}
