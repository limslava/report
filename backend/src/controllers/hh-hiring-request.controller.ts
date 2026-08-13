import { Request, Response, NextFunction } from 'express';
import {
  createHiringRequest,
  createVacancyFromRequest,
  decideSubmission,
  getHiringRequest,
  listHiringRequests,
  submitCandidatesToRequest,
  updateHiringRequest,
} from '../services/hh-hiring-request.service';
import { recordAuditLog } from '../services/audit-log.service';

export const listRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listHiringRequests({
      status: req.query.status ? String(req.query.status) : undefined,
    }, req.user));
  } catch (error) {
    next(error);
  }
};

export const getRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getHiringRequest(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
};

export const createRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const created = await createHiringRequest(req.body, req.user);
    await recordAuditLog({
      action: 'hr.hiring_request.create',
      userId: req.user?.id ?? null,
      entityType: 'hh_hiring_request',
      entityId: created.id,
      details: { position: created.position, headcount: created.headcount },
      req,
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const updateRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await updateHiringRequest(req.params.id, req.body, req.user));
  } catch (error) {
    next(error);
  }
};

export const convertRequestToVacancy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createVacancyFromRequest(req.params.id, req.user);
    await recordAuditLog({
      action: 'hr.hiring_request.create_vacancy',
      userId: req.user?.id ?? null,
      entityType: 'hh_hiring_request',
      entityId: req.params.id,
      details: { vacancyId: result.vacancyId },
      req,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const submitCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await submitCandidatesToRequest(req.params.id, req.body, req.user);
    // Передача профилей кандидатов автору заявки — операция с ПДн, фиксируем.
    await recordAuditLog({
      action: 'hr.hiring_request.submit_candidates',
      userId: req.user?.id ?? null,
      entityType: 'hh_hiring_request',
      entityId: req.params.id,
      details: { submitted: result.submitted, skipped: result.skipped },
      req,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const decideOnSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await decideSubmission(req.params.submissionId, req.body, req.user);
    await recordAuditLog({
      action: 'hr.hiring_request.decision',
      userId: req.user?.id ?? null,
      entityType: 'hh_candidate_submission',
      entityId: req.params.submissionId,
      details: { decision: req.body?.decision ?? null },
      req,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};
