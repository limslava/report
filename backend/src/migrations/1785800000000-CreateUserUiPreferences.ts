import { MigrationInterface, QueryRunner } from 'typeorm';

/** Личные настройки интерфейса сотрудника (привязаны к учётной записи). */
export class CreateUserUiPreferences1785800000000 implements MigrationInterface {
  name = 'CreateUserUiPreferences1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_ui_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        key varchar(128) NOT NULL,
        value jsonb,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ui_preferences_user_key ON user_ui_preferences (user_id, key)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_ui_preferences`);
  }
}
