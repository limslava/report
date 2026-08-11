import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseContractEndDate1782192000000 implements MigrationInterface {
  name = 'AddWarehouseContractEndDate1782192000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_clients
      ADD COLUMN IF NOT EXISTS contract_end_date DATE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_clients
      DROP COLUMN IF EXISTS contract_end_date
    `);
  }
}
