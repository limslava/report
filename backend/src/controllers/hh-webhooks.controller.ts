import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { HhConnection } from '../models/hh-connection.model';
import { HhWebhookEvent } from '../models/hh-webhook-event.model';
import { decryptHhSecret } from '../services/hh-crypto.service';
import { logger } from '../utils/logger';

const UNIQUE_VIOLATION = '23505';

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof QueryFailedError && (error as any)?.driverError?.code === UNIQUE_VIOLATION;
}

export const receiveHhWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = String(req.params.secret || '');
    if (!secret) {
      return res.status(404).json({ error: 'Not Found' });
    }

    const connectionRepository = AppDataSource.getRepository(HhConnection);
    // Ищем по всем подключениям, у которых задан webhook-секрет: статус `active`
    // выставляется только после OAuth, а подписка может быть оформлена раньше.
    const connections = await connectionRepository
      .createQueryBuilder('connection')
      .where('connection.webhookSecretEnc IS NOT NULL')
      .andWhere('connection.status <> :disconnected', { disconnected: 'disconnected' })
      .getMany();

    let connection: HhConnection | null = null;
    for (const item of connections) {
      if (!item.webhookSecretEnc) continue;
      let expectedSecret: string;
      try {
        expectedSecret = decryptHhSecret(item.webhookSecretEnc);
      } catch (error) {
        logger.warn('hh webhook: failed to decrypt stored secret', { connectionId: item.id });
        continue;
      }
      if (timingSafeEqualText(secret, expectedSecret)) {
        connection = item;
        break;
      }
    }

    if (!connection) {
      return res.status(404).json({ error: 'Not Found' });
    }

    const eventId = typeof req.body?.id === 'string' ? req.body.id : null;
    const actionType = typeof req.body?.action_type === 'string' ? req.body.action_type : null;
    if (!eventId || !actionType || eventId.length > 128 || actionType.length > 100) {
      return res.status(400).json({ error: 'Invalid hh webhook payload' });
    }

    const eventRepository = AppDataSource.getRepository(HhWebhookEvent);
    try {
      // insert, а не save: save сначала делает SELECT и при гонке двух доставок
      // одного события всё равно упал бы на конфликте PK.
      await eventRepository.insert({
        id: eventId,
        connectionId: connection.id,
        subscriptionId: typeof req.body?.subscription_id === 'string' ? req.body.subscription_id : null,
        actionType,
        payloadJson: req.body,
        status: 'received',
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // hh ждёт именно 409 на дубликат, иначе подписка уходит в очередь на блокировку.
        return res.status(409).json({ status: 'duplicate' });
      }
      throw error;
    }

    // Отвечаем сразу: таймаут hh — 5 секунд, разбор события делает фоновый воркер.
    return res.status(200).json({ status: 'received' });
  } catch (error) {
    return next(error);
  }
};
