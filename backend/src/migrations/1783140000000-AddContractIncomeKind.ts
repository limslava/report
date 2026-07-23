import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractIncomeKind1783140000000 implements MigrationInterface {
  name = 'AddContractIncomeKind1783140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_income_kind_enum') THEN
          CREATE TYPE contracts_income_kind_enum AS ENUM ('teu', 'agency');
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
      ADD COLUMN IF NOT EXISTS income_kind contracts_income_kind_enum
    `);
    // Существующие доходные договоры до появления агентских — это ТЭУ.
    await queryRunner.query(`
      UPDATE contracts SET income_kind = 'teu'
      WHERE contract_type = 'income' AND income_kind IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS income_kind`);
    await queryRunner.query(`DROP TYPE IF EXISTS contracts_income_kind_enum`);
  }
}
