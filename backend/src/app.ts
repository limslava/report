import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { authRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin.routes';
import emailRouter from './routes/email.routes';
import smtpConfigRouter from './routes/smtp-config.routes';
import { planningV2Router } from './routes/planning-v2.routes';
import { financialPlanRouter } from './routes/financial-plan.routes';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { getAllowedCorsOrigins } from './config/env';
import { createRateLimiter } from './middleware/rate-limit';
import { withRetry } from './utils/db-retry';
import { dbCircuit } from './utils/db-circuit';
import { AppDataSource } from './config/data-source';
import { dbMetrics } from './utils/db-metrics';
import { canConnectRedis, getSchedulerStatus } from './services/scheduler';

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();
  const trustProxyValue = process.env.TRUST_PROXY ?? '1';
  app.set('trust proxy', trustProxyValue);
  const apiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Слишком много запросов. Повторите позже.',
  });

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin is not allowed'));
    },
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', apiRateLimiter);

  app.use((req, _res, next) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const pathLower = req.path.toLowerCase();
    const isStaticAsset =
      pathLower === '/vite.svg' ||
      pathLower.startsWith('/assets/') ||
      pathLower === '/favicon.ico';

    if (!isStaticAsset) {
      logger.info(`${req.method} ${req.url}`);
    }
    next();
  });

  app.use('/api', (_req, res, next) => {
    if (dbCircuit.isOpen() || !dbCircuit.canPass()) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database temporarily unavailable. Please try again later.',
        statusCode: 503,
      });
      return;
    }

    res.on('finish', () => {
      if (res.statusCode < 500 && res.statusCode !== 503 && res.statusCode !== 429) {
        dbCircuit.recordSuccess();
      }
    });

    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/v2/planning', planningV2Router);
  app.use('/api/v2/financial-plan', financialPlanRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/email-schedules', emailRouter);
  app.use('/api/smtp-config', smtpConfigRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.get('/health/db', async (_req, res) => {
    if (!AppDataSource.isInitialized) {
      dbMetrics.recordError('Datasource not initialized');
      res.status(503).json({ status: 'DOWN', reason: 'Datasource not initialized' });
      return;
    }

    try {
      const startedAt = Date.now();
      await withRetry(async () => {
        let timer: NodeJS.Timeout | null = null;
        try {
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('DB health timeout')), 2000);
          });
          return await Promise.race([AppDataSource.query('SELECT 1'), timeoutPromise]);
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }
      }, { attempts: 2, baseDelayMs: 200, maxDelayMs: 1000 });
      const latencyMs = Date.now() - startedAt;
      dbMetrics.recordLatency(latencyMs);
      res.json({ status: 'OK', latencyMs });
    } catch (err: any) {
      dbMetrics.recordError(err?.message || 'DB health check failed');
      res.status(503).json({ status: 'DOWN', error: err?.message || 'DB health check failed' });
    }
  });

  app.get('/health/db/metrics', (_req, res) => {
    res.json(dbMetrics.snapshot());
  });

  app.get('/health/redis', async (_req, res) => {
    if ((process.env.REDIS_ENABLED ?? 'true').toLowerCase() === 'false') {
      res.json({ status: 'DISABLED' });
      return;
    }
    try {
      const ok = await canConnectRedis();
      if (!ok) {
        logger.warn('Redis health check failed');
        res.status(503).json({ status: 'DOWN' });
        return;
      }
      res.json({ status: 'OK' });
    } catch (error: any) {
      logger.warn('Redis health check error', error);
      res.status(503).json({ status: 'DOWN', error: error?.message || 'Redis health check failed' });
    }
  });

  app.get('/health/scheduler', (_req, res) => {
    const status = getSchedulerStatus();
    if (!status.schedulerEnabled) {
      res.status(503).json({ status: 'DOWN', ...status });
      return;
    }
    res.json({ status: 'OK', ...status });
  });

  const frontendDistPath = path.resolve(process.cwd(), 'frontend', 'dist');
  const frontendIndexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/health/db') {
        return next();
      }
      return res.sendFile(frontendIndexPath);
    });
  }

  app.use('*', (_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use(errorHandler);

  return app;
}
