import Queue from 'bull';
import Redis from 'ioredis';
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
let localSchedulerTimer: NodeJS.Timeout | null = null;
let localSchedulerAlignTimer: NodeJS.Timeout | null = null;
const schedulerIntervalMinutes = Math.max(1, Number(process.env.SCHEDULER_INTERVAL_MINUTES || 5));
const schedulerCron = `*/${schedulerIntervalMinutes} * * * *`;
const schedulerUseQueue = (process.env.SCHEDULER_USE_QUEUE ?? 'false').toLowerCase() === 'true';

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

const runScheduledEmails = async () => {
  logger.info('Processing scheduled emails (scheduler tick)');
  try {
    await processScheduledEmails();
  } catch (error) {
    logger.error('Failed to process scheduled emails:', error);
  }
};

const getDelayToNextAlignedTickMs = () => {
  const now = new Date();
  const secondsMs = now.getSeconds() * 1000 + now.getMilliseconds();
  const minute = now.getMinutes();
  const nextAlignedMinute = minute - (minute % schedulerIntervalMinutes) + schedulerIntervalMinutes;
  const minutesUntilNext = nextAlignedMinute - minute;
  return minutesUntilNext * 60 * 1000 - secondsMs;
};

const startLocalSchedulerFallback = () => {
  if (localSchedulerTimer || localSchedulerAlignTimer) {
    return;
  }

  const startAlignedInterval = () => {
    localSchedulerAlignTimer = null;
    void runScheduledEmails();
    localSchedulerTimer = setInterval(() => {
      void runScheduledEmails();
    }, schedulerIntervalMinutes * 60 * 1000);
  };

  const delayMs = getDelayToNextAlignedTickMs();
  localSchedulerAlignTimer = setTimeout(startAlignedInterval, delayMs);

  logger.warn(
    `Email scheduler fallback started (in-process, every ${schedulerIntervalMinutes} minutes, aligned to clock).`
  );
};

const stopLocalSchedulerFallback = () => {
  if (localSchedulerAlignTimer) {
    clearTimeout(localSchedulerAlignTimer);
    localSchedulerAlignTimer = null;
  }
  if (!localSchedulerTimer) {
    return;
  }
  clearInterval(localSchedulerTimer);
  localSchedulerTimer = null;
};

const canConnectRedis = async (): Promise<boolean> => {
  const client = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await client.connect();
    await client.ping();
    return true;
  } catch (error) {
    logger.warn('Redis ping failed, switching scheduler to local fallback.', error);
    return false;
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
};

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
    startLocalSchedulerFallback();
  });

  queue.on('failed', (_job, error) => {
    logger.error('Email scheduler job failed:', error);
  });

  // Bull may return a promise here; handle rejection to avoid unhandledRejection crash.
  Promise.resolve(
    queue.process(async (_job) => {
      logger.info('Processing scheduled emails (cron job)');
      try {
        await processScheduledEmails();
      } catch (error) {
        logger.error('Failed to process scheduled emails:', error);
        throw error;
      }
    })
  ).catch((error) => {
    schedulerEnabled = false;
    logger.error('Failed to register email scheduler processor. Scheduler disabled.', error);
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
    startLocalSchedulerFallback();
    return;
  }

  if (!schedulerUseQueue) {
    logger.info('Email scheduler queue disabled (SCHEDULER_USE_QUEUE=false). Using local aligned scheduler only.');
    startLocalSchedulerFallback();
    return;
  }

  if (!redisEnabled()) {
    startLocalSchedulerFallback();
    return;
  }

  const redisOk = await canConnectRedis();
  if (!redisOk) {
    startLocalSchedulerFallback();
    return;
  }

  stopLocalSchedulerFallback();

  if (!emailQueue) {
    emailQueue = createQueue();
  }

  if (!emailQueue) {
    startLocalSchedulerFallback();
    return;
  }

  try {
    // Удаляем старые задачи (опционально)
    await emailQueue.empty();
    // Добавляем повторяющуюся задачу
    await emailQueue.add({}, { repeat: { cron: schedulerCron } });
    logger.info(`Email scheduler started (runs every ${schedulerIntervalMinutes} minutes)`);
  } catch (error) {
    logger.error('Failed to start email scheduler:', error);
    schedulerEnabled = false;
    await emailQueue.close().catch((closeErr) => logger.error('Failed to close queue after start failure:', closeErr));
    emailQueue = null;
    startLocalSchedulerFallback();
  }
};

// Остановка планировщика (для graceful shutdown)
export const stopScheduler = async () => {
  stopLocalSchedulerFallback();
  if (!emailQueue) return;
  await emailQueue.close();
  emailQueue = null;
  logger.info('Email scheduler stopped');
};
