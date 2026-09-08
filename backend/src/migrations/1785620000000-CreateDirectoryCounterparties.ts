import { MigrationInterface, QueryRunner } from 'typeorm';

/** Справочник контрагентов: своя таблица, наполняется вручную по ИНН. */
export class CreateDirectoryCounterparties1785620000000 implements MigrationInterface {
  name = 'CreateDirectoryCounterparties1785620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "directory_counterparties" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "inn" character varying(12) NOT NULL,
        "name_full" character varying(500) NOT NULL,
        "name_short" character varying(255) NOT NULL DEFAULT '',
        "ogrn" character varying(15) NOT NULL DEFAULT '',
        "kpp" character varying(9) NOT NULL DEFAULT '',
        "address" character varying(500) NOT NULL DEFAULT '',
        "source" character varying(16) NOT NULL DEFAULT 'manual',
        "note" character varying(500) NOT NULL DEFAULT '',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "uq_directory_counterparties_inn" UNIQUE ("inn")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "directory_counterparties"');
  }
}
