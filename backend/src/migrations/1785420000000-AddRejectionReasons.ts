import { MigrationInterface, QueryRunner } from 'typeorm';

/** Коды причин отказа: по кандидату (рекрутер) и по отправке (заказчик). */
export class AddRejectionReasons1785420000000 implements MigrationInterface {
  name = 'AddRejectionReasons1785420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "rejection_reason_code" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "hh_candidate_submissions" ADD COLUMN IF NOT EXISTS "decision_reason_code" character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hh_candidate_submissions" DROP COLUMN IF EXISTS "decision_reason_code"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "rejection_reason_code"`);
  }
}
