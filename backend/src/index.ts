import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import { AppDataSource } from './config/data-source';
import { authRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin.routes';
import emailRouter from './routes/email.routes';
import smtpConfigRouter from './routes/smtp-config.routes';
import { planningV2Router } from './routes/planning-v2.routes';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { planWebSocketService } from './services/websocket.service';
import { assertProductionEnv, getAllowedCorsOrigins, getAppPort } from './config/env';
import { createRateLimiter } from './middleware/rate-limit';
import { ensureDefaultAdmin } from './services/bootstrap.service';

config();

const app = express();
const PORT = getAppPort();
const allowedOrigins = getAllowedCorsOrigins();
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Слишком много запросов. Повторите позже.',
});

// Middleware
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

// Logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/v2/planning', planningV2Router);
app.use('/api/admin', adminRouter);
app.use('/api/email-schedules', emailRouter);
app.use('/api/smtp-config', smtpConfigRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);

async function startServer() {
  try {
    assertProductionEnv();
    // Initialize database connection
    await AppDataSource.initialize();
    logger.info('Database connected successfully');
    await ensureDefaultAdmin();

    // Start email scheduler (Bull queue)
    import('./services/scheduler')
      .then((module) => {
        const startScheduler =
          (module as { startScheduler?: unknown }).startScheduler ??
          (module as { default?: { startScheduler?: unknown } }).default?.startScheduler;

        if (typeof startScheduler === 'function') {
          startScheduler();
          return;
        }

        logger.error('Failed to start scheduler: startScheduler is not a function');
      })
      .catch((err) => logger.error('Failed to start scheduler:', err));

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Initialize WebSocket server
    planWebSocketService.initialize(server);
    logger.info('WebSocket server initialized');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
