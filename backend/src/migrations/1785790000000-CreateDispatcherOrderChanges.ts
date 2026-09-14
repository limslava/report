import { MigrationInterface, QueryRunner } from 'typeorm';

/** История изменений реестра диспетчеров. */
export class CreateDispatcherOrderChanges1785790000000 implements MigrationInterface {
  name = 'CreateDispatcherOrderChanges1785790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatcher_order_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid,
        action varchar(16) NOT NULL,
        field varchar(64),
        old_value text,
        new_value text,
        order_date date,
        ktk_number text,
        client text,
        user_id uuid,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dispatcher_order_changes_created ON dispatcher_order_changes (created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dispatcher_order_changes_order ON dispatcher_order_changes (order_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dispatcher_order_changes`);
  }
}
