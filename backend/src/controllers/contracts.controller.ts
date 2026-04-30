import { Request, Response, NextFunction } from 'express';
import { IsNull } from 'typeorm';
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
import { User } from '../models/user.model';

const contractRepository = AppDataSource.getRepository(Contract);
const stepRepository = AppDataSource.getRepository(ContractApprovalStep);
const userRepository = AppDataSource.getRepository(User);

const ROLE_LABELS: Record<string, string> = {
  initiator: 'Инициатор',
  security: 'СБ',
  lawyer: 'Юрист',
  chief_accountant: 'Главный бухгалтер',
  financer: 'Финансовый директор',
  general_director: 'Генеральный директор',
};

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function resolveApproverUserId(roleCode: string, contract: Contract): Promise<string> {
  if (roleCode === 'initiator') {
    return contract.initiatorId;
  }

  if (roleCode === 'general_director') {
    if (!contract.assignedGeneralDirectorId) {
      const error: any = new Error('Не выбран назначенный генеральный директор');
      error.statusCode = 400;
      throw error;
    }
    return contract.assignedGeneralDirectorId;
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
    return ['initiator', 'security', 'lawyer', 'chief_accountant', 'financer', 'general_director'];
  }

  if (contract.incomeSubtype === ContractIncomeSubtype.STANDARD) {
    return ['initiator', 'security', 'general_director'];
  }

  return ['initiator', 'security', 'lawyer', 'chief_accountant', 'financer', 'general_director'];
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

  if (!contract.assignedGeneralDirectorId) {
    const error: any = new Error('Не выбран назначенный генеральный директор');
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

export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contracts = await contractRepository.find({
      relations: ['initiator', 'parentContract', 'assignedGeneralDirector'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    res.json(contracts.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      contractType: contract.contractType,
      incomeSubtype: contract.incomeSubtype,
      counterpartyName: contract.counterpartyName,
      counterpartyShortName: contract.counterpartyShortName,
      ownershipForm: contract.ownershipForm,
      counterpartyInn: contract.counterpartyInn,
      templateKind: contract.templateKind,
      subject: contract.subject,
      contractDate: contract.contractDate ? contract.contractDate.toISOString().slice(0, 10) : null,
      psrFlag: contract.psrFlag,
      signingMethod: contract.signingMethod,
      status: contract.status,
      documentKind: contract.documentKind,
      parentContractId: contract.parentContractId,
      parentContractNumber: contract.parentContract?.contractNumber ?? null,
      assignedGeneralDirectorId: contract.assignedGeneralDirectorId,
      assignedGeneralDirector: contract.assignedGeneralDirector
        ? { id: contract.assignedGeneralDirector.id, fullName: contract.assignedGeneralDirector.fullName }
        : null,
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
      counterpartyInn,
      templateKind,
      subject,
      contractDate,
      psrFlag,
      signingMethod,
      assignedGeneralDirectorId,
      documentKind,
      parentContractId,
    } = req.body as {
      contractNumber: string;
      contractType: ContractType;
      incomeSubtype?: ContractIncomeSubtype | null;
      counterpartyName: string;
      counterpartyShortName?: string | null;
      ownershipForm?: string | null;
      counterpartyInn: string;
      templateKind?: ContractTemplateKind;
      subject?: string | null;
      contractDate?: string | null;
      psrFlag?: boolean;
      signingMethod?: ContractSigningMethod;
      assignedGeneralDirectorId?: string | null;
      documentKind?: ContractDocumentKind;
      parentContractId?: string | null;
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

    if (assignedGeneralDirectorId) {
      const gd = await userRepository.findOne({ where: { id: assignedGeneralDirectorId, isActive: true } });
      if (!gd || (gd.role !== 'general_director' && gd.role !== 'director')) {
        const error: any = new Error('Назначенный ГД должен иметь роль general_director или director');
        error.statusCode = 400;
        throw error;
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

    const contract = contractRepository.create({
      contractNumber: contractNumber.trim(),
      contractType,
      incomeSubtype: normalizedIncomeSubtype,
      counterpartyName: counterpartyName.trim(),
      counterpartyShortName: counterpartyShortName?.trim() || null,
      ownershipForm: ownershipForm?.trim() || null,
      counterpartyInn: counterpartyInn.trim(),
      templateKind: templateKind ?? ContractTemplateKind.TYPICAL,
      subject: subject?.trim() || null,
      contractDate: parsedContractDate,
      psrFlag: normalizedPsrFlag,
      signingMethod: signingMethod ?? ContractSigningMethod.POST,
      status: ContractStatus.DRAFT,
      assignedGeneralDirectorId: assignedGeneralDirectorId || null,
      documentKind: normalizedDocumentKind,
      parentContractId: parentContractId || null,
      initiatorId: req.user.id,
    });

    const saved = await contractRepository.save(contract);

    res.status(201).json({ id: saved.id });
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
        contractDate: contract.contractDate ? contract.contractDate.toISOString().slice(0, 10) : null,
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

    const routeRoles = buildRouteRoles(contract);
    const stepsPayload: Array<Partial<ContractApprovalStep>> = [];

    for (let index = 0; index < routeRoles.length; index += 1) {
      const roleCode = routeRoles[index];
      const approverUserId = await resolveApproverUserId(roleCode, contract);

      stepsPayload.push({
        contractId: contract.id,
        roleCode,
        approverUserId,
        orderNo: index + 1,
        acceptedAt: null,
        signedAt: null,
        decision: null,
        comment: null,
      });
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(ContractApprovalStep, { contractId: contract.id });
      const created = manager.create(ContractApprovalStep, stepsPayload);
      await manager.save(created);

      contract.status = ContractStatus.IN_APPROVAL;
      await manager.save(contract);
    });

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

    const hasPending = steps.some((item) => !item.decision && item.id !== step.id);
    contract.status = hasPending ? ContractStatus.IN_APPROVAL : ContractStatus.APPROVED;
    await contractRepository.save(contract);

    res.json({ message: contract.status === ContractStatus.APPROVED ? 'Договор согласован' : 'Шаг согласования подтвержден' });
  } catch (error) {
    next(error);
  }
};
