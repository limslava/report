import { MigrationInterface, QueryRunner } from 'typeorm';

/** ИНН физлица в карточке сотрудника справочника (только карточка, без выгрузок). */
export class AddEmployeeInn1785610000000 implements MigrationInterface {
  name = 'AddEmployeeInn1785610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE \"directory_employees\" ADD COLUMN IF NOT EXISTS \"inn\" character varying(12) NOT NULL DEFAULT ''"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "directory_employees" DROP COLUMN IF EXISTS "inn"');
  }
}
