import Queue from 'bull';
import { logger } from '../utils/logger';
import { processScheduledEmails } from './email-scheduler.service';

type RedisOptions = {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  retryStrategy: (times: number) => number | null;
};

let emailQueue: Queue.Queue | null = null;
let schedulerEnabled = true;

const redisEnabled = () => (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false';
const schedulerEnvEnabled = () => (process.env.SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 30) return null;
    return Math.min(times * 200, 5000);
  },
} satisfies RedisOptions;

const createQueue = (): Queue.Queue | null => {
  if (!redisEnabled()) {
    logger.warn('Redis disabled via REDIS_ENABLED=false. Email scheduler will be skipped.');
    return null;
  }

  const queue = new Queue('email-scheduler', { redis: redisConfig });

  queue.on('error', (error) => {
    schedulerEnabled = false;
    logger.error('Redis queue error. Scheduler disabled until restart.', error);
    queue.close().catch((closeErr) => logger.error('Failed to close email queue after error:', closeErr));
    emailQueue = null;
  });

  queue.on('failed', (_job, error) => {
    logger.error('Email scheduler job failed:', error);
  });

  queue.process(async (_job) => {
    logger.info('Processing scheduled emails (cron job)');
    try {
      await processScheduledEmails();
    } catch (error) {
      logger.error('Failed to process scheduled emails:', error);
      throw error;
    }
  });

  return queue;
};

// Запланировать повторяющуюся задачу (каждые 10 минут)
export const startScheduler = async () => {
  if (!schedulerEnvEnabled()) {
    logger.warn('Scheduler disabled via SCHEDULER_ENABLED=false.');
    return;
  }
  if (!schedulerEnabled) {
    logger.warn('Scheduler is in disabled state after Redis error. Restart app to retry.');
    return;
  }

  if (!emailQueue) {
    emailQueue = createQueue();
  }

  if (!emailQueue) {
    return;
  }

  try {
    // Удаляем старые задачи (опционально)
    await emailQueue.empty();
    // Добавляем повторяющуюся задачу с cron‑выражением '*/10 * * * *'
    await emailQueue.add({}, { repeat: { cron: '*/10 * * * *' } });
    logger.info('Email scheduler started (runs every 10 minutes)');
  } catch (error) {
    logger.error('Failed to start email scheduler:', error);
    schedulerEnabled = false;
    await emailQueue.close().catch((closeErr) => logger.error('Failed to close queue after start failure:', closeErr));
    emailQueue = null;
  }
};

// Остановка планировщика (для graceful shutdown)
export const stopScheduler = async () => {
  if (!emailQueue) return;
  await emailQueue.close();
  emailQueue = null;
  logger.info('Email scheduler stopped');
};
