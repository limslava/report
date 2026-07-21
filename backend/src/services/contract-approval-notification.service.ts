import { AppDataSource } from '../config/data-source';
import { Contract, ContractStatus } from '../models/contract.model';
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

function contractTaskUrl(contractId: string, stepId: string): string {
  const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://report-limslava.amvera.io').replace(/\/+$/, '');
  const params = new URLSearchParams({ contractId, stepId, source: 'email' });
  return `${frontendBaseUrl}/business-processes/contract-approval?${params.toString()}`;
}

function contractCardUrl(contractId: string): string {
  const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://report-limslava.amvera.io').replace(/\/+$/, '');
  const params = new URLSearchParams({ contractId, source: 'email' });
  return `${frontendBaseUrl}/business-processes/contract-approval?${params.toString()}`;
}

function openContractButton(url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <p style="margin:20px 0 8px">
      <a href="${safeUrl}" style="display:inline-block;padding:10px 16px;border-radius:4px;background:#1976d2;color:#fff;text-decoration:none;font-weight:600">
        Открыть договор
      </a>
    </p>
    <p style="margin:0;color:#67758a;font-size:12px">Если кнопка не открывается: <a href="${safeUrl}">${safeUrl}</a></p>
  `;
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
  const taskUrl = contractTaskUrl(contract.id, step.id);
  const subject = isSigningHandoff
    ? `Договор готов к подписанию: № ${contract.contractNumber} - ${shortCounterparty}`
    : `Новая задача: договор № ${contract.contractNumber} - ${shortCounterparty}`;
  const instruction = isSigningHandoff
    ? `
      <p>Все этапы согласования завершены. Вам назначена задача по оформлению подписи.</p>
      ${contractSummary(contract)}
      <p><strong>Срок выполнения:</strong> ${escapeHtml(formatDateTime(step.deadlineAt))} (Владивосток)</p>
      <p>Откройте карточку договора, распечатайте пакет документов, передайте его на подпись и после возврата приложите подписанный экземпляр.</p>
      ${openContractButton(taskUrl)}
    `
    : `
      <p>Вам назначена задача по согласованию договора.</p>
      ${contractSummary(contract)}
      <p><strong>Срок выполнения:</strong> ${escapeHtml(formatDateTime(step.deadlineAt))} (Владивосток)</p>
      <p>Откройте раздел «Согласование договоров», ознакомьтесь с документами и сохраните решение.</p>
      ${openContractButton(taskUrl)}
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
  const taskUrl = contractTaskUrl(contract.id, changedStep.id);
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      <p>После принятия вашей визы участник <strong>${escapeHtml(changedRole)}</strong> изменил свое решение по договору.</p>
      ${contractSummary(contract)}
      <p><strong>Было:</strong> ${escapeHtml(decisionLabel(previousDecision, previousComment))}<br>
      <strong>Стало:</strong> ${escapeHtml(decisionLabel(changedStep.decision, currentComment))}</p>
      ${currentComment ? `<p><strong>Комментарий:</strong> ${escapeHtml(currentComment)}</p>` : ''}
      <p>Пожалуйста, проверьте актуальную ситуацию в карточке договора. При необходимости вы можете обновить свою визу.</p>
      ${openContractButton(taskUrl)}
    </div>
  `;
  await sendEmailToUsers(recipientSteps.map((step) => step.approverUserId), subject, html);
}

// Инициатору: все визы получены, договор передан офис-менеджеру на подписание.
export async function notifyInitiatorReadyForSignature(contract: Contract): Promise<void> {
  if (!contract.initiatorId) return;
  const shortCounterparty = counterpartyLabel(contract);
  const subject = `Договор согласован, ожидает подписания: № ${contract.contractNumber} - ${shortCounterparty}`;
  const url = contractCardUrl(contract.id);
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      <p>По вашему договору получены все визы согласующих. Договор передан офис-менеджеру на подписание.</p>
      ${contractSummary(contract)}
      <p>Сейчас ожидается подписание и информация от офис-менеджера. Дополнительных действий от вас не требуется — о финальном результате вы получите отдельное уведомление. Ход подписания можно отслеживать в карточке договора.</p>
      ${openContractButton(url)}
    </div>
  `;
  await sendEmailToUsers([contract.initiatorId], subject, html);
}

// Инициатору: финальный результат по договору — согласован / не согласован / на доработку.
export async function notifyInitiatorFinalResult(contract: Contract): Promise<void> {
  if (!contract.initiatorId) return;
  const shortCounterparty = counterpartyLabel(contract);
  const url = contractCardUrl(contract.id);
  let subject: string;
  let intro: string;
  if (contract.status === ContractStatus.APPROVED) {
    subject = `Договор согласован и подписан: № ${contract.contractNumber} - ${shortCounterparty}`;
    intro = '<p>Ваш договор полностью согласован и подписан. Согласование завершено.</p>';
  } else if (contract.status === ContractStatus.REJECTED) {
    subject = `Договор не согласован: № ${contract.contractNumber} - ${shortCounterparty}`;
    intro = '<p>По вашему договору принято отрицательное решение — договор <strong>не согласован</strong>. Подробности и комментарии участников доступны в карточке договора.</p>';
  } else if (contract.status === ContractStatus.REWORK) {
    subject = `Договор возвращён на доработку: № ${contract.contractNumber} - ${shortCounterparty}`;
    intro = '<p>Ваш договор <strong>возвращён на доработку</strong>. Ознакомьтесь с замечаниями в карточке договора, внесите правки и повторно направьте документ на согласование.</p>';
  } else {
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      ${intro}
      ${contractSummary(contract)}
      ${openContractButton(url)}
    </div>
  `;
  await sendEmailToUsers([contract.initiatorId], subject, html);
}
