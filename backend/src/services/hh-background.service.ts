import { LessThanOrEqual, IsNull, Not, In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { HhCandidate } from '../models/hh-candidate.model';
import { HhWebhookEvent } from '../models/hh-webhook-event.model';
import { anonymizeHhCandidate } from './hh-recruiting.service';
import { logger } from '../utils/logger';

/**
 * Фоновые задачи модуля подбора. Запускаются из index.ts после инициализации БД.
 * Пока проект не перевёл scheduler.ts на реестр задач (бэклог, задача 22),
 * используются простые in-process интервалы с unref() и защитой от
 * параллельного запуска.
 */

const RETENTION_SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000; // 2 раза в сутки
const WEBHOOK_WORKER_INTERVAL_MS = 30 * 1000;
const WEBHOOK_BATCH_SIZE = 50;
const WEBHOOK_MAX_ATTEMPTS = 5;

let retentionRunning = false;
let webhookRunning = false;

/** Обезличивание кандидатов с истёкшим сроком хранения. */
export async function runHhRetentionSweep(): Promise<number> {
  if (retentionRunning) return 0;
  retentionRunning = true;
  try {
    const due = await AppDataSource.getRepository(HhCandidate).find({
      where: { retentionUntil: LessThanOrEqual(new Date()), anonymizedAt: IsNull() },
      take: 200,
    });
    for (const candidate of due) {
      await anonymizeHhCandidate(candidate.id);
    }
    if (due.length > 0) {
      logger.info(`HR retention: обезличено кандидатов по сроку хранения: ${due.length}`);
    }
    return due.length;
  } catch (error) {
    logger.error('HR retention sweep failed', error as Error);
    return 0;
  } finally {
    retentionRunning = false;
  }
}

/**
 * Обработчики событий вебхуков hh по action_type.
 *
 * Пока интеграции с hh.ru нет (OAuth и синхронизация — блок P2 бэклога),
 * обработчики только фиксируют событие; при появлении интеграции сюда
 * добавляется реальная логика (создание отклика, обновление вакансии и т.д.).
 * Инфраструктура — приём, идемпотентность, ретраи, статусы — уже боевая.
 */
type WebhookHandler = (event: HhWebhookEvent) => Promise<void>;

const webhookHandlers: Record<string, WebhookHandler> = {};

async function defaultWebhookHandler(event: HhWebhookEvent): Promise<void> {
  logger.info(`hh webhook принят к сведению: ${event.actionType} (${event.id}); обработка появится вместе с интеграцией hh.ru`);
}

/** Разбор накопленных событий вебхуков: received -> processed | failed -> dead. */
export async function processHhWebhookEvents(): Promise<number> {
  if (webhookRunning) return 0;
  webhookRunning = true;
  try {
    const repository = AppDataSource.getRepository(HhWebhookEvent);
    const batch = await repository.find({
      where: [
        { status: 'received' },
        // Ретраи: failed возвращаются в работу, пока не исчерпаны попытки.
        { status: 'failed', attempts: Not(In([WEBHOOK_MAX_ATTEMPTS])) },
      ],
      order: { receivedAt: 'ASC' },
      take: WEBHOOK_BATCH_SIZE,
    });

    let processed = 0;
    for (const event of batch) {
      const handler = webhookHandlers[event.actionType] ?? defaultWebhookHandler;
      event.attempts += 1;
      try {
        await handler(event);
        event.status = 'processed';
        event.error = null;
        event.processedAt = new Date();
        processed += 1;
      } catch (error) {
        event.error = (error as Error).message?.slice(0, 2000) ?? 'unknown error';
        event.status = event.attempts >= WEBHOOK_MAX_ATTEMPTS ? 'dead' : 'failed';
        if (event.status === 'dead') {
          logger.error(`hh webhook ${event.id} (${event.actionType}) переведён в dead после ${event.attempts} попыток: ${event.error}`);
        }
      }
      await repository.save(event);
    }
    return processed;
  } catch (error) {
    logger.error('hh webhook worker failed', error as Error);
    return 0;
  } finally {
    webhookRunning = false;
  }
}

/** Запуск фоновых задач модуля. Вызывается один раз при старте сервера. */
export function startHhBackgroundJobs(): void {
  if (process.env.NODE_ENV === 'test') return;
  // Первый прогон сразу: после простоя события и просроченные записи не ждут интервала.
  void runHhRetentionSweep();
  void processHhWebhookEvents();
  setInterval(() => void runHhRetentionSweep(), RETENTION_SWEEP_INTERVAL_MS).unref();
  setInterval(() => void processHhWebhookEvents(), WEBHOOK_WORKER_INTERVAL_MS).unref();
  logger.info('HR background jobs started (retention sweep, webhook worker)');
}
