import { Request } from 'express';
import { AppDataSource } from '../config/data-source';
import { AuditLog } from '../models/audit-log.model';
import { logger } from '../utils/logger';

type AuditLogPayload = {
  action: string;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  req?: Request;
};

const auditLogRepository = AppDataSource.getRepository(AuditLog);

export async function recordAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const log = auditLogRepository.create({
      action: payload.action,
      userId: payload.userId ?? null,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      details: payload.details ?? null,
      ip: payload.req?.ip ?? null,
      userAgent: payload.req?.headers['user-agent']?.toString() ?? null,
    });
    await auditLogRepository.save(log);
  } catch (error) {
    logger.warn('Failed to write audit log', error as any);
  }
}
