import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehousePhotoPhase1782191000000 implements MigrationInterface {
  name = 'AddWarehousePhotoPhase1782191000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_photos
      ADD COLUMN IF NOT EXISTS phase VARCHAR(20) NOT NULL DEFAULT 'reception'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_photo_vehicle_phase
      ON warehouse_photos(vehicle_id, phase, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_photo_vehicle_phase`);
    await queryRunner.query(`ALTER TABLE warehouse_photos DROP COLUMN IF EXISTS phase`);
  }
}
