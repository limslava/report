import { Request, Response, NextFunction } from 'express';
import { In, IsNull } from 'typeorm';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AppDataSource } from '../config/data-source';
import {
  Contract,
  ContractDocumentKind,
  ContractIncomeSubtype,
  ContractSigningMethod,
  ContractStatus,
  ContractTemplateKind,
  ContractType,
} from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import { ContractAttachment } from '../models/contract-attachment.model';
import { User } from '../models/user.model';
import { COUNTERPARTY_FORMS, COUNTERPARTY_FORM_MAP } from '../constants/counterparty-forms';
import {
  listSlaRules,
  resolveSlaWorkdays,
  upsertSlaRules,
} from '../services/contract-approval-sla.service';
import { calculateDeadlineBySchedule, resolveEffectiveWorkSchedule } from '../services/contract-work-schedule.service';
import { listCalendarByYear, syncCalendarBySource, upsertCalendarDay } from '../services/workday-calendar.service';
import { notifyStepAssigned } from '../services/contract-approval-notification.service';
import { logger } from '../utils/logger';

const contractRepository = AppDataSource.getRepository(Contract);
const stepRepository = AppDataSource.getRepository(ContractApprovalStep);
const attachmentRepository = AppDataSource.getRepository(ContractAttachment);
const userRepository = AppDataSource.getRepository(User);

const ROLE_LABELS: Record<string, string> = {
  initiator: 'Инициатор',
  security: 'СБ',
  lawyer: 'Юрист',
  chief_accountant: 'Главный бухгалтер',
  financer: 'Финансовый директор',
  general_director: 'Генеральный директор',
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return value.toISOString();
}

function toYmdOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // Postgres DATE often comes as YYYY-MM-DD string in JS driver.
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function buildAttachmentDisposition(filename: string): string {
  // RFC-friendly dual filename:
  // - filename="<ascii>" for legacy clients / strict Node header validation
  // - filename*=UTF-8''<percent-encoded> for proper UTF-8 names
  const asciiFallback = filename
    .replace(/[\r\n"]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .trim() || 'attachment';
  const encoded = encodeURIComponent(filename.replace(/[\r\n]/g, '')).replace(/%20/g, '+');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function normalizeFilename(name: string): string {
  return name.replace(/[^\w.\-()\u0400-\u04FF ]/g, '_').slice(0, 180) || 'document';
}

async function resolveAttachmentPath(item: ContractAttachment): Promise<string | null> {
  const candidates = new Set<string>();
  if (item.storagePath) {
    candidates.add(item.storagePath);
    candidates.add(path.resolve(process.cwd(), item.storagePath));
  }
  const basename = path.basename(item.storagePath || '');
  if (basename) {
    candidates.add(path.resolve(process.cwd(), 'uploads', 'contracts', item.contractId, basename));
  }
  if (item.originalName) {
    candidates.add(path.resolve(process.cwd(), 'uploads', 'contracts', item.contractId, item.originalName));
  }

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
      if (stat.isDirectory()) {
        // Legacy fallback: if DB path points to directory, try to find the exact file inside.
        // eslint-disable-next-line no-await-in-loop
        const entries = await fs.readdir(candidate);
        const preferred = entries.find((name) => name === item.originalName) ?? entries[0];
        if (preferred) {
          const nested = path.join(candidate, preferred);
          // eslint-disable-next-line no-await-in-loop
          const nestedStat = await fs.stat(nested);
          if (nestedStat.isFile()) {
            return nested;
          }
        }
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function resolveApproverUserId(roleCode: string, contract: Contract): Promise<string> {
  if (roleCode === 'initiator') {
    return contract.initiatorId;
  }

  if (roleCode === 'general_director') {
    if (contract.assignedGeneralDirectorId) {
      return contract.assignedGeneralDirectorId;
    }
    const gd = await userRepository.findOne({ where: { role: 'general_director' as any, isActive: true }, order: { createdAt: 'ASC' } });
    if (!gd) {
      const error: any = new Error('Не найден активный пользователь с ролью Генеральный директор');
      error.statusCode = 400;
      throw error;
    }
    return gd.id;
  }

  const approver = await userRepository.findOne({
    where: { role: roleCode as any, isActive: true },
    order: { createdAt: 'ASC' },
  });

  if (!approver) {
    const error: any = new Error(`Не найден активный пользователь для роли: ${ROLE_LABELS[roleCode] ?? roleCode}`);
    error.statusCode = 400;
    throw error;
  }

  return approver.id;
}

function buildRouteRoles(contract: Contract): string[] {
  if (contract.contractType === ContractType.EXPENSE) {
    return ['security', 'lawyer', 'chief_accountant', 'financer', 'general_director'];
  }

  if (contract.incomeSubtype === ContractIncomeSubtype.STANDARD) {
    return ['security', 'general_director'];
  }

  return ['security', 'lawyer', 'chief_accountant', 'financer', 'general_director'];
}

function requireStartFields(contract: Contract): void {
  if (!contract.contractNumber?.trim()) {
    const error: any = new Error('Не заполнено поле № договора');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.counterpartyName?.trim()) {
    const error: any = new Error('Не заполнено поле контрагент');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.subject?.trim()) {
    const error: any = new Error('Не заполнено поле предмет договора');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.contractDate) {
    const error: any = new Error('Не заполнена дата договора');
    error.statusCode = 400;
    throw error;
  }

  if (contract.contractType === ContractType.INCOME && !contract.incomeSubtype) {
    const error: any = new Error('Для доходного договора обязателен подтип');
    error.statusCode = 400;
    throw error;
  }

  if (contract.contractType === ContractType.INCOME && contract.incomeSubtype === ContractIncomeSubtype.WITH_PSR && !contract.psrFlag) {
    const error: any = new Error('Для доходного договора с ПСР признак ПСР должен быть включен');
    error.statusCode = 400;
    throw error;
  }
}

function validateInnByCounterpartyForm(inn: string, counterpartyForm: string | null): void {
  if (!counterpartyForm) {
    return;
  }
  const form = COUNTERPARTY_FORM_MAP.get(counterpartyForm as any);
  if (!form) {
    const error: any = new Error('Неизвестная форма собственности контрагента');
    error.statusCode = 400;
    throw error;
  }
  if (inn.length !== form.innLength) {
    const error: any = new Error(`Для формы ${form.label} ИНН должен содержать ${form.innLength} цифр`);
    error.statusCode = 400;
    throw error;
  }
}

export const getContractReferences = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      counterpartyForms: COUNTERPARTY_FORMS,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractSlaRules = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await listSlaRules();
    res.json(rules);
  } catch (error) {
    next(error);
  }
};

export const updateContractSlaRules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = Array.isArray(req.body?.rules) ? req.body.rules : [];
    await upsertSlaRules(payload);
    const rules = await listSlaRules();
    res.json(rules);
  } catch (error) {
    next(error);
  }
};

export const getWorkCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      const error: any = new Error('Некорректный год');
      error.statusCode = 400;
      throw error;
    }
    const rows = await listCalendarByYear(year);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const upsertWorkCalendarDay = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = String(req.params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const error: any = new Error('Некорректный формат даты. Используйте YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }
    const { isWorkday, comment } = req.body as { isWorkday: boolean; comment?: string | null };
    await upsertCalendarDay(date, Boolean(isWorkday), comment?.trim() || null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const syncWorkCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    const source = String(req.query.source || 'isdayoff') as 'isdayoff' | 'weekend-default';
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      const error: any = new Error('Некорректный год');
      error.statusCode = 400;
      throw error;
    }
    if (!['isdayoff', 'weekend-default'].includes(source)) {
      const error: any = new Error('Некорректный источник календаря');
      error.statusCode = 400;
      throw error;
    }
    await syncCalendarBySource(year, source);
    res.json({ ok: true, year, source });
  } catch (error) {
    next(error);
  }
};

export const findContractDuplicates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inn = String(req.query.inn ?? '').trim();
    const contractType = String(req.query.contractType ?? '').trim() as ContractType;
    if (!inn || (contractType !== ContractType.EXPENSE && contractType !== ContractType.INCOME)) {
      const error: any = new Error('Не переданы параметры поиска дублей');
      error.statusCode = 400;
      throw error;
    }

    const duplicates = await contractRepository.find({
      where: {
        counterpartyInn: inn,
        contractType,
      },
      relations: ['initiator'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    res.json(duplicates.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      contractDate: toYmdOrNull(contract.contractDate),
      subject: contract.subject,
      counterpartyName: contract.counterpartyName,
      status: contract.status,
      initiatorName: contract.initiator?.fullName ?? null,
      createdAt: contract.createdAt,
    })));
  } catch (error) {
    next(error);
  }
};

export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contracts = await contractRepository.find({
      relations: ['initiator', 'parentContract', 'assignedGeneralDirector'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const contractIds = contracts.map((c) => c.id);
    const steps = contractIds.length
      ? await stepRepository.find({
        where: { contractId: In(contractIds) },
        order: { contractId: 'ASC', orderNo: 'ASC' },
      })
      : [];
    const stepsByContract = new Map<string, ContractApprovalStep[]>();
    for (const step of steps) {
      const list = stepsByContract.get(step.contractId) ?? [];
      list.push(step);
      stepsByContract.set(step.contractId, list);
    }

    res.json(contracts.map((contract) => ({
      ...(function getFlowMeta() {
        const contractSteps = stepsByContract.get(contract.id) ?? [];
        const currentPending = contractSteps.find((s) => !s.decision) ?? null;
        const lastDecided = [...contractSteps].reverse().find((s) => Boolean(s.decision)) ?? null;
        const currentStageLabel = currentPending ? `Проверка ${ROLE_LABELS[currentPending.roleCode] ?? currentPending.roleCode}` : null;
        let statusDetail: string | null = null;
        if (contract.status === ContractStatus.IN_APPROVAL) {
          statusDetail = currentStageLabel;
        } else if (contract.status === ContractStatus.REJECTED && lastDecided?.decision === ContractApprovalDecision.REJECT) {
          if (lastDecided.roleCode === 'security') {
            statusDetail = 'Отклонено СБ';
          } else {
            statusDetail = `Отклонено: ${ROLE_LABELS[lastDecided.roleCode] ?? lastDecided.roleCode}`;
          }
        }
        return {
          currentStageRole: currentPending?.roleCode ?? null,
          currentStageLabel,
          statusDetail,
        };
      }()),
      id: contract.id,
      contractNumber: contract.contractNumber,
      contractType: contract.contractType,
      incomeSubtype: contract.incomeSubtype,
      counterpartyName: contract.counterpartyName,
      counterpartyShortName: contract.counterpartyShortName,
      ownershipForm: contract.ownershipForm,
      counterpartyForm: contract.counterpartyForm,
      counterpartyInn: contract.counterpartyInn,
      templateKind: contract.templateKind,
      subject: contract.subject,
      contractDate: toYmdOrNull(contract.contractDate),
      psrFlag: contract.psrFlag,
      signingMethod: contract.signingMethod,
      status: contract.status,
      documentKind: contract.documentKind,
      parentContractId: contract.parentContractId,
      parentContractNumber: contract.parentContract?.contractNumber ?? null,
      assignedGeneralDirectorId: contract.assignedGeneralDirectorId,
      assignedGeneralDirector: null,
      initiator: contract.initiator
        ? { id: contract.initiator.id, fullName: contract.initiator.fullName, role: contract.initiator.role }
        : null,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    })));
  } catch (error) {
    next(error);
  }
};

export const listSecurityInbox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }

    const view = String(req.query.view || 'active').trim();
    if (!['active', 'processed', 'all'].includes(view)) {
      const error: any = new Error('Некорректный фильтр');
      error.statusCode = 400;
      throw error;
    }

    const steps = await stepRepository.find({
      where: {
        roleCode: 'security',
      },
      relations: ['contract', 'contract.initiator'],
      order: { createdAt: 'DESC' },
    });

    const filteredSteps = steps
      .filter((step) => {
        if (!step.contract) return false;
        const isActive = !step.decision && step.contract.status === ContractStatus.IN_APPROVAL;
        const isProcessed = Boolean(step.decision);
        if (view === 'active') return isActive;
        if (view === 'processed') return isProcessed;
        return isActive || isProcessed;
      });

    // Avoid duplicate contracts in inbox: keep only most recent security step per contract.
    const uniqueByContract = new Map<string, ContractApprovalStep>();
    for (const step of filteredSteps) {
      const existing = uniqueByContract.get(step.contractId);
      if (!existing) {
        uniqueByContract.set(step.contractId, step);
        continue;
      }
      const existingTs = new Date(existing.createdAt).getTime();
      const currentTs = new Date(step.createdAt).getTime();
      if (currentTs > existingTs) {
        uniqueByContract.set(step.contractId, step);
      }
    }

    const uniqueSteps = Array.from(uniqueByContract.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const data = await Promise.all(uniqueSteps.map(async (step) => {
        const files = await attachmentRepository.find({
          where: { contractId: step.contractId },
          order: { createdAt: 'ASC' },
        });

        return {
          contractId: step.contract.id,
          stepId: step.id,
          contractNumber: step.contract.contractNumber,
          counterpartyShortName: step.contract.counterpartyShortName,
          counterpartyForm: step.contract.counterpartyForm,
          counterpartyInn: step.contract.counterpartyInn,
          contractType: step.contract.contractType,
          incomeSubtype: step.contract.incomeSubtype,
          counterpartyName: step.contract.counterpartyName,
          subject: step.contract.subject,
          contractDate: toYmdOrNull(step.contract.contractDate),
          initiatorName: step.contract.initiator?.fullName ?? '—',
          assignedAt: toIsoOrNull(step.assignedAt),
          deadlineAt: toIsoOrNull(step.deadlineAt),
          securityDecision: step.decision,
          securitySignedAt: toIsoOrNull(step.signedAt),
          securityComment: step.comment,
          attachments: files.map((f) => ({
            id: f.id,
            originalName: f.originalName,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
          })),
        };
      }));

    res.json(data);
  } catch (error) {
    next(error);
  }
};

export const getMyApprovalDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const roleSteps = await stepRepository.find({
      where: currentUserRole ? { roleCode: currentUserRole } : { approverUserId: currentUserId },
      relations: ['contract'],
      order: { assignedAt: 'DESC', createdAt: 'DESC' },
      take: 5000,
    });

    // Workload is role-based (new employee sees the role queue).
    const activeRoleSteps = roleSteps.filter((step) => !step.decision && step.contract?.status === ContractStatus.IN_APPROVAL);
    // Personal productivity is user-based.
    const processedMySteps = roleSteps.filter(
      (step) => step.approverUserId === currentUserId && Boolean(step.decision) && step.signedAt,
    );

    const newRequests = activeRoleSteps.filter((step) => {
      if (!step.assignedAt) return false;
      const assignedAt = new Date(step.assignedAt);
      return assignedAt >= startOfToday && assignedAt <= endOfToday;
    }).length;

    const overdue = activeRoleSteps.filter((step) => step.deadlineAt && new Date(step.deadlineAt) < now).length;
    const dueToday = activeRoleSteps.filter((step) => {
      if (!step.deadlineAt) return false;
      const deadline = new Date(step.deadlineAt);
      return deadline >= startOfToday && deadline <= endOfToday;
    }).length;
    const inWork = Math.max(activeRoleSteps.length - overdue, 0);

    const completedMonthSteps = processedMySteps.filter((step) => {
      if (!step.signedAt) return false;
      return new Date(step.signedAt) >= startOfMonth;
    });
    const completedMonth = completedMonthSteps.length;

    const avgHours = completedMonthSteps.length
      ? completedMonthSteps.reduce((sum, step) => {
        if (!step.assignedAt || !step.signedAt) return sum;
        const assignedAt = new Date(step.assignedAt).getTime();
        const signedAt = new Date(step.signedAt).getTime();
        if (signedAt <= assignedAt) return sum;
        return sum + ((signedAt - assignedAt) / (1000 * 60 * 60));
      }, 0) / completedMonthSteps.length
      : 0;

    res.json({
      inWork,
      dueToday,
      overdue,
      newRequests,
      completedMonth,
      avgProcessingHours: Number(avgHours.toFixed(1)),
    });
  } catch (error) {
    next(error);
  }
};

export const listMasterContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const masters = await contractRepository.find({
      where: {
        documentKind: ContractDocumentKind.MASTER,
        parentContractId: IsNull(),
      },
      order: { createdAt: 'DESC' },
      take: 500,
    });

    res.json(masters.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      counterpartyName: contract.counterpartyName,
      contractType: contract.contractType,
      subject: contract.subject,
    })));
  } catch (error) {
    next(error);
  }
};

export const createContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      contractNumber,
      contractType,
      incomeSubtype,
      counterpartyName,
      counterpartyShortName,
      ownershipForm,
      counterpartyForm,
      counterpartyInn,
      subject,
      contractDate,
      psrFlag,
      signingMethod,
      allowDuplicate,
      documentKind,
      parentContractId,
      clientRequestId,
    } = req.body as {
      contractNumber: string;
      contractType: ContractType;
      incomeSubtype?: ContractIncomeSubtype | null;
      counterpartyName: string;
      counterpartyShortName?: string | null;
      ownershipForm?: string | null;
      counterpartyForm?: string | null;
      counterpartyInn: string;
      subject?: string | null;
      contractDate?: string | null;
      psrFlag?: boolean;
      signingMethod?: ContractSigningMethod;
      allowDuplicate?: boolean;
      documentKind?: ContractDocumentKind;
      parentContractId?: string | null;
      clientRequestId?: string | null;
    };

    const normalizedDocumentKind = documentKind ?? ContractDocumentKind.MASTER;

    if (normalizedDocumentKind === ContractDocumentKind.ADDENDUM && !parentContractId) {
      const error: any = new Error('Для допсоглашения нужно выбрать базовый договор');
      error.statusCode = 400;
      throw error;
    }

    if (parentContractId) {
      const parentExists = await contractRepository.exist({ where: { id: parentContractId } });
      if (!parentExists) {
        const error: any = new Error('Базовый договор не найден');
        error.statusCode = 400;
        throw error;
      }
    }

    if (!req.user?.id) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }

    const normalizedClientRequestId = String(clientRequestId || '').trim() || null;
    if (normalizedClientRequestId) {
      const existingByRequest = await contractRepository.findOne({
        where: {
          initiatorId: req.user.id,
          clientRequestId: normalizedClientRequestId,
        },
      });
      if (existingByRequest) {
        res.status(200).json({ id: existingByRequest.id, reused: true });
        return;
      }
    }

    const parsedContractDate = contractDate ? new Date(contractDate) : null;
    if (parsedContractDate && Number.isNaN(parsedContractDate.getTime())) {
      const error: any = new Error('Некорректная дата договора');
      error.statusCode = 400;
      throw error;
    }

    const normalizedIncomeSubtype = contractType === ContractType.INCOME ? (incomeSubtype ?? ContractIncomeSubtype.STANDARD) : null;
    const normalizedPsrFlag = contractType === ContractType.INCOME && normalizedIncomeSubtype === ContractIncomeSubtype.WITH_PSR
      ? true
      : Boolean(psrFlag);

    validateInnByCounterpartyForm(counterpartyInn.trim(), counterpartyForm ?? null);

    if (!allowDuplicate) {
      const duplicates = await contractRepository.find({
        where: {
          counterpartyInn: counterpartyInn.trim(),
          contractType,
        },
        order: { createdAt: 'DESC' },
        take: 20,
      });
      if (duplicates.length > 0) {
        res.status(409).json({
          error: 'DUPLICATE_CONTRACTS_FOUND',
          message: 'Найден(ы) договор(ы) с таким ИНН и типом договора',
          duplicates: duplicates.map((item) => ({
            id: item.id,
            contractNumber: item.contractNumber,
            contractDate: toYmdOrNull(item.contractDate),
            subject: item.subject,
            status: item.status,
          })),
        });
        return;
      }
    }

    const contract = contractRepository.create({
      contractNumber: contractNumber.trim(),
      contractType,
      incomeSubtype: normalizedIncomeSubtype,
      counterpartyName: counterpartyName.trim(),
      counterpartyShortName: counterpartyShortName?.trim() || null,
      ownershipForm: ownershipForm?.trim() || null,
      counterpartyForm: counterpartyForm || null,
      counterpartyInn: counterpartyInn.trim(),
      templateKind: ContractTemplateKind.TYPICAL,
      subject: subject?.trim() || null,
      contractDate: parsedContractDate,
      psrFlag: normalizedPsrFlag,
      signingMethod: signingMethod ?? ContractSigningMethod.POST,
      status: ContractStatus.DRAFT,
      assignedGeneralDirectorId: null,
      documentKind: normalizedDocumentKind,
      parentContractId: parentContractId || null,
      initiatorId: req.user.id,
      clientRequestId: normalizedClientRequestId,
    });

    const saved = await contractRepository.save(contract);

    res.status(201).json({ id: saved.id, reused: false });
  } catch (error) {
    next(error);
  }
};

export const uploadContractAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];

    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    if (!files.length) {
      res.json({ uploaded: 0 });
      return;
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads', 'contracts', id);
    await fs.mkdir(uploadsRoot, { recursive: true });

    let uploaded = 0;
    for (const file of files) {
      const originalName = normalizeFilename(String(file?.name || 'document'));
      const contentBase64 = String(file?.contentBase64 || '');
      if (!contentBase64) continue;

      const buffer = Buffer.from(contentBase64, 'base64');
      const ext = path.extname(originalName);
      const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      const fullPath = path.join(uploadsRoot, storedName);
      await fs.writeFile(fullPath, buffer);

      const attachment = attachmentRepository.create({
        contractId: id,
        originalName,
        mimeType: file?.mimeType ? String(file.mimeType) : null,
        sizeBytes: buffer.length,
        storagePath: fullPath,
      });
      await attachmentRepository.save(attachment);
      uploaded += 1;
    }

    res.json({ uploaded });
  } catch (error) {
    next(error);
  }
};

export const listContractAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await attachmentRepository.find({ where: { contractId: id }, order: { createdAt: 'ASC' } });
    res.json(rows.map((item) => ({
      id: item.id,
      originalName: item.originalName,
      sizeBytes: item.sizeBytes,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
    })));
  } catch (error) {
    next(error);
  }
};

export const downloadContractAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const item = await attachmentRepository.findOne({ where: { id: attachmentId }, relations: ['contract'] as any });
    if (!item) {
      const error: any = new Error('Файл не найден');
      error.statusCode = 404;
      throw error;
    }

    const currentUserId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    const isSecurity = req.user?.role === 'security';
    const contract = item.contract ?? await contractRepository.findOne({ where: { id: item.contractId } });
    if (!contract) {
      const error: any = new Error('Договор для вложения не найден');
      error.statusCode = 404;
      throw error;
    }

    if (!isAdmin && !isSecurity && currentUserId !== contract.initiatorId) {
      const error: any = new Error('Нет доступа к файлу договора');
      error.statusCode = 403;
      throw error;
    }

    const readablePath = await resolveAttachmentPath(item);
    if (!readablePath) {
      const error: any = new Error('Файл вложения не найден в хранилище');
      error.statusCode = 404;
      throw error;
    }

    const data = await fs.readFile(readablePath);
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(item.originalName));
    res.send(data);
  } catch (error) {
    next(error);
  }
};

export const securityVisaDecision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;
    const { visa, comment } = req.body as {
      visa: 'approved' | 'rejected' | 'approved_with_remarks';
      comment?: string | null;
    };
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }

    const contract = await contractRepository.findOne({ where: { id: contractId } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    if (contract.status !== ContractStatus.IN_APPROVAL) {
      const error: any = new Error('Договор не находится на согласовании');
      error.statusCode = 400;
      throw error;
    }

    const steps = await stepRepository.find({ where: { contractId }, order: { orderNo: 'ASC' } });
    const currentStep = steps.find((s) => !s.decision);
    if (!currentStep || currentStep.roleCode !== 'security') {
      const error: any = new Error('Сейчас нет активного шага СБ');
      error.statusCode = 400;
      throw error;
    }
    if (req.user?.role !== 'security' && req.user?.role !== 'admin') {
      const error: any = new Error('Нет прав на визирование этого шага');
      error.statusCode = 403;
      throw error;
    }

    const normalizedComment = comment?.trim() || null;
    if (visa === 'approved_with_remarks' && !normalizedComment) {
      const error: any = new Error('Для визы "Согласован с замечаниями" обязателен комментарий');
      error.statusCode = 400;
      throw error;
    }

    const decision = visa === 'rejected' ? ContractApprovalDecision.REJECT : ContractApprovalDecision.APPROVE;
    currentStep.decision = decision;
    currentStep.comment = normalizedComment;
    currentStep.acceptedAt = new Date();
    currentStep.signedAt = new Date();

    const hasPending = steps.some((s) => !s.decision && s.id !== currentStep.id);
    const nextPending = steps.find((s) => !s.decision && s.id !== currentStep.id) ?? null;

    await AppDataSource.transaction(async (manager) => {
      if (currentStep.approverUserId !== currentUserId && req.user?.role === 'security') {
        currentStep.approverUserId = currentUserId;
      }
      await manager.save(currentStep);
      if (decision === ContractApprovalDecision.REJECT) {
        contract.status = ContractStatus.REJECTED;
        await manager.save(contract);
        return;
      }
      if (nextPending) {
        const now = new Date();
        nextPending.assignedAt = now;
        const nextSchedule = await resolveEffectiveWorkSchedule(nextPending.roleCode, nextPending.approverUserId);
        nextPending.deadlineAt = await calculateDeadlineBySchedule(now, nextPending.slaWorkdays || 1, nextSchedule);
        await manager.save(nextPending);
      }
      contract.status = hasPending ? ContractStatus.IN_APPROVAL : ContractStatus.APPROVED;
      await manager.save(contract);
    });

    if (nextPending) {
      void notifyStepAssigned(contract, nextPending, [nextPending.approverUserId, contract.initiatorId]).catch((error) => {
        logger.error('Failed to send step-assigned notification (advanceFromCurrentPendingStep):', error);
      });
    }

    res.json({ ok: true, status: contract.status });
  } catch (error) {
    next(error);
  }
};

export const getContractApprovalSheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({
      where: { id },
      relations: ['initiator', 'assignedGeneralDirector', 'parentContract'],
    });

    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    const steps = await stepRepository.find({
      where: { contractId: id },
      relations: ['approverUser'],
      order: { orderNo: 'ASC' },
    });

    const currentStep = steps.find((step) => !step.decision) ?? null;

    res.json({
      contract: {
        id: contract.id,
        contractNumber: contract.contractNumber,
        contractType: contract.contractType,
        incomeSubtype: contract.incomeSubtype,
        templateKind: contract.templateKind,
        counterpartyName: contract.counterpartyName,
        counterpartyShortName: contract.counterpartyShortName,
        ownershipForm: contract.ownershipForm,
        counterpartyInn: contract.counterpartyInn,
        subject: contract.subject,
        contractDate: toYmdOrNull(contract.contractDate),
        psrFlag: contract.psrFlag,
        signingMethod: contract.signingMethod,
        status: contract.status,
        initiator: contract.initiator ? { id: contract.initiator.id, fullName: contract.initiator.fullName } : null,
        assignedGeneralDirector: contract.assignedGeneralDirector
          ? { id: contract.assignedGeneralDirector.id, fullName: contract.assignedGeneralDirector.fullName }
          : null,
      },
      currentStepId: currentStep?.id ?? null,
      steps: steps.map((step) => ({
        id: step.id,
        roleCode: step.roleCode,
        roleLabel: ROLE_LABELS[step.roleCode] ?? step.roleCode,
        approverUserId: step.approverUserId,
        approverName: step.approverUser?.fullName ?? '—',
        orderNo: step.orderNo,
        acceptedAt: toIsoOrNull(step.acceptedAt),
        signedAt: toIsoOrNull(step.signedAt),
        decision: step.decision,
        comment: step.comment,
        slaWorkdays: step.slaWorkdays,
        assignedAt: toIsoOrNull(step.assignedAt),
        deadlineAt: toIsoOrNull(step.deadlineAt),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const startContractApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({ where: { id } });

    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    requireStartFields(contract);

    if (contract.status === ContractStatus.IN_APPROVAL) {
      const existingSteps = await stepRepository.find({
        where: { contractId: contract.id },
        order: { orderNo: 'ASC' },
      });
      if (existingSteps.some((step) => !step.decision)) {
        res.json({ message: 'Маршрут уже запущен' });
        return;
      }
    }

    const routeRoles = buildRouteRoles(contract);
    const stepsPayload: Array<Partial<ContractApprovalStep>> = [];
    const now = new Date();

    for (let index = 0; index < routeRoles.length; index += 1) {
      const roleCode = routeRoles[index];
      const approverUserId = await resolveApproverUserId(roleCode, contract);
      const slaWorkdays = await resolveSlaWorkdays(contract, roleCode);
      const approverSchedule = await resolveEffectiveWorkSchedule(roleCode, approverUserId);
      const isFirstStep = index === 0;
      const assignedAt = isFirstStep ? now : null;
      const deadlineAt = isFirstStep ? await calculateDeadlineBySchedule(now, slaWorkdays, approverSchedule) : null;

      stepsPayload.push({
        contractId: contract.id,
        roleCode,
        approverUserId,
        orderNo: index + 1,
        acceptedAt: null,
        signedAt: null,
        decision: null,
        comment: null,
        slaWorkdays,
        assignedAt,
        deadlineAt,
        reminderBeforeSentAt: null,
        reminderDeadlineSentAt: null,
        reminderOverdueSentAt: null,
        escalationSentAt: null,
      });
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(ContractApprovalStep, { contractId: contract.id });
      const created = manager.create(ContractApprovalStep, stepsPayload);
      await manager.save(created);

      contract.status = ContractStatus.IN_APPROVAL;
      await manager.save(contract);
    });

    const firstStep = stepsPayload[0] as ContractApprovalStep | undefined;
    if (firstStep) {
      void notifyStepAssigned(contract, firstStep, [firstStep.approverUserId, contract.initiatorId]).catch((error) => {
        logger.error('Failed to send step-assigned notification (startContractApproval):', error);
      });
    }

    res.json({ message: 'Маршрут согласования запущен' });
  } catch (error) {
    next(error);
  }
};

export const decideContractApprovalStep = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, stepId } = req.params;
    const {
      decision,
      comment,
      acceptedAt,
      signedAt,
    } = req.body as {
      decision: ContractApprovalDecision;
      comment?: string | null;
      acceptedAt?: string | null;
      signedAt?: string | null;
    };

    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    if (contract.status !== ContractStatus.IN_APPROVAL) {
      const error: any = new Error('Действия согласования доступны только в статусе "На согласовании"');
      error.statusCode = 400;
      throw error;
    }

    const steps = await stepRepository.find({
      where: { contractId: id },
      order: { orderNo: 'ASC' },
    });

    const step = steps.find((item) => item.id === stepId);
    if (!step) {
      const error: any = new Error('Шаг согласования не найден');
      error.statusCode = 404;
      throw error;
    }

    const currentStep = steps.find((item) => !item.decision);
    if (!currentStep || currentStep.id !== step.id) {
      const error: any = new Error('Можно обработать только текущий шаг согласования');
      error.statusCode = 400;
      throw error;
    }

    if (!req.user?.id) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }
    if (req.user.role !== 'admin' && step.approverUserId !== req.user.id) {
      const error: any = new Error('Действие доступно только текущему согласующему');
      error.statusCode = 403;
      throw error;
    }

    const normalizedComment = comment?.trim() ?? '';
    if ((decision === ContractApprovalDecision.REWORK || decision === ContractApprovalDecision.REJECT) && !normalizedComment) {
      const error: any = new Error('Комментарий обязателен для возврата на доработку и отклонения');
      error.statusCode = 400;
      throw error;
    }

    const acceptedDate = acceptedAt ? new Date(acceptedAt) : new Date();
    const signedDate = signedAt ? new Date(signedAt) : new Date();

    if (Number.isNaN(acceptedDate.getTime()) || Number.isNaN(signedDate.getTime())) {
      const error: any = new Error('Некорректный формат даты');
      error.statusCode = 400;
      throw error;
    }

    step.decision = decision;
    step.comment = normalizedComment || null;
    step.acceptedAt = acceptedDate;
    step.signedAt = signedDate;
    await stepRepository.save(step);

    if (decision === ContractApprovalDecision.REWORK) {
      contract.status = ContractStatus.REWORK;
      await contractRepository.save(contract);
      res.json({ message: 'Договор возвращен на доработку' });
      return;
    }

    if (decision === ContractApprovalDecision.REJECT) {
      contract.status = ContractStatus.REJECTED;
      await contractRepository.save(contract);
      res.json({ message: 'Договор отклонен' });
      return;
    }

    const nextPending = steps
      .filter((item) => !item.decision && item.id !== step.id)
      .sort((a, b) => a.orderNo - b.orderNo)[0];
    const hasPending = Boolean(nextPending);
    contract.status = hasPending ? ContractStatus.IN_APPROVAL : ContractStatus.APPROVED;
    await contractRepository.save(contract);

    if (nextPending) {
      const assignedAt = new Date();
      nextPending.assignedAt = assignedAt;
      const nextSchedule = await resolveEffectiveWorkSchedule(nextPending.roleCode, nextPending.approverUserId);
      nextPending.deadlineAt = await calculateDeadlineBySchedule(
        assignedAt,
        Math.max(1, nextPending.slaWorkdays || 1),
        nextSchedule
      );
      nextPending.reminderBeforeSentAt = null;
      nextPending.reminderDeadlineSentAt = null;
      nextPending.reminderOverdueSentAt = null;
      nextPending.escalationSentAt = null;
      await stepRepository.save(nextPending);
      void notifyStepAssigned(contract, nextPending, [nextPending.approverUserId, contract.initiatorId]).catch((error) => {
        logger.error('Failed to send step-assigned notification (decideContractApprovalStep):', error);
      });
    }

    res.json({ message: contract.status === ContractStatus.APPROVED ? 'Договор согласован' : 'Шаг согласования подтвержден' });
  } catch (error) {
    next(error);
  }
};
