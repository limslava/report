import { AppDataSource } from '../config/data-source';
import { Contract } from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import { User } from '../models/user.model';
import { sendEmailWithAttachment } from './email.service';
import { logger } from '../utils/logger';
import { contractApprovalRoleLabel } from '../constants/contract-approval';

const userRepo = AppDataSource.getRepository(User);

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function roleLabel(roleCode: string): string {
  return contractApprovalRoleLabel(roleCode);
}

function counterpartyLabel(contract: Contract): string {
  return contract.counterpartyShortName?.trim() || contract.counterpartyName;
}

function formatDateTime(value: Date | null): string {
  if (!value) return 'не указан';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Vladivostok',
  }).format(value);
}

function decisionLabel(decision: ContractApprovalDecision | null, comment?: string | null): string {
  if (decision === ContractApprovalDecision.REJECT) return 'Не согласован';
  if (decision === ContractApprovalDecision.REWORK) return 'Возвращен на доработку';
  if (decision === ContractApprovalDecision.APPROVE && comment?.trim()) return 'Согласован с замечаниями';
  if (decision === ContractApprovalDecision.APPROVE) return 'Согласован';
  return 'Решение не принято';
}

async function sendEmailToUsers(userIds: string[], subject: string, html: string): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const users = await userRepo.find({ where: uniqueIds.map((id) => ({ id, isActive: true })) as any });
  const recipients = [...new Set(users.map((user) => user.email).filter(Boolean))];
  if (!recipients.length) return;
  try {
    await sendEmailWithAttachment(recipients, subject, html);
  } catch (error) {
    logger.error('Contract notification email failed:', error);
  }
}

function contractSummary(contract: Contract): string {
  return `
    <table style="border-collapse:collapse;margin:14px 0;color:#25324a">
      <tr><td style="padding:4px 18px 4px 0;color:#67758a">Договор</td><td style="padding:4px 0;font-weight:600">№ ${escapeHtml(contract.contractNumber)}</td></tr>
      <tr><td style="padding:4px 18px 4px 0;color:#67758a">Контрагент</td><td style="padding:4px 0">${escapeHtml(contract.counterpartyName)}</td></tr>
      <tr><td style="padding:4px 18px 4px 0;color:#67758a">Предмет</td><td style="padding:4px 0">${escapeHtml(contract.subject) || '—'}</td></tr>
    </table>
  `;
}

export async function notifyStepAssigned(contract: Contract, step: ContractApprovalStep): Promise<void> {
  const shortCounterparty = counterpartyLabel(contract);
  const isSigningHandoff = step.roleCode === 'secretary';
  const subject = isSigningHandoff
    ? `Договор готов к подписанию: № ${contract.contractNumber} - ${shortCounterparty}`
    : `Новая задача: договор № ${contract.contractNumber} - ${shortCounterparty}`;
  const instruction = isSigningHandoff
    ? `
      <p>Все этапы согласования завершены. Вам назначена задача по оформлению подписи.</p>
      ${contractSummary(contract)}
      <p><strong>Срок выполнения:</strong> ${escapeHtml(formatDateTime(step.deadlineAt))} (Владивосток)</p>
      <p>Откройте карточку договора, распечатайте пакет документов, передайте его на подпись и после возврата приложите подписанный экземпляр.</p>
    `
    : `
      <p>Вам назначена задача по согласованию договора.</p>
      ${contractSummary(contract)}
      <p><strong>Срок выполнения:</strong> ${escapeHtml(formatDateTime(step.deadlineAt))} (Владивосток)</p>
      <p>Откройте раздел «Согласование договоров», ознакомьтесь с документами и сохраните решение.</p>
    `;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      ${instruction}
    </div>
  `;
  await sendEmailToUsers([step.approverUserId], subject, html);
}

export async function notifyDecisionChanged(
  contract: Contract,
  changedStep: ContractApprovalStep,
  previousDecision: ContractApprovalDecision | null,
  previousComment: string | null,
  recipientSteps: ContractApprovalStep[],
): Promise<void> {
  const changedRole = roleLabel(changedStep.roleCode);
  const subject = `Изменена виза: договор № ${contract.contractNumber} — ${changedRole}`;
  const currentComment = changedStep.comment?.trim() || null;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      <p>После принятия вашей визы участник <strong>${escapeHtml(changedRole)}</strong> изменил свое решение по договору.</p>
      ${contractSummary(contract)}
      <p><strong>Было:</strong> ${escapeHtml(decisionLabel(previousDecision, previousComment))}<br>
      <strong>Стало:</strong> ${escapeHtml(decisionLabel(changedStep.decision, currentComment))}</p>
      ${currentComment ? `<p><strong>Комментарий:</strong> ${escapeHtml(currentComment)}</p>` : ''}
      <p>Пожалуйста, проверьте актуальную ситуацию в карточке договора. При необходимости вы можете обновить свою визу.</p>
    </div>
  `;
  await sendEmailToUsers(recipientSteps.map((step) => step.approverUserId), subject, html);
}
