import { MigrationInterface, QueryRunner } from 'typeorm';

/** «№ заказа» реестра (ГГММ-NNN); существующие заявки нумеруются при старте сервера. */
export class AddDispatcherOrderNumber1785830000000 implements MigrationInterface {
  name = 'AddDispatcherOrderNumber1785830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS order_number varchar(16) NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatcher_orders_order_number ON dispatcher_orders (order_number)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_dispatcher_orders_order_number`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS order_number`);
  }
}
