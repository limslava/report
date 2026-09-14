import { MigrationInterface, QueryRunner } from 'typeorm';

/** Новый вид доходного договора — «Договор хранения» (решение 2026-09-14). */
export class AddContractIncomeKindStorage1785740000000 implements MigrationInterface {
  name = 'AddContractIncomeKindStorage1785740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE contracts_income_kind_enum ADD VALUE IF NOT EXISTS 'storage'`);
  }

  public async down(): Promise<void> {
    // Значение enum в PostgreSQL не удалить без пересоздания типа; договоры
    // хранения при откате остаются как есть.
  }
}
