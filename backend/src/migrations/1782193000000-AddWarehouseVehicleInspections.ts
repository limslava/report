import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseVehicleInspections1782193000000 implements MigrationInterface {
  name = 'AddWarehouseVehicleInspections1782193000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_vehicle_inspections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID NOT NULL REFERENCES warehouse_vehicles(id) ON DELETE CASCADE,
        phase VARCHAR(20) NOT NULL,
        vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        documents_and_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
        equipment JSONB NOT NULL DEFAULT '{}'::jsonb,
        technical_condition JSONB NOT NULL DEFAULT '{}'::jsonb,
        photo_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
        damage_notes TEXT,
        personal_items_notes TEXT,
        responsibility_amount NUMERIC(14,2),
        inspected_by_id UUID NOT NULL,
        inspected_by_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_vehicle_inspection_phase
      ON warehouse_vehicle_inspections(vehicle_id, phase)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_warehouse_vehicle_inspection_phase`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_vehicle_inspections`);
  }
}
