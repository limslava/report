import { MigrationInterface, QueryRunner } from 'typeorm';

/** «Ответственный» в реестре и «№ заказа» в истории изменений (16.09.2026). */
export class AddDispatcherResponsible1785840000000 implements MigrationInterface {
  name = 'AddDispatcherResponsible1785840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS responsible varchar(128) NULL`);
    await queryRunner.query(`ALTER TABLE dispatcher_order_changes ADD COLUMN IF NOT EXISTS order_number varchar(16) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_order_changes DROP COLUMN IF EXISTS order_number`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS responsible`);
  }
}
