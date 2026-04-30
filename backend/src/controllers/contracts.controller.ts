import { Request, Response, NextFunction } from 'express';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Contract, ContractDocumentKind, ContractType } from '../models/contract.model';

const contractRepository = AppDataSource.getRepository(Contract);

export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contracts = await contractRepository.find({
      relations: ['initiator', 'parentContract'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    res.json(contracts.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      contractType: contract.contractType,
      counterpartyName: contract.counterpartyName,
      counterpartyShortName: contract.counterpartyShortName,
      ownershipForm: contract.ownershipForm,
      counterpartyInn: contract.counterpartyInn,
      documentKind: contract.documentKind,
      parentContractId: contract.parentContractId,
      parentContractNumber: contract.parentContract?.contractNumber ?? null,
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
      counterpartyName,
      counterpartyShortName,
      ownershipForm,
      counterpartyInn,
      documentKind,
      parentContractId,
    } = req.body as {
      contractNumber: string;
      contractType: ContractType;
      counterpartyName: string;
      counterpartyShortName?: string;
      ownershipForm?: string;
      counterpartyInn: string;
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

    const contract = contractRepository.create({
      contractNumber: contractNumber.trim(),
      contractType,
      counterpartyName: counterpartyName.trim(),
      counterpartyShortName: counterpartyShortName?.trim() || null,
      ownershipForm: ownershipForm?.trim() || null,
      counterpartyInn: counterpartyInn.trim(),
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
