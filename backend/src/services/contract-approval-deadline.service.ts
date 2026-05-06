import { AppDataSource } from '../config/data-source';
import { ContractStatus } from '../models/contract.model';
import { ContractApprovalStep } from '../models/contract-approval-step.model';
import { User } from '../models/user.model';
import { countWorkingDaysBetween, isWorkday } from './workday-calendar.service';
import { notifyEscalation, notifyOverdue, notifyStepAssigned } from './contract-approval-notification.service';

const stepRepo = AppDataSource.getRepository(ContractApprovalStep);
const userRepo = AppDataSource.getRepository(User);

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function processContractApprovalDeadlines(now = new Date()): Promise<void> {
  const steps = await stepRepo.find({
    where: {
      decision: null as any,
    },
    relations: ['contract'],
  });

  const activeSteps = steps.filter((step) => step.contract?.status === ContractStatus.IN_APPROVAL && step.assignedAt && step.deadlineAt);

  for (const step of activeSteps) {
    const assignedUserId = step.approverUserId;
    const initiatorId = step.contract.initiatorId;
    const gd = await userRepo.findOne({ where: { role: 'general_director' as any, isActive: true }, order: { createdAt: 'ASC' } });
    const deadlineDay = startOfUtcDay(step.deadlineAt!);
    const today = startOfUtcDay(now);
    const assignedDay = startOfUtcDay(step.assignedAt!);
    const isTodayWorkday = await isWorkday(today);

    if (!step.reminderBeforeSentAt && isTodayWorkday) {
      const oneDayBefore = new Date(deadlineDay);
      oneDayBefore.setUTCDate(oneDayBefore.getUTCDate() - 1);
      // Do not send "1 day before" reminder on the same day when step was assigned.
      if (today.getTime() === oneDayBefore.getTime() && today.getTime() > assignedDay.getTime()) {
        await notifyStepAssigned(step.contract, step, [assignedUserId, initiatorId].filter(Boolean));
        step.reminderBeforeSentAt = now;
      }
    }

    if (!step.reminderDeadlineSentAt && isTodayWorkday && today.getTime() === deadlineDay.getTime()) {
      await notifyStepAssigned(step.contract, step, [assignedUserId, initiatorId].filter(Boolean));
      step.reminderDeadlineSentAt = now;
    }

    if (!step.reminderOverdueSentAt && today > deadlineDay) {
      await notifyOverdue(step.contract, step, [assignedUserId, initiatorId].filter(Boolean));
      step.reminderOverdueSentAt = now;
    }

    if (!step.escalationSentAt && today > deadlineDay) {
      const overdueDays = await countWorkingDaysBetween(deadlineDay, today);
      if (overdueDays > 1) {
        const adminUsers = await userRepo.find({ where: { role: 'admin' as any, isActive: true } });
        const recipients = new Set<string>([
          ...adminUsers.map((u) => u.id),
          assignedUserId,
          initiatorId,
          gd?.id || '',
        ]);
        recipients.delete('');
        await notifyEscalation(step.contract, step, [...recipients]);
        step.escalationSentAt = now;
      }
    }
    await stepRepo.save(step);
  }
}

export async function assignDeadlineForStep(step: ContractApprovalStep): Promise<void> {
  await stepRepo.save(step);
}
