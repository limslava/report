import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '../config/data-source';
import {
  DirectoryAttachment,
  DirectoryAttachmentEntityType,
  DirectoryAttachmentKind,
} from '../models/directory-attachment.model';
import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';
import type { FleetLocation } from '../models/fleet-vehicle.model';
import { Trailer } from '../models/trailer.model';
import { recordAuditLog } from '../services/audit-log.service';
import { directoryLocationsForRole } from '../constants/directories';

const attachmentRepo = AppDataSource.getRepository(DirectoryAttachment);

const httpError = (statusCode: number, message: string): never => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/** Сканы: паспорт и ВУ — у сотрудников, СОР — у техники и прицепов. */
const KINDS_BY_ENTITY: Record<DirectoryAttachmentEntityType, DirectoryAttachmentKind[]> = {
  employee: ['passport', 'license'],
  vehicle: ['sor'],
  trailer: ['sor'],
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const uploadsRoot = (): string =>
  process.env.UPLOAD_PATH ? path.resolve(process.env.UPLOAD_PATH) : path.resolve(process.cwd(), 'uploads');

const parseEntityType = (value: unknown): DirectoryAttachmentEntityType => {
  if (value === 'employee' || value === 'vehicle' || value === 'trailer') return value;
  return httpError(400, 'Unknown entityType') as never;
};

/** Запись справочника, к которой крепится файл; локация нужна для проверки прав. */
const resolveEntityLocation = async (
  entityType: DirectoryAttachmentEntityType,
  entityId: string,
): Promise<FleetLocation> => {
  const repo =
    entityType === 'employee'
      ? AppDataSource.getRepository(Employee)
      : entityType === 'vehicle'
        ? AppDataSource.getRepository(FleetVehicle)
        : AppDataSource.getRepository(Trailer);
  const entity = await (repo as any).findOne({ where: { id: entityId } });
  if (!entity) httpError(404, 'Запись справочника не найдена');
  return entity.location as FleetLocation;
};

const requireLocationAccess = (req: Request, location: FleetLocation): void => {
  if (!directoryLocationsForRole(req.user?.role).includes(location)) {
    httpError(403, 'Access denied for this location');
  }
};

const serialize = (item: DirectoryAttachment) => ({
  id: item.id,
  entityType: item.entityType,
  entityId: item.entityId,
  kind: item.kind,
  originalName: item.originalName,
  mimeType: item.mimeType,
  sizeBytes: Number(item.sizeBytes),
  createdAt: item.createdAt,
});

export const listDirectoryAttachments = async (req: Request, res: Response) => {
  const entityType = parseEntityType(req.query.entityType);
  const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : '';
  if (!entityId) httpError(400, 'entityId is required');
  requireLocationAccess(req, await resolveEntityLocation(entityType, entityId));
  const items = await attachmentRepo.find({ where: { entityType, entityId }, order: { createdAt: 'ASC' } });
  res.json(items.map(serialize));
};

export const uploadDirectoryAttachment = async (req: Request, res: Response) => {
  const entityType = parseEntityType(req.body?.entityType);
  const entityId = typeof req.body?.entityId === 'string' ? req.body.entityId : '';
  if (!entityId) httpError(400, 'entityId is required');
  const kind = req.body?.kind as DirectoryAttachmentKind;
  if (!KINDS_BY_ENTITY[entityType].includes(kind)) httpError(400, 'Недопустимый вид документа');
  requireLocationAccess(req, await resolveEntityLocation(entityType, entityId));

  const file = req.body?.file ?? {};
  const originalName = String(file.name || '').trim().slice(0, 255) || 'документ';
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    httpError(400, 'Допустимые форматы: PDF, JPG, PNG, WEBP');
  }
  const contentBase64 = String(file.contentBase64 || '');
  if (!contentBase64) httpError(400, 'Файл пуст');
  const buffer = Buffer.from(contentBase64, 'base64');
  if (!buffer.length) httpError(400, 'Файл пуст');
  if (buffer.length > MAX_FILE_BYTES) httpError(400, 'Файл больше 15 МБ');

  const directory = path.join(uploadsRoot(), 'directory-docs', entityType, entityId);
  await fs.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const storagePath = path.join(directory, storedName);
  await fs.writeFile(storagePath, buffer);

  const attachment = await attachmentRepo.save(
    attachmentRepo.create({
      entityType,
      entityId,
      kind,
      originalName,
      mimeType: String(file.mimeType || '').slice(0, 120),
      sizeBytes: String(buffer.length),
      storagePath,
      uploadedById: req.user?.id ?? null,
    }),
  );
  await recordAuditLog({
    action: 'DIRECTORY_ATTACHMENT_UPLOADED',
    userId: req.user?.id ?? null,
    entityType: 'directory_attachment',
    entityId: attachment.id,
    details: { target: entityType, targetId: entityId, kind, originalName, sizeBytes: buffer.length },
    req,
  });
  res.status(201).json(serialize(attachment));
};

export const downloadDirectoryAttachment = async (req: Request, res: Response) => {
  const attachment = await attachmentRepo.findOne({ where: { id: req.params.id } });
  if (!attachment) return httpError(404, 'Файл не найден') as never;
  requireLocationAccess(req, await resolveEntityLocation(attachment.entityType, attachment.entityId));
  try {
    await fs.access(attachment.storagePath);
  } catch {
    httpError(410, 'Файл отсутствует в хранилище');
  }
  // сканы паспортов — ПДн, каждое скачивание в аудит
  await recordAuditLog({
    action: 'DIRECTORY_ATTACHMENT_DOWNLOADED',
    userId: req.user?.id ?? null,
    entityType: 'directory_attachment',
    entityId: attachment.id,
    details: { target: attachment.entityType, targetId: attachment.entityId, kind: attachment.kind },
    req,
  });
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
  );
  if (attachment.mimeType) res.setHeader('Content-Type', attachment.mimeType);
  res.sendFile(path.resolve(attachment.storagePath));
};

export const deleteDirectoryAttachment = async (req: Request, res: Response) => {
  const attachment = await attachmentRepo.findOne({ where: { id: req.params.id } });
  if (!attachment) return httpError(404, 'Файл не найден') as never;
  requireLocationAccess(req, await resolveEntityLocation(attachment.entityType, attachment.entityId));
  await attachmentRepo.remove(attachment);
  await fs.rm(attachment.storagePath, { force: true });
  await recordAuditLog({
    action: 'DIRECTORY_ATTACHMENT_DELETED',
    userId: req.user?.id ?? null,
    entityType: 'directory_attachment',
    entityId: req.params.id,
    details: { target: attachment.entityType, targetId: attachment.entityId, kind: attachment.kind, originalName: attachment.originalName },
    req,
  });
  res.json({ ok: true });
};
