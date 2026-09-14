import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ручной порядок строк реестра — для перетаскивания строк (как в google-таблице). */
export class AddDispatcherOrderPosition1785760000000 implements MigrationInterface {
  name = 'AddDispatcherOrderPosition1785760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS position double precision NOT NULL DEFAULT 0`,
    );
    // ручной порядок строк на всю таблицу; стартовый — как реестр выглядел
    // до этого (по дате, внутри дня — по времени создания). Новые строки
    // получают время создания в мс и встают в конец.
    await queryRunner.query(`
      UPDATE dispatcher_orders d
      SET position = ranked.rn * 1000
      FROM (SELECT id, row_number() OVER (ORDER BY order_date, created_at) AS rn FROM dispatcher_orders) ranked
      WHERE d.id = ranked.id
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispatcher_orders_date_position ON dispatcher_orders (order_date, position)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispatcher_orders_date_position`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS position`);
  }
}
