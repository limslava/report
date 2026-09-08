import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Водители/техника/прицепы контрагентов живут в тех же справочных таблицах:
 * NULL в counterparty_id — наша организация, иначе — запись контрагента.
 * Списки нашей организации и подсказки графиков фильтруют по NULL.
 */
export class AddCounterpartyToDirectories1785630000000 implements MigrationInterface {
  name = 'AddCounterpartyToDirectories1785630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['directory_employees', 'fleet_vehicles', 'trailers']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "counterparty_id" uuid`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_${table}_counterparty" ON "${table}" ("counterparty_id")`
      );
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_counterparty"
            FOREIGN KEY ("counterparty_id") REFERENCES "directory_counterparties"("id") ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['directory_employees', 'fleet_vehicles', 'trailers']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "fk_${table}_counterparty"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_counterparty"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "counterparty_id"`);
    }
  }
}
