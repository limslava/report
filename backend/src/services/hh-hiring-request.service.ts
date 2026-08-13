import { AppDataSource } from '../config/data-source';
import {
  HH_HIRING_REQUEST_STATUSES,
  HH_REJECTION_REASON_CODES,
  HH_SUBMISSION_DECISIONS,
  HhHiringRequestStatus,
  HhSubmissionDecision,
  rejectionReasonLabel,
} from '../constants/hh';
import { HhCandidate } from '../models/hh-candidate.model';
import { HhCandidateSubmission } from '../models/hh-candidate-submission.model';
import { HhHiringRequest } from '../models/hh-hiring-request.model';
import { User } from '../models/user.model';
import { hasHhCapability } from './hh-access.service';
import { HhVacancy } from '../models/hh-vacancy.model';
import { notifyRequestAuthorAboutSubmissions } from './hh-notification.service';
import { isHrAnonymousScreeningEnabled } from '../config/env';

const requestRepo = () => AppDataSource.getRepository(HhHiringRequest);
const submissionRepo = () => AppDataSource.getRepository(HhCandidateSubmission);
const candidateRepo = () => AppDataSource.getRepository(HhCandidate);

function fail(message: string, statusCode: number): never {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function text(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function intOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail('Числовые поля должны быть целыми и неотрицательными', 400);
  return parsed;
}

function dateText(value: unknown): string | null | undefined {
  const normalized = text(value);
  if (normalized === undefined || normalized === null) return normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) fail('Дата должна быть в формате YYYY-MM-DD', 400);
  return normalized;
}

const isRecruiter = (user?: User) => hasHhCapability(user, 'hr.recruiting');

/**
 * Профессиональный профиль кандидата для автора заявки.
 *
 * Показ резюме нанимающему руководителю внутри своей компании — это обработка
 * тем же оператором, а не передача третьим лицам, и закон её не запрещает.
 * Работает принцип соответствия объёма целям обработки (ст. 5 ч. 5 152-ФЗ),
 * поэтому состав полей определён целью «решить, подходит ли кандидат»:
 *
 * - ФИО, фото и возраст **отдаём**: руководитель всё равно увидит человека на
 *   собеседовании, а узнавание бывшего коллеги или знакомого — часть решения
 *   о найме, то есть у этих полей есть цель;
 * - телефон, email и мессенджеры **не отдаём**: связь с кандидатом организует
 *   рекрутер, автору заявки контакты для отбора не нужны.
 *
 * Если политика обработки ПДн компании предписывает слепой отбор, включается
 * `HR_ANONYMOUS_SCREENING=true` — тогда скрываются ФИО и фото.
 *
 * Обязательные организационные условия (вне кода): автор заявки внесён в
 * перечень лиц, допущенных к обработке ПДн; доступ только к своей заявке
 * (проверяется в `loadRequestForViewer`); обращения пишутся в журнал действий.
 */
function professionalProfile(candidate: HhCandidate, index: number, viewer?: User) {
  const anonymous = isHrAnonymousScreeningEnabled() && !hasHhCapability(viewer, 'hr.pii.view');
  return {
    candidateId: candidate.id,
    label: `Кандидат ${index + 1}`,
    fullName: anonymous ? null : candidate.fullName,
    photoUrl: anonymous ? null : candidate.photoUrl,
    age: candidate.age,
    anonymous,
    position: candidate.position,
    city: candidate.city,
    desiredSalary: candidate.desiredSalary,
    experienceText: candidate.experienceText,
    skillsText: candidate.skillsText,
    educationText: candidate.educationText,
    source: candidate.source,
  };
}

function serializeSubmission(
  submission: HhCandidateSubmission,
  index: number,
  viewer?: User,
) {
  const withPii = hasHhCapability(viewer, 'hr.pii.view');
  return {
    id: submission.id,
    requestId: submission.requestId,
    decision: submission.decision,
    decisionReasonCode: submission.decisionReasonCode,
    decisionReasonLabel: rejectionReasonLabel(submission.decisionReasonCode),
    decisionComment: submission.decisionComment,
    decidedByName: submission.decidedByUser?.fullName ?? null,
    decidedAt: submission.decidedAt,
    recruiterNote: submission.recruiterNote,
    submittedByName: submission.submittedByUser?.fullName ?? null,
    createdAt: submission.createdAt,
    // Контакты (телефон, email, мессенджеры) автору заявки не передаются
    // никогда: связь с кандидатом организует рекрутер.
    candidateName: withPii ? (submission.candidate?.fullName ?? null) : null,
    candidate: submission.candidate
      ? professionalProfile(submission.candidate, index, viewer)
      : null,
  };
}

export function serializeHiringRequest(
  request: HhHiringRequest,
  viewer?: User,
  options: { withSubmissions?: boolean } = {},
) {
  const submissions = request.submissions ?? [];
  return {
    id: request.id,
    position: request.position,
    department: request.department,
    city: request.city,
    headcount: request.headcount,
    reason: request.reason,
    requirements: request.requirements,
    responsibilities: request.responsibilities,
    salaryFrom: request.salaryFrom,
    salaryTo: request.salaryTo,
    neededBy: request.neededBy,
    status: request.status,
    recruiterComment: request.recruiterComment,
    createdByUserId: request.createdByUserId,
    createdByName: request.createdByUser?.fullName ?? null,
    assignedRecruiterId: request.assignedRecruiterId,
    assignedRecruiterName: request.assignedRecruiter?.fullName ?? null,
    vacancyId: request.vacancyId,
    vacancyTitle: request.vacancy?.title ?? null,
    submissionsTotal: submissions.length,
    submissionsPending: submissions.filter((item) => item.decision === 'pending').length,
    submissionsApproved: submissions.filter((item) => item.decision === 'approved').length,
    // Самая старая нерассмотренная отправка — для SLA-подсветки «ждёт N дней».
    pendingSince: (() => {
      const pending = submissions.filter((item) => item.decision === 'pending');
      if (!pending.length) return null;
      return new Date(Math.min(...pending.map((item) => new Date(item.createdAt).getTime())));
    })(),
    submissions: options.withSubmissions
      ? submissions.map((item, index) => serializeSubmission(item, index, viewer))
      : undefined,
    closedAt: request.closedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

/** Рекрутер видит все заявки, руководитель — только свои. */
export async function listHiringRequests(
  params: { status?: string },
  viewer?: User,
) {
  const query = requestRepo()
    .createQueryBuilder('request')
    .leftJoinAndSelect('request.createdByUser', 'createdByUser')
    .leftJoinAndSelect('request.assignedRecruiter', 'assignedRecruiter')
    .leftJoinAndSelect('request.vacancy', 'vacancy')
    .leftJoinAndSelect('request.submissions', 'submissions')
    .orderBy('request.createdAt', 'DESC');

  if (!isRecruiter(viewer)) {
    query.andWhere('request.createdByUserId = :userId', { userId: viewer?.id ?? null });
  }
  if (params.status) {
    query.andWhere('request.status = :status', { status: params.status });
  }

  const requests = await query.getMany();
  return requests.map((request) => serializeHiringRequest(request, viewer));
}

async function loadRequestForViewer(id: string, viewer?: User) {
  const request = await requestRepo().findOne({
    where: { id },
    relations: {
      createdByUser: true,
      assignedRecruiter: true,
      vacancy: true,
      submissions: { candidate: true, submittedByUser: true, decidedByUser: true },
    },
  });
  if (!request) fail('Заявка на подбор не найдена', 404);
  if (!isRecruiter(viewer) && request.createdByUserId !== viewer?.id) {
    // Чужую заявку не показываем даже руководителю: в ней данные кандидатов.
    fail('Заявка на подбор не найдена', 404);
  }
  return request;
}

export async function getHiringRequest(id: string, viewer?: User) {
  const request = await loadRequestForViewer(id, viewer);
  return serializeHiringRequest(request, viewer, { withSubmissions: true });
}

export async function createHiringRequest(payload: Record<string, unknown>, author?: User) {
  const position = text(payload.position);
  if (!position) fail('Укажите должность, которую нужно найти', 400);

  const request = requestRepo().create({
    position,
    department: text(payload.department) ?? null,
    city: text(payload.city) ?? null,
    headcount: intOrNull(payload.headcount) ?? 1,
    reason: text(payload.reason) ?? null,
    requirements: text(payload.requirements) ?? null,
    responsibilities: text(payload.responsibilities) ?? null,
    salaryFrom: intOrNull(payload.salaryFrom) ?? null,
    salaryTo: intOrNull(payload.salaryTo) ?? null,
    neededBy: dateText(payload.neededBy) ?? null,
    status: 'new',
    createdByUserId: author?.id ?? null,
  });
  const saved = await requestRepo().save(request);
  return getHiringRequest(saved.id, author);
}

export async function updateHiringRequest(id: string, payload: Record<string, unknown>, viewer?: User) {
  const request = await loadRequestForViewer(id, viewer);
  const recruiter = isRecruiter(viewer);

  if (!recruiter) {
    // Автор правит только пока заявку не взяли в работу.
    if (request.status !== 'new') {
      fail('Заявку уже взяли в работу, изменения вносит рекрутер', 409);
    }
  }

  const simple: Array<[keyof HhHiringRequest, unknown]> = [
    ['position', payload.position],
    ['department', payload.department],
    ['city', payload.city],
    ['reason', payload.reason],
    ['requirements', payload.requirements],
    ['responsibilities', payload.responsibilities],
  ];
  for (const [field, value] of simple) {
    const normalized = text(value);
    if (normalized !== undefined) (request as any)[field] = normalized;
  }
  const headcount = intOrNull(payload.headcount);
  if (headcount !== undefined && headcount !== null) request.headcount = headcount;
  const salaryFrom = intOrNull(payload.salaryFrom);
  if (salaryFrom !== undefined) request.salaryFrom = salaryFrom;
  const salaryTo = intOrNull(payload.salaryTo);
  if (salaryTo !== undefined) request.salaryTo = salaryTo;
  const neededBy = dateText(payload.neededBy);
  if (neededBy !== undefined) request.neededBy = neededBy;

  // Статус, ответственного, привязку вакансии и комментарий ведёт только рекрутер.
  if (recruiter) {
    if (payload.status !== undefined) {
      const status = String(payload.status) as HhHiringRequestStatus;
      if (!(HH_HIRING_REQUEST_STATUSES as readonly string[]).includes(status)) {
        fail('Недопустимый статус заявки', 400);
      }
      request.status = status;
      request.closedAt = status === 'closed' || status === 'cancelled' ? new Date() : null;
    }
    const recruiterComment = text(payload.recruiterComment);
    if (recruiterComment !== undefined) request.recruiterComment = recruiterComment;
    const assignedRecruiterId = text(payload.assignedRecruiterId);
    if (assignedRecruiterId !== undefined) request.assignedRecruiterId = assignedRecruiterId;
    const vacancyId = text(payload.vacancyId);
    if (vacancyId !== undefined) request.vacancyId = vacancyId;
  }

  await requestRepo().save(request);
  return getHiringRequest(request.id, viewer);
}

/** Рекрутер отправляет автору заявки подобранных кандидатов. */
export async function submitCandidatesToRequest(
  requestId: string,
  payload: { candidateIds?: unknown; recruiterNote?: unknown },
  recruiter?: User,
) {
  const request = await requestRepo().findOne({ where: { id: requestId } });
  if (!request) fail('Заявка на подбор не найдена', 404);

  const rawIds = Array.isArray(payload.candidateIds) ? payload.candidateIds : [];
  const candidateIds = [...new Set(rawIds.map((value) => String(value)))].filter(Boolean);
  if (!candidateIds.length) fail('Выберите хотя бы одного кандидата', 400);
  if (candidateIds.length > 50) fail('За один раз можно отправить не более 50 кандидатов', 400);

  const candidates = await candidateRepo().findByIds(candidateIds);
  if (candidates.length !== candidateIds.length) fail('Часть кандидатов не найдена', 404);

  const note = text(payload.recruiterNote) ?? null;
  const existing = await submissionRepo().find({ where: { requestId } });
  const alreadySent = new Set(existing.map((item) => item.candidateId));

  const created = candidateIds
    .filter((candidateId) => !alreadySent.has(candidateId))
    .map((candidateId) => submissionRepo().create({
      requestId,
      candidateId,
      recruiterNote: note,
      submittedByUserId: recruiter?.id ?? null,
      decision: 'pending' as HhSubmissionDecision,
    }));

  if (created.length) {
    await submissionRepo().save(created);
    // Автора заявки уведомляем письмом; сбой почты не мешает операции.
    void notifyRequestAuthorAboutSubmissions(requestId, created.length);
  }
  // Отправка кандидатов означает, что заявка в работе.
  if (request.status === 'new') {
    request.status = 'in_progress';
    if (!request.assignedRecruiterId) request.assignedRecruiterId = recruiter?.id ?? null;
    await requestRepo().save(request);
  }

  return {
    submitted: created.length,
    skipped: candidateIds.length - created.length,
    request: await getHiringRequest(requestId, recruiter),
  };
}

/**
 * Создать вакансию по заявке одной кнопкой: поля переносятся из заявки,
 * вакансия привязывается к ней, заявка переходит в работу.
 */
export async function createVacancyFromRequest(requestId: string, recruiter?: User) {
  const request = await requestRepo().findOne({ where: { id: requestId } });
  if (!request) fail('Заявка на подбор не найдена', 404);
  if (request.vacancyId) fail('По этой заявке вакансия уже создана', 409);

  const vacancyRepository = AppDataSource.getRepository(HhVacancy);
  const vacancy = await vacancyRepository.save(vacancyRepository.create({
    title: request.position,
    department: request.department,
    city: request.city,
    salaryFrom: request.salaryFrom,
    salaryTo: request.salaryTo,
    requirements: request.requirements,
    responsibilities: request.responsibilities,
    openedAt: new Date().toISOString().slice(0, 10),
    targetCloseAt: request.neededBy,
    status: 'open',
    source: 'manual',
    createdByUserId: recruiter?.id ?? null,
  }));

  request.vacancyId = vacancy.id;
  if (request.status === 'new') request.status = 'in_progress';
  if (!request.assignedRecruiterId) request.assignedRecruiterId = recruiter?.id ?? null;
  await requestRepo().save(request);

  return getHiringRequest(requestId, recruiter);
}

/** Автор заявки отмечает, кого берёт в работу дальше. */
export async function decideSubmission(
  submissionId: string,
  payload: { decision?: unknown; comment?: unknown; reasonCode?: unknown },
  viewer?: User,
) {
  const submission = await submissionRepo().findOne({
    where: { id: submissionId },
    relations: { request: true },
  });
  if (!submission) fail('Кандидат не найден в заявке', 404);

  const isAuthor = submission.request?.createdByUserId === viewer?.id;
  if (!isAuthor && !isRecruiter(viewer)) {
    fail('Решение по кандидату принимает автор заявки', 403);
  }

  const decision = String(payload.decision ?? '') as HhSubmissionDecision;
  if (!(HH_SUBMISSION_DECISIONS as readonly string[]).includes(decision)) {
    fail('Недопустимое решение', 400);
  }
  const comment = text(payload.comment) ?? null;
  const reasonCode = text(payload.reasonCode) ?? null;
  if (decision === 'rejected') {
    // Причина — код из справочника (для отчётности); свободный комментарий
    // обязателен только для «Другое».
    if (!reasonCode || !(HH_REJECTION_REASON_CODES as readonly string[]).includes(reasonCode)) {
      fail('Укажите причину отказа из справочника', 400);
    }
    if (reasonCode === 'other' && !comment) {
      fail('Для причины «Другое» комментарий обязателен', 400);
    }
  }

  submission.decision = decision;
  submission.decisionReasonCode = decision === 'rejected' ? reasonCode : null;
  submission.decisionComment = comment;
  submission.decidedByUserId = viewer?.id ?? null;
  submission.decidedAt = decision === 'pending' ? null : new Date();
  await submissionRepo().save(submission);

  return getHiringRequest(submission.requestId, viewer);
}
