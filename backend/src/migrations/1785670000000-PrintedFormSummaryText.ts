import { MigrationInterface, QueryRunner } from 'typeorm';

/** «Содержание» заявок хранится целиком (в журнале — сводка, полностью по клику). */
export class PrintedFormSummaryText1785670000000 implements MigrationInterface {
  name = 'PrintedFormSummaryText1785670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "printed_forms" ALTER COLUMN "summary" TYPE text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "printed_forms" ALTER COLUMN "summary" TYPE character varying(300) USING left("summary", 300)');
  }
}
