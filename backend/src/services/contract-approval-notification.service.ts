import { AppDataSource } from '../config/data-source';
import { Contract } from '../models/contract.model';
import { ContractApprovalStep } from '../models/contract-approval-step.model';
import { User } from '../models/user.model';
import { Note } from '../models/note.model';
import { NoteRecipient } from '../models/note-recipient.model';
import { sendEmailWithAttachment } from './email.service';
import { logger } from '../utils/logger';
import { planWebSocketService } from './websocket.service';

const userRepo = AppDataSource.getRepository(User);
const noteRepo = AppDataSource.getRepository(Note);
const noteRecipientRepo = AppDataSource.getRepository(NoteRecipient);

type SystemNoteOptions = {
  linkedContractId: string;
  linkedStepId: string;
  startAt: Date;
  endAt: Date;
  recipientRoleIds?: string[];
};

async function createInAppNotification(recipientUserIds: string[], title: string, options?: SystemNoteOptions): Promise<void> {
  const roleRecipients = options?.recipientRoleIds ?? [];
  if (!recipientUserIds.length && !roleRecipients.length) return;
  const now = new Date();
  const start = options?.startAt ?? now;
  const end = options?.endAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (options?.linkedContractId) {
    const openSystemNotes = await noteRepo.find({
      where: {
        source: 'system' as any,
        status: 'active' as any,
        linkedContractId: options.linkedContractId,
      },
    });
    if (openSystemNotes.length) {
      for (const item of openSystemNotes) {
        item.status = 'closed' as any;
      }
      await noteRepo.save(openSystemNotes);
    }
  }

  const note = await noteRepo.save(
    noteRepo.create({
      title,
      startAt: start,
      endAt: end,
      authorId: '00000000-0000-0000-0000-000000000000',
      authorName: 'Система',
      visibility: 'targeted',
      source: 'system',
      status: 'active',
      linkedContractId: options?.linkedContractId ?? null,
      linkedStepId: options?.linkedStepId ?? null,
    })
  );
  const recipients = [
    ...recipientUserIds.map((userId) => noteRecipientRepo.create({ noteId: note.id, userId, roleId: null })),
    ...roleRecipients.map((roleId) => noteRecipientRepo.create({ noteId: note.id, userId: null, roleId })),
  ];
  await noteRecipientRepo.save(recipients);
  planWebSocketService.notifyNotesUnreadRefresh();
}

async function sendEmailToRecipients(userIds: string[], roleIds: string[], subject: string, text: string): Promise<void> {
  const recipientsSet = new Set<string>();
  if (userIds.length) {
    const usersById = await userRepo.find({ where: userIds.map((id) => ({ id, isActive: true })) as any });
    usersById.forEach((u) => {
      if (u.email) recipientsSet.add(u.email);
    });
  }
  if (roleIds.length) {
    const usersByRole = await userRepo.find({ where: roleIds.map((role) => ({ role: role as any, isActive: true })) as any });
    usersByRole.forEach((u) => {
      if (u.email) recipientsSet.add(u.email);
    });
  }
  const recipients = [...recipientsSet];
  if (!recipients.length) return;
  try {
    await sendEmailWithAttachment(recipients, subject, `<div style="font-family:Arial,sans-serif">${text}</div>`);
  } catch (error) {
    logger.error('Contract notification email failed:', error);
  }
}

export async function notifyStepAssigned(contract: Contract, step: ContractApprovalStep, recipientUserIds: string[]): Promise<void> {
  const recipientRoleIds = [step.roleCode];
  const title = `Согласование договора ${contract.contractNumber}: назначен этап ${step.roleCode}`;
  await createInAppNotification(recipientUserIds, title, {
    linkedContractId: contract.id,
    linkedStepId: step.id,
    startAt: step.assignedAt ?? new Date(),
    endAt: step.deadlineAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    recipientRoleIds,
  });
  await sendEmailToRecipients(recipientUserIds, recipientRoleIds, `Назначен этап согласования договора ${contract.contractNumber}`, title);
}

export async function notifyOverdue(contract: Contract, step: ContractApprovalStep, recipientUserIds: string[]): Promise<void> {
  const recipientRoleIds = [step.roleCode];
  const title = `Просрочка этапа ${step.roleCode} по договору ${contract.contractNumber}`;
  await createInAppNotification(recipientUserIds, title, {
    linkedContractId: contract.id,
    linkedStepId: step.id,
    startAt: new Date(),
    endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    recipientRoleIds,
  });
  await sendEmailToRecipients(recipientUserIds, recipientRoleIds, `Просрочка согласования договора ${contract.contractNumber}`, title);
}

export async function notifyEscalation(contract: Contract, step: ContractApprovalStep, recipientUserIds: string[]): Promise<void> {
  const recipientRoleIds = [step.roleCode];
  const title = `Эскалация: этап ${step.roleCode} просрочен > 1 рабочего дня по договору ${contract.contractNumber}`;
  await createInAppNotification(recipientUserIds, title, {
    linkedContractId: contract.id,
    linkedStepId: step.id,
    startAt: new Date(),
    endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    recipientRoleIds,
  });
  await sendEmailToRecipients(recipientUserIds, recipientRoleIds, `Эскалация согласования договора ${contract.contractNumber}`, title);
}
