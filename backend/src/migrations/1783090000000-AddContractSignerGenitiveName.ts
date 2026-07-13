import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractSignerGenitiveName1783090000000 implements MigrationInterface {
  name = 'AddContractSignerGenitiveName1783090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
      ADD COLUMN IF NOT EXISTS counterparty_signer_name_genitive VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
      DROP COLUMN IF EXISTS counterparty_signer_name_genitive
    `);
  }
}
