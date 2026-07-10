import { Request, Response, NextFunction } from 'express';
import { ILike } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Counterparty } from '../models/counterparty.model';
import { Contract } from '../models/contract.model';
import {
  fetchCounterpartyFromFnsByInn,
  fetchCounterpartyFromFnsByName,
  FnsServiceUnavailableError,
} from '../services/fns-egrul.service';

const counterpartyRepository = AppDataSource.getRepository(Counterparty);
const contractRepository = AppDataSource.getRepository(Contract);

export const resolveCounterpartyByInn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inn = String(req.query.inn ?? '').trim();
    if (!/^\d{10}$|^\d{12}$|^\d{13}$|^\d{15}$/.test(inn)) {
      const error: any = new Error('Идентификатор должен содержать 10/12 (ИНН) или 13/15 (ОГРН/ОГРНИП) цифр');
      error.statusCode = 400;
      throw error;
    }

    const local = await counterpartyRepository.findOne({ where: { inn } });
    if (local) {
      res.json({
        source: 'directory',
        data: {
          inn: local.inn,
          nameFull: local.nameFull,
          nameShort: local.nameShort,
          counterpartyForm: local.counterpartyForm,
          ogrn: local.ogrn,
          kpp: local.kpp,
          address: local.address,
        },
      });
      return;
    }

    const fromContracts = await contractRepository.findOne({
      where: { counterpartyInn: inn },
      order: { updatedAt: 'DESC' },
    });
    if (fromContracts) {
      res.json({
        source: 'contracts',
        data: {
          inn: fromContracts.counterpartyInn,
          nameFull: fromContracts.counterpartyName,
          nameShort: fromContracts.counterpartyShortName,
          counterpartyForm: fromContracts.counterpartyForm,
          ogrn: null,
          kpp: null,
          address: null,
        },
      });
      return;
    }

    let fns = null;
    try {
      fns = await fetchCounterpartyFromFnsByInn(inn);
    } catch (error) {
      if (error instanceof FnsServiceUnavailableError) {
        res.status(503).json({ message: 'Сервис ФНС временно недоступен, заполните данные вручную или попробуйте позже' });
        return;
      }
      throw error;
    }
    if (!fns) {
      res.status(404).json({ message: 'Контрагент по ИНН не найден' });
      return;
    }

    const saved = await counterpartyRepository.save(counterpartyRepository.create({
      inn: fns.inn,
      nameFull: fns.nameFull,
      nameShort: fns.nameShort,
      counterpartyForm: fns.counterpartyForm,
      ogrn: fns.ogrn,
      kpp: fns.kpp,
      address: fns.address,
      source: 'fns',
      sourcePayload: fns.sourcePayload,
    }));

    res.json({
      source: 'fns',
      data: {
        inn: saved.inn,
        nameFull: saved.nameFull,
        nameShort: saved.nameShort,
        counterpartyForm: saved.counterpartyForm,
        ogrn: saved.ogrn,
        kpp: saved.kpp,
        address: saved.address,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resolveCounterpartyByName = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.query.name ?? '').trim();
    if (name.length < 2) {
      const error: any = new Error('Наименование должно содержать минимум 2 символа');
      error.statusCode = 400;
      throw error;
    }

    const local = await counterpartyRepository.findOne({
      where: [
        { nameFull: ILike(`%${name}%`) },
        { nameShort: ILike(`%${name}%`) },
      ],
      order: { updatedAt: 'DESC' },
    });
    if (local) {
      res.json({
        source: 'directory',
        data: {
          inn: local.inn,
          nameFull: local.nameFull,
          nameShort: local.nameShort,
          counterpartyForm: local.counterpartyForm,
          ogrn: local.ogrn,
          kpp: local.kpp,
          address: local.address,
        },
      });
      return;
    }

    const contractMatch = await contractRepository.findOne({
      where: [
        { counterpartyName: ILike(`%${name}%`) },
        { counterpartyShortName: ILike(`%${name}%`) },
      ],
      order: { updatedAt: 'DESC' },
    });
    if (contractMatch) {
      res.json({
        source: 'contracts',
        data: {
          inn: contractMatch.counterpartyInn,
          nameFull: contractMatch.counterpartyName,
          nameShort: contractMatch.counterpartyShortName,
          counterpartyForm: contractMatch.counterpartyForm,
          ogrn: null,
          kpp: null,
          address: null,
        },
      });
      return;
    }

    let fns = null;
    try {
      fns = await fetchCounterpartyFromFnsByName(name);
    } catch (error) {
      if (error instanceof FnsServiceUnavailableError) {
        res.status(503).json({ message: 'Сервис ФНС временно недоступен, заполните данные вручную или попробуйте позже' });
        return;
      }
      throw error;
    }
    if (!fns) {
      res.status(404).json({ message: 'Контрагент по наименованию не найден' });
      return;
    }

    const existingByInn = await counterpartyRepository.findOne({ where: { inn: fns.inn } });
    const entity = existingByInn
      ? counterpartyRepository.merge(existingByInn, {
          nameFull: fns.nameFull,
          nameShort: fns.nameShort,
          counterpartyForm: fns.counterpartyForm,
          ogrn: fns.ogrn,
          kpp: fns.kpp,
          address: fns.address,
          source: 'fns',
          sourcePayload: fns.sourcePayload,
        })
      : counterpartyRepository.create({
          inn: fns.inn,
          nameFull: fns.nameFull,
          nameShort: fns.nameShort,
          counterpartyForm: fns.counterpartyForm,
          ogrn: fns.ogrn,
          kpp: fns.kpp,
          address: fns.address,
          source: 'fns',
          sourcePayload: fns.sourcePayload,
        });

    const saved = await counterpartyRepository.save(entity);
    res.json({
      source: 'fns',
      data: {
        inn: saved.inn,
        nameFull: saved.nameFull,
        nameShort: saved.nameShort,
        counterpartyForm: saved.counterpartyForm,
        ogrn: saved.ogrn,
        kpp: saved.kpp,
        address: saved.address,
      },
    });
  } catch (error) {
    next(error);
  }
};
