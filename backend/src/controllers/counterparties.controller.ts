import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/data-source';
import { Counterparty } from '../models/counterparty.model';
import { fetchCounterpartyFromFnsByInn } from '../services/fns-egrul.service';

const counterpartyRepository = AppDataSource.getRepository(Counterparty);

export const resolveCounterpartyByInn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inn = String(req.query.inn ?? '').trim();
    if (!/^\d{10}$|^\d{12}$/.test(inn)) {
      const error: any = new Error('ИНН должен содержать 10 или 12 цифр');
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

    const fns = await fetchCounterpartyFromFnsByInn(inn);
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
