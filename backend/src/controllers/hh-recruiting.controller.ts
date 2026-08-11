import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret, getHhImportTokenTtlDays } from '../config/env';
import { HR_IMPORT_TOKEN_SCOPE } from '../middleware/authenticate-hr-import';
import {
  anonymizeHhCandidate,
  addHhCandidateEvent,
  createHhCandidate,
  createHhVacancy,
  getHhCandidate,
  getHhBadges,
  getHhDashboard,
  importFarpostCandidate,
  listHhCandidates,
  listHhInterviews,
  listHhVacancies,
  updateHhCandidate,
  updateHhVacancy,
} from '../services/hh-recruiting.service';
import { canViewHrCandidatePiiBackend } from '../services/hh-access.service';
import { recordAuditLog } from '../services/audit-log.service';

const str = (value: unknown) => (value ? String(value) : undefined);

export const listVacancies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listHhVacancies({
      q: str(req.query.q),
      status: str(req.query.status),
      page: req.query.page,
      perPage: req.query.perPage,
    }));
  } catch (error) {
    next(error);
  }
};

export const createVacancy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await createHhVacancy(req.body, req.user));
  } catch (error) {
    next(error);
  }
};

export const updateVacancy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await updateHhVacancy(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
};

export const listCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listHhCandidates({
      q: str(req.query.q),
      stage: str(req.query.stage),
      status: str(req.query.status),
      vacancyId: str(req.query.vacancyId),
      page: req.query.page,
      perPage: req.query.perPage,
    }, req.user));
  } catch (error) {
    next(error);
  }
};

export const createCandidate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidate = await createHhCandidate(req.body, req.user);
    await recordAuditLog({
      action: 'hr.candidate.create',
      userId: req.user?.id ?? null,
      entityType: 'hh_candidate',
      entityId: candidate.id,
      details: { source: candidate.source },
      req,
    });
    res.status(201).json(candidate);
  } catch (error) {
    next(error);
  }
};

export const importFarpostResume = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await importFarpostCandidate(req.body, req.user);
    // Импорт резюме с внешней площадки — операция с персональными данными,
    // фиксируем её в журнале действий (без самих ПДн в details).
    await recordAuditLog({
      action: 'hr.candidate.import.farpost',
      userId: req.user?.id ?? null,
      entityType: 'hh_candidate',
      entityId: result.candidate.id,
      details: {
        sourceUrl: result.parsed.sourceUrl ?? null,
        resumeKey: result.parsed.resumeKey ?? null,
        duplicatesFound: result.duplicates.length,
      },
      req,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateCandidate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await updateHhCandidate(req.params.id, req.body, req.user));
  } catch (error) {
    next(error);
  }
};

export const getCandidate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidate = await getHhCandidate(req.params.id, req.user);
    if (canViewHrCandidatePiiBackend(req.user)) {
      await recordAuditLog({
        action: 'hr.candidate.view_pii',
        userId: req.user?.id ?? null,
        entityType: 'hh_candidate',
        entityId: req.params.id,
        req,
      });
    }
    res.json(candidate);
  } catch (error) {
    next(error);
  }
};

export const addCandidateEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await addHhCandidateEvent(req.params.id, req.body, req.user));
  } catch (error) {
    next(error);
  }
};

export const listInterviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listHhInterviews({
      from: str(req.query.from),
      to: str(req.query.to),
      page: req.query.page,
      perPage: req.query.perPage,
    }, req.user));
  } catch (error) {
    next(error);
  }
};

export const anonymizeCandidate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidate = await anonymizeHhCandidate(req.params.id, req.user);
    // Обезличивание — юридически значимое действие (ст. 21 152-ФЗ), фиксируем.
    await recordAuditLog({
      action: 'hr.candidate.anonymize',
      userId: req.user?.id ?? null,
      entityType: 'hh_candidate',
      entityId: req.params.id,
      req,
    });
    res.json(candidate);
  } catch (error) {
    next(error);
  }
};

export const issueImportToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ttlDays = getHhImportTokenTtlDays();
    const token = jwt.sign(
      { id: req.user!.id, scope: HR_IMPORT_TOKEN_SCOPE },
      getJwtSecret(),
      { expiresIn: `${ttlDays}d` },
    );
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    await recordAuditLog({
      action: 'hr.import_token.issue',
      userId: req.user?.id ?? null,
      details: { ttlDays },
      req,
    });
    res.json({ token, expiresAt, ttlDays });
  } catch (error) {
    next(error);
  }
};

export const getBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getHhBadges(req.user));
  } catch (error) {
    next(error);
  }
};

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getHhDashboard(req.user));
  } catch (error) {
    next(error);
  }
};
