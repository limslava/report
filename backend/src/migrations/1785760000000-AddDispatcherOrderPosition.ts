import { MigrationInterface, QueryRunner } from 'typeorm';

/** Порядок строк реестра внутри дня — для перетаскивания строк. */
export class AddDispatcherOrderPosition1785760000000 implements MigrationInterface {
  name = 'AddDispatcherOrderPosition1785760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS position double precision NOT NULL DEFAULT 0`,
    );
    // существующие строки сохраняют текущий порядок (по времени создания)
    await queryRunner.query(
      `UPDATE dispatcher_orders SET position = extract(epoch from created_at) * 1000 WHERE position = 0`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispatcher_orders_date_position ON dispatcher_orders (order_date, position)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispatcher_orders_date_position`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS position`);
  }
}
