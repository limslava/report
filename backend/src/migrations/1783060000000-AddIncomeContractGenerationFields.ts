import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIncomeContractGenerationFields1783060000000 implements MigrationInterface {
  name = 'AddIncomeContractGenerationFields1783060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
      ADD COLUMN IF NOT EXISTS counterparty_ogrn VARCHAR(15),
      ADD COLUMN IF NOT EXISTS counterparty_kpp VARCHAR(9),
      ADD COLUMN IF NOT EXISTS counterparty_legal_address VARCHAR(500),
      ADD COLUMN IF NOT EXISTS counterparty_postal_address VARCHAR(500),
      ADD COLUMN IF NOT EXISTS counterparty_phone VARCHAR(100),
      ADD COLUMN IF NOT EXISTS counterparty_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS counterparty_signer_position VARCHAR(255),
      ADD COLUMN IF NOT EXISTS counterparty_signer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS counterparty_signer_authority VARCHAR(255),
      ADD COLUMN IF NOT EXISTS counterparty_bank_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS counterparty_bank_bik VARCHAR(9),
      ADD COLUMN IF NOT EXISTS counterparty_bank_account VARCHAR(20),
      ADD COLUMN IF NOT EXISTS counterparty_correspondent_account VARCHAR(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
      DROP COLUMN IF EXISTS counterparty_correspondent_account,
      DROP COLUMN IF EXISTS counterparty_bank_account,
      DROP COLUMN IF EXISTS counterparty_bank_bik,
      DROP COLUMN IF EXISTS counterparty_bank_name,
      DROP COLUMN IF EXISTS counterparty_signer_authority,
      DROP COLUMN IF EXISTS counterparty_signer_name,
      DROP COLUMN IF EXISTS counterparty_signer_position,
      DROP COLUMN IF EXISTS counterparty_email,
      DROP COLUMN IF EXISTS counterparty_phone,
      DROP COLUMN IF EXISTS counterparty_postal_address,
      DROP COLUMN IF EXISTS counterparty_legal_address,
      DROP COLUMN IF EXISTS counterparty_kpp,
      DROP COLUMN IF EXISTS counterparty_ogrn
    `);
  }
}
