import { Request, Response, NextFunction } from 'express';
import { ILike } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Counterparty } from '../models/counterparty.model';
import { Contract } from '../models/contract.model';
import {
  fetchCounterpartyFromFnsByInn,
  fetchCounterpartyFromFnsByName,
  FnsServiceUnavailableError,
  normalizeFnsSignerName,
} from '../services/fns-egrul.service';

const counterpartyRepository = AppDataSource.getRepository(Counterparty);
const contractRepository = AppDataSource.getRepository(Contract);

const signerNameFromSourcePayload = (payload: Record<string, unknown> | null | undefined): string | null => {
  const raw = typeof payload?.g === 'string' ? payload.g : '';
  return normalizeFnsSignerName(raw);
};

const hasSuspiciousAddress = (address: string | null | undefined): boolean => (
  !address || /,\s*,/.test(address)
);

const shouldRefreshCounterpartyFromFns = (counterparty: Counterparty): boolean => (
  hasSuspiciousAddress(counterparty.address)
  || !counterparty.ogrn
  || !counterparty.kpp
  || !signerNameFromSourcePayload(counterparty.sourcePayload)
);

async function tryFetchCounterpartyFromFns(query: string) {
  try {
    return await fetchCounterpartyFromFnsByInn(query);
  } catch (error) {
    if (error instanceof FnsServiceUnavailableError) return null;
    throw error;
  }
}

async function enrichLocalCounterpartyFromFns(counterparty: Counterparty): Promise<{ counterparty: Counterparty; signerName: string | null }> {
  if (!shouldRefreshCounterpartyFromFns(counterparty)) {
    return {
      counterparty,
      signerName: signerNameFromSourcePayload(counterparty.sourcePayload),
    };
  }

  const fns = await tryFetchCounterpartyFromFns(counterparty.inn);
  if (!fns) {
    return {
      counterparty,
      signerName: signerNameFromSourcePayload(counterparty.sourcePayload),
    };
  }

  const saved = await counterpartyRepository.save(counterpartyRepository.merge(counterparty, {
    nameFull: counterparty.nameFull || fns.nameFull,
    nameShort: counterparty.nameShort || fns.nameShort,
    counterpartyForm: counterparty.counterpartyForm || fns.counterpartyForm,
    ogrn: counterparty.ogrn || fns.ogrn,
    kpp: counterparty.kpp || fns.kpp,
    address: hasSuspiciousAddress(counterparty.address) ? fns.address : counterparty.address,
    source: 'fns',
    sourcePayload: fns.sourcePayload,
  }));

  return {
    counterparty: saved,
    signerName: fns.signerName,
  };
}

async function saveFnsCounterparty(fns: Awaited<ReturnType<typeof fetchCounterpartyFromFnsByInn>>): Promise<Counterparty> {
  if (!fns) {
    throw new Error('FNS counterparty is required');
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

  return counterpartyRepository.save(entity);
}

export const resolveCounterpartyByInn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inn = String(req.query.inn ?? '').trim();
    if (!/^\d{10}$|^\d{12}$|^\d{13}$|^\d{15}$/.test(inn)) {
      const error: any = new Error('Идентификатор должен содержать 10/12 (ИНН) или 13/15 (ОГРН/ОГРНИП) цифр');
      error.statusCode = 400;
      throw error;
    }

    const local = await counterpartyRepository.findOne({
      where: inn.length === 13 || inn.length === 15 ? { ogrn: inn } : { inn },
    });
    if (local) {
      const enriched = await enrichLocalCounterpartyFromFns(local);
      res.json({
        source: enriched.counterparty.source === 'fns' ? 'fns' : 'directory',
        data: {
          inn: enriched.counterparty.inn,
          nameFull: enriched.counterparty.nameFull,
          nameShort: enriched.counterparty.nameShort,
          counterpartyForm: enriched.counterparty.counterpartyForm,
          ogrn: enriched.counterparty.ogrn,
          kpp: enriched.counterparty.kpp,
          address: enriched.counterparty.address,
          signerName: enriched.signerName,
        },
      });
      return;
    }

    const fromContracts = await contractRepository.findOne({
      where: { counterpartyInn: inn },
      order: { updatedAt: 'DESC' },
    });
    if (fromContracts) {
      const fns = await tryFetchCounterpartyFromFns(inn);
      if (fns) {
        await saveFnsCounterparty(fns);
      }
      res.json({
        source: fns ? 'fns' : 'contracts',
        data: {
          inn: fns?.inn ?? fromContracts.counterpartyInn,
          nameFull: fns?.nameFull ?? fromContracts.counterpartyName,
          nameShort: fns?.nameShort ?? fromContracts.counterpartyShortName,
          counterpartyForm: fns?.counterpartyForm ?? fromContracts.counterpartyForm,
          ogrn: fns?.ogrn ?? fromContracts.counterpartyOgrn,
          kpp: fns?.kpp ?? fromContracts.counterpartyKpp,
          address: fns?.address ?? fromContracts.counterpartyLegalAddress,
          signerName: fns?.signerName ?? fromContracts.counterpartySignerName,
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

    const saved = await saveFnsCounterparty(fns);

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
        signerName: fns.signerName,
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
      const enriched = await enrichLocalCounterpartyFromFns(local);
      res.json({
        source: enriched.counterparty.source === 'fns' ? 'fns' : 'directory',
        data: {
          inn: enriched.counterparty.inn,
          nameFull: enriched.counterparty.nameFull,
          nameShort: enriched.counterparty.nameShort,
          counterpartyForm: enriched.counterparty.counterpartyForm,
          ogrn: enriched.counterparty.ogrn,
          kpp: enriched.counterparty.kpp,
          address: enriched.counterparty.address,
          signerName: enriched.signerName,
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
          signerName: contractMatch.counterpartySignerName,
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

    const saved = await saveFnsCounterparty(fns);
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
        signerName: fns.signerName,
      },
    });
  } catch (error) {
    next(error);
  }
};
