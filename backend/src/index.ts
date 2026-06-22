import 'reflect-metadata';
import { config } from 'dotenv';
import { AppDataSource } from './config/data-source';
import { logger } from './utils/logger';
import { planWebSocketService } from './services/websocket.service';
import { assertProductionEnv, getAppPort } from './config/env';
import { ensureDefaultAdmin } from './services/bootstrap.service';
import { planningV2Service } from './services/planning-v2.service';
import { withRetry } from './utils/db-retry';
import { createApp } from './app';
import { ensureWarehouseServiceCatalog } from './services/warehouse-service-catalog.service';
import { ensureWarehousePhotoStorageReady } from './services/warehouse-photo-storage.service';

config();

const PORT = getAppPort();

async function startServer() {
  try {
    assertProductionEnv();
    await withRetry(() => AppDataSource.initialize(), { attempts: 12, baseDelayMs: 1000, maxDelayMs: 10000 });
    logger.info('Database connected successfully');
    await ensureDefaultAdmin();
    try {
      await planningV2Service.bootstrapCatalog();
      logger.info('Planning catalog bootstrapped');
    } catch (err) {
      logger.error('Failed to bootstrap planning catalog:', err);
    }
    await ensureWarehouseServiceCatalog();
    await ensureWarehousePhotoStorageReady();
    logger.info('Warehouse service catalog bootstrapped');

    const app = createApp();

    import('./services/scheduler')
      .then((module) => {
        const startScheduler =
          (module as { startScheduler?: unknown }).startScheduler ??
          (module as { default?: { startScheduler?: unknown } }).default?.startScheduler;

        if (typeof startScheduler === 'function') {
          Promise.resolve(startScheduler())
            .catch((err) => logger.error('Failed to start scheduler:', err));
          return;
        }

        logger.error('Failed to start scheduler: startScheduler is not a function');
      })
      .catch((err) => logger.error('Failed to start scheduler:', err));

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    planWebSocketService.initialize(server);
    logger.info('WebSocket server initialized');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
