import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Индивидуальные тарифы клиентов склада (решение 2026-09-14): у тарифа
 * появляется необязательный контрагент. NULL — базовый тариф для всех.
 */
export class AddWarehouseClientTariffs1785730000000 implements MigrationInterface {
  name = 'AddWarehouseClientTariffs1785730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_tariffs
      ADD COLUMN IF NOT EXISTS counterparty_id uuid NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_warehouse_tariffs_counterparty'
        ) THEN
          ALTER TABLE warehouse_tariffs
          ADD CONSTRAINT fk_warehouse_tariffs_counterparty
          FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_tariff_counterparty
      ON warehouse_tariffs (counterparty_id, service_id, vehicle_type, valid_from)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM warehouse_tariffs WHERE counterparty_id IS NOT NULL`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_tariff_counterparty`);
    await queryRunner.query(`ALTER TABLE warehouse_tariffs DROP CONSTRAINT IF EXISTS fk_warehouse_tariffs_counterparty`);
    await queryRunner.query(`ALTER TABLE warehouse_tariffs DROP COLUMN IF EXISTS counterparty_id`);
  }
}
