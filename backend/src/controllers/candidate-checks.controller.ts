import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '../config/data-source';
import { CandidateCheckAttachment } from '../models/candidate-check-attachment.model';
import { CandidateCheck, CandidateCheckStatus } from '../models/candidate-check.model';
import { User } from '../models/user.model';
import { sendEmailWithAttachment } from '../services/email.service';
import { logger } from '../utils/logger';
import { buildContentDisposition } from '../utils/content-disposition';
import { getDocxPdfPreviewPath, isDocxFile } from '../services/docx-pdf-preview.service';

const HR_RECRUITER_ROLES = new Set(['admin', 'hr_recruiter']);
const SECURITY_DECISION_ROLES = new Set(['admin', 'security']);
const CANDIDATE_CHECK_ROLES = new Set(['security', ...HR_RECRUITER_ROLES]);
const MAX_CANDIDATE_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CANDIDATE_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg']);

const normalizeNullable = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const escapeHtml = (value: string | null | undefined): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeFilename = (name: string): string =>
  name.replace(/[^\w.\-()\u0400-\u04FF ]/g, '_').slice(0, 180) || 'document';

const candidateCheckUrl = (candidateCheckId: string): string => {
  const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://report-limslava.amvera.io').replace(/\/+$/, '');
  const params = new URLSearchParams({ candidateCheckId, source: 'email' });
  return `${frontendBaseUrl}/business-processes/candidate-checks?${params.toString()}`;
};

const openCandidateCheckButton = (url: string): string => {
  const safeUrl = escapeHtml(url);
  return `
    <p style="margin:20px 0 8px">
      <a href="${safeUrl}" style="display:inline-block;padding:10px 16px;border-radius:4px;background:#1976d2;color:#fff;text-decoration:none;font-weight:600">
        Открыть проверку
      </a>
    </p>
    <p style="margin:0;color:#67758a;font-size:12px">Если кнопка не открывается: <a href="${safeUrl}">${safeUrl}</a></p>
  `;
};

const getCandidateChecksUploadRoot = (candidateCheckId: string): string => {
  const configuredRoot = process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(process.cwd(), 'uploads');
  return path.join(configuredRoot, 'candidate-checks', candidateCheckId);
};

const assertAllowedCandidateFile = (file: any, originalName: string, buffer: Buffer): void => {
  const extension = path.extname(originalName).toLowerCase();
  if (!ALLOWED_CANDIDATE_FILE_EXTENSIONS.has(extension)) {
    const error: any = new Error('Разрешены файлы PDF, DOC, DOCX, PNG и JPG');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length === 0 || buffer.length > MAX_CANDIDATE_FILE_BYTES) {
    const error: any = new Error('Размер одного файла должен быть от 1 байта до 20 МБ');
    error.statusCode = 400;
    throw error;
  }
  const declaredSize = Number(file?.size);
  if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== buffer.length) {
    const error: any = new Error('Размер загруженного файла не совпадает с переданными данными');
    error.statusCode = 400;
    throw error;
  }
};

const assertCandidateFiles = (files: any[]): void => {
  for (const file of files) {
    const originalName = normalizeFilename(String(file?.name || 'document'));
    const contentBase64 = String(file?.contentBase64 || '');
    const buffer = Buffer.from(contentBase64, 'base64');
    assertAllowedCandidateFile(file, originalName, buffer);
  }
};

const ensureCandidateCheckAccess = (req: Request) => {
  if (!req.user || !CANDIDATE_CHECK_ROLES.has(req.user.role)) {
    const error: any = new Error('Insufficient permissions');
    error.statusCode = 403;
    throw error;
  }
};

const ensureHrWriteAccess = (req: Request) => {
  if (!req.user || !HR_RECRUITER_ROLES.has(req.user.role)) {
    const error: any = new Error('Создавать проверки кандидатов может только HR или администратор');
    error.statusCode = 403;
    throw error;
  }
};

const ensureSecurityWriteAccess = (req: Request) => {
  if (!req.user || !SECURITY_DECISION_ROLES.has(req.user.role)) {
    const error: any = new Error('Решение по кандидату принимает только руководитель СБ или администратор');
    error.statusCode = 403;
    throw error;
  }
};

const serializeAttachment = (item: CandidateCheckAttachment) => ({
  id: item.id,
  originalName: item.originalName,
  sizeBytes: item.sizeBytes,
  mimeType: item.mimeType,
  createdAt: item.createdAt,
  uploadedByUserId: item.uploadedByUserId,
});

const serializeCandidateCheck = (item: CandidateCheck) => ({
  id: item.id,
  candidateFullName: item.candidateFullName,
  position: item.position,
  phone: item.phone,
  email: item.email,
  hrComment: item.hrComment,
  status: item.status,
  securityComment: item.securityComment,
  createdByUserId: item.createdByUserId,
  createdByName: item.createdByUser?.fullName ?? null,
  decidedByUserId: item.decidedByUserId,
  decidedByName: item.decidedByUser?.fullName ?? null,
  decidedAt: item.decidedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  attachments: (item.attachments ?? []).map(serializeAttachment),
});

async function persistCandidateCheckAttachments(
  candidateCheckId: string,
  files: any[],
  uploadedByUserId: string | null,
): Promise<void> {
  const uploadsRoot = getCandidateChecksUploadRoot(candidateCheckId);
  await fs.mkdir(uploadsRoot, { recursive: true });
  const repository = AppDataSource.getRepository(CandidateCheckAttachment);

  for (const file of files) {
    const originalName = normalizeFilename(String(file?.name || 'document'));
    const contentBase64 = String(file?.contentBase64 || '');
    if (!contentBase64) continue;

    const buffer = Buffer.from(contentBase64, 'base64');
    assertAllowedCandidateFile(file, originalName, buffer);

    const ext = path.extname(originalName);
    const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(uploadsRoot, storedName);
    await fs.writeFile(fullPath, buffer);

    await repository.save(repository.create({
      candidateCheckId,
      uploadedByUserId,
      originalName,
      mimeType: file?.mimeType ? String(file.mimeType) : null,
      sizeBytes: buffer.length,
      storagePath: fullPath,
    }));
  }
}

async function loadCandidateCheck(id: string): Promise<CandidateCheck> {
  return AppDataSource.getRepository(CandidateCheck).findOneOrFail({
    where: { id },
    relations: { createdByUser: true, decidedByUser: true, attachments: true },
    order: { attachments: { createdAt: 'ASC' } },
  });
}

async function notifySecurityAssigned(item: CandidateCheck): Promise<void> {
  const users = await AppDataSource.getRepository(User).find({ where: { role: 'security' as any, isActive: true } });
  const recipients = [...new Set(users.map((user) => user.email).filter(Boolean))];
  if (!recipients.length) return;
  const url = candidateCheckUrl(item.id);
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      <p>Назначена новая проверка кандидата.</p>
      <table style="border-collapse:collapse;margin:14px 0;color:#25324a">
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">Кандидат</td><td style="padding:4px 0;font-weight:600">${escapeHtml(item.candidateFullName)}</td></tr>
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">Должность</td><td style="padding:4px 0">${escapeHtml(item.position) || '—'}</td></tr>
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">HR</td><td style="padding:4px 0">${escapeHtml(item.createdByUser?.fullName ?? item.createdByUser?.email) || '—'}</td></tr>
      </table>
      <p>Анкета кандидата приложена в карточке проверки.</p>
      ${openCandidateCheckButton(url)}
    </div>
  `;
  try {
    await sendEmailWithAttachment(recipients, `Новая проверка кандидата: ${item.candidateFullName}`, html);
  } catch (error) {
    logger.error('Candidate check assignment email failed:', error);
  }
}

async function notifyHrDecision(item: CandidateCheck): Promise<void> {
  if (!item.createdByUser?.email) return;
  const url = candidateCheckUrl(item.id);
  const statusLabels: Record<CandidateCheckStatus, string> = {
    pending_security: 'Проверка СБ',
    approved: 'Согласован',
    approved_with_remarks: 'Согласован с замечаниями',
    rejected: 'Не согласован',
  };
  const html = `
    <div style="font-family:Arial,sans-serif;color:#25324a;font-size:14px;line-height:1.45">
      <p>По кандидату принято решение руководителем СБ.</p>
      <table style="border-collapse:collapse;margin:14px 0;color:#25324a">
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">Кандидат</td><td style="padding:4px 0;font-weight:600">${escapeHtml(item.candidateFullName)}</td></tr>
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">Решение</td><td style="padding:4px 0">${escapeHtml(statusLabels[item.status])}</td></tr>
        <tr><td style="padding:4px 18px 4px 0;color:#67758a">Комментарий</td><td style="padding:4px 0">${escapeHtml(item.securityComment) || '—'}</td></tr>
      </table>
      ${openCandidateCheckButton(url)}
    </div>
  `;
  try {
    await sendEmailWithAttachment(item.createdByUser.email, `Решение по кандидату: ${item.candidateFullName}`, html);
  } catch (error) {
    logger.error('Candidate check decision email failed:', error);
  }
}

export const listCandidateChecks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureCandidateCheckAccess(req);
    const status = String(req.query.status ?? '').trim();
    const q = String(req.query.q ?? '').trim();
    const repository = AppDataSource.getRepository(CandidateCheck);
    const query = repository
      .createQueryBuilder('candidateCheck')
      .leftJoinAndSelect('candidateCheck.createdByUser', 'createdByUser')
      .leftJoinAndSelect('candidateCheck.decidedByUser', 'decidedByUser')
      .leftJoinAndSelect('candidateCheck.attachments', 'attachments')
      .orderBy('candidateCheck.createdAt', 'DESC');

    if (status && Object.values(CandidateCheckStatus).includes(status as CandidateCheckStatus)) {
      query.andWhere('candidateCheck.status = :status', { status });
    }

    if (q) {
      query.andWhere(
        '(candidateCheck.candidateFullName ILIKE :q OR candidateCheck.position ILIKE :q OR candidateCheck.phone ILIKE :q OR candidateCheck.email ILIKE :q)',
        { q: `%${q}%` },
      );
    }

    const items = await query.getMany();
    res.json(items.map(serializeCandidateCheck));
  } catch (error) {
    next(error);
  }
};

export const createCandidateCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureHrWriteAccess(req);
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!files.length) {
      const error: any = new Error('Для проверки кандидата нужно прикрепить анкету');
      error.statusCode = 400;
      throw error;
    }
    assertCandidateFiles(files);
    const repository = AppDataSource.getRepository(CandidateCheck);
    const item = await repository.save(repository.create({
      candidateFullName: String(req.body.candidateFullName).trim(),
      position: normalizeNullable(req.body.position),
      phone: normalizeNullable(req.body.phone),
      email: normalizeNullable(req.body.email),
      hrComment: normalizeNullable(req.body.hrComment),
      status: CandidateCheckStatus.PENDING_SECURITY,
      createdByUserId: req.user!.id,
    }));
    await persistCandidateCheckAttachments(item.id, files, req.user!.id);

    const saved = await loadCandidateCheck(item.id);
    // Уведомление СБ отправляем в фоне: медленный/недоступный SMTP не должен
    // подвешивать ответ на создание проверки.
    void notifySecurityAssigned(saved).catch((error) => logger.error('notifySecurityAssigned failed:', error));
    res.status(201).json(serializeCandidateCheck(saved));
  } catch (error) {
    next(error);
  }
};

export const decideCandidateCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureSecurityWriteAccess(req);
    const decision = req.body.decision as CandidateCheckStatus;
    if (decision === CandidateCheckStatus.PENDING_SECURITY) {
      const error: any = new Error('Некорректное решение по кандидату');
      error.statusCode = 400;
      throw error;
    }

    const securityComment = normalizeNullable(req.body.securityComment);
    if (decision === CandidateCheckStatus.APPROVED_WITH_REMARKS && !securityComment) {
      const error: any = new Error('Для решения «Согласован с замечаниями» нужен комментарий');
      error.statusCode = 400;
      throw error;
    }

    const repository = AppDataSource.getRepository(CandidateCheck);
    const item = await repository.findOne({ where: { id: req.params.id } });
    if (!item) {
      const error: any = new Error('Проверка кандидата не найдена');
      error.statusCode = 404;
      throw error;
    }

    if (item.status !== CandidateCheckStatus.PENDING_SECURITY) {
      const error: any = new Error('По этой проверке уже принято решение');
      error.statusCode = 409;
      throw error;
    }

    // Условный UPDATE по статусу: при одновременных решениях выигрывает только одно,
    // второе получает 409 вместо тихой перезаписи.
    const updateResult = await repository.update(
      { id: item.id, status: CandidateCheckStatus.PENDING_SECURITY },
      {
        status: decision,
        securityComment,
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
      },
    );
    if (!updateResult.affected) {
      const error: any = new Error('По этой проверке уже принято решение');
      error.statusCode = 409;
      throw error;
    }

    const saved = await loadCandidateCheck(item.id);
    void notifyHrDecision(saved).catch((error) => logger.error('notifyHrDecision failed:', error));
    res.json(serializeCandidateCheck(saved));
  } catch (error) {
    next(error);
  }
};

export const downloadCandidateCheckAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureCandidateCheckAccess(req);
    const repository = AppDataSource.getRepository(CandidateCheckAttachment);
    const item = await repository.findOne({
      where: { id: req.params.attachmentId },
      relations: { candidateCheck: true },
    });
    if (!item) {
      const error: any = new Error('Файл анкеты не найден');
      error.statusCode = 404;
      throw error;
    }
    if (!item.candidateCheck) {
      const error: any = new Error('Проверка кандидата не найдена');
      error.statusCode = 404;
      throw error;
    }
    const data = await fs.readFile(item.storagePath);
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildContentDisposition(item.originalName));
    res.send(data);
  } catch (error) {
    next(error);
  }
};

export const previewCandidateCheckAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureCandidateCheckAccess(req);
    const repository = AppDataSource.getRepository(CandidateCheckAttachment);
    const item = await repository.findOne({
      where: { id: req.params.attachmentId },
      relations: { candidateCheck: true },
    });
    if (!item) {
      const error: any = new Error('Файл анкеты не найден');
      error.statusCode = 404;
      throw error;
    }
    if (!item.candidateCheck) {
      const error: any = new Error('Проверка кандидата не найдена');
      error.statusCode = 404;
      throw error;
    }

    // DOCX показываем как PDF (как в договорах); остальное — inline с исходным типом.
    if (isDocxFile(item.originalName, item.mimeType)) {
      const previewPath = await getDocxPdfPreviewPath(item.storagePath);
      const previewName = `${path.basename(item.originalName, path.extname(item.originalName))}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', buildContentDisposition(previewName, 'inline', 'attachment'));
      res.send(await fs.readFile(previewPath));
      return;
    }

    const data = await fs.readFile(item.storagePath);
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildContentDisposition(item.originalName, 'inline', 'attachment'));
    res.send(data);
  } catch (error) {
    next(error);
  }
};
