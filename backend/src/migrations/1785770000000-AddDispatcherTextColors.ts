import { MigrationInterface, QueryRunner } from 'typeorm';

/** Цвет текста у статусов и значений справочников реестра (null — автоматически под фон). */
export class AddDispatcherTextColors1785770000000 implements MigrationInterface {
  name = 'AddDispatcherTextColors1785770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_statuses ADD COLUMN IF NOT EXISTS text_color varchar(7)`);
    await queryRunner.query(`ALTER TABLE dispatcher_dictionary_items ADD COLUMN IF NOT EXISTS text_color varchar(7)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_dictionary_items DROP COLUMN IF EXISTS text_color`);
    await queryRunner.query(`ALTER TABLE dispatcher_statuses DROP COLUMN IF EXISTS text_color`);
  }
}
