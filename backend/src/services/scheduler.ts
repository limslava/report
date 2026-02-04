import Queue from 'bull';
import { logger } from '../utils/logger';
import { processScheduledEmails } from './email-scheduler.service';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Очередь для обработки запланированных email
export const emailQueue = new Queue('email-scheduler', { redis: redisConfig });

// Добавляем задачу, которая будет выполняться каждые 10 минут
emailQueue.process(async (_job) => {
  logger.info('Processing scheduled emails (cron job)');
  try {
    await processScheduledEmails();
  } catch (error) {
    logger.error('Failed to process scheduled emails:', error);
    throw error;
  }
});

// Запланировать повторяющуюся задачу (каждые 10 минут)
export const startScheduler = () => {
  // Удаляем старые задачи (опционально)
  emailQueue.empty();

  // Добавляем повторяющуюся задачу с cron‑выражением '*/10 * * * *'
  emailQueue.add({}, { repeat: { cron: '*/10 * * * *' } });

  logger.info('Email scheduler started (runs every 10 minutes)');
};

// Остановка планировщика (для graceful shutdown)
export const stopScheduler = async () => {
  await emailQueue.close();
  logger.info('Email scheduler stopped');
};