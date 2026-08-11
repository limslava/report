import { AppDataSource } from '../config/data-source';
import { logger } from '../utils/logger';

/**
 * Порядок применения схемы БД.
 *
 * Историческая проблема: базовые таблицы (users, counterparties, contracts...)
 * создаёт TypeORM synchronize из моделей, а миграции только ИЗМЕНЯЮТ их.
 * При этом `migrationsRun: true` в DataSource выполнял миграции ДО synchronize,
 * поэтому на пустой базе первая же миграция склада падала на отсутствующей
 * counterparties, и развернуть проект с нуля было невозможно.
 *
 * Решение — управлять порядком явно:
 *  1) пустая база (нет users)  -> строим полную текущую схему из моделей
 *     (synchronize) и помечаем ВСЕ входящие в сборку миграции применёнными:
 *     их изменения уже включены в модели, выполнять их не нужно;
 *  2) живая база               -> только новые (pending) миграции, если
 *     включено DB_MIGRATIONS_RUN=true. Схему из моделей не трогаем.
 *
 * Флаг DB_MIGRATIONS_RUN сохраняет прежний смысл, но обрабатывается здесь,
 * а не внутри DataSource.initialize() — поэтому в data-source.ts
 * migrationsRun выключен намертво.
 */

function migrationTimestamp(name: string): number {
  const match = name.match(/(\d{13})$/);
  return match ? Number(match[1]) : 0;
}

function migrationsTableName(): string {
  return (AppDataSource.options as { migrationsTableName?: string }).migrationsTableName || 'migrations';
}

export async function ensureDatabaseSchema(): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    const hasUsers = await queryRunner.hasTable('users');

    if (!hasUsers) {
      // Совершенно пустая база: baseline из моделей.
      logger.info('DB bootstrap: пустая база, создаю полную схему из моделей');
      await AppDataSource.synchronize();

      const table = migrationsTableName();
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS "${table}" (` +
        `"id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, ` +
        `CONSTRAINT "pk_${table}" PRIMARY KEY ("id"))`,
      );
      let stamped = 0;
      for (const migration of AppDataSource.migrations) {
        const name = (migration as { name?: string }).name ?? migration.constructor.name;
        const result: unknown[] = await queryRunner.query(
          // Явные касты: параметр $2 встречается дважды, и без каста Postgres
          // не может вывести его тип (inconsistent types deduced).
          `INSERT INTO "${table}" ("timestamp", "name") ` +
          `SELECT $1::bigint, $2::varchar ` +
          `WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE "name" = $2::varchar) RETURNING "id"`,
          [migrationTimestamp(name), name],
        );
        if (Array.isArray(result) && result.length > 0) stamped += 1;
      }
      logger.info(`DB bootstrap: схема создана, ${stamped} миграций отмечены применёнными (их изменения уже в моделях)`);
      return;
    }

    // База с историей. Отдельно предупреждаем про состояние "только 01-init.sql":
    // таблица users есть, но остальной схемы нет — synchronize здесь запускать
    // нельзя (он начнёт перестраивать legacy-таблицы), нужны catch-up патчи
    // из database/patches/ либо старт с пустой базы.
    const hasCounterparties = await queryRunner.hasTable('counterparties');
    if (!hasCounterparties) {
      logger.warn(
        'DB bootstrap: база создана из database/init/01-init.sql и отстала от моделей. ' +
        'Примените database/patches/*.sql или начните с пустой базы (без init-скриптов).',
      );
    }

    if (process.env.DB_MIGRATIONS_RUN === 'true') {
      const executed = await AppDataSource.runMigrations({ transaction: 'each' });
      if (executed.length > 0) {
        logger.info(`DB bootstrap: применены миграции: ${executed.map((m) => m.name).join(', ')}`);
      } else {
        logger.info('DB bootstrap: новых миграций нет');
      }
    }
  } finally {
    await queryRunner.release();
  }
}
