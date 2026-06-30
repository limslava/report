import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehousePhotoChecklistItem1782194000000 implements MigrationInterface {
  name = 'AddWarehousePhotoChecklistItem1782194000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_photos
      ADD COLUMN IF NOT EXISTS checklist_item VARCHAR(64)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_photo_vehicle_checklist
      ON warehouse_photos(vehicle_id, phase, checklist_item)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_photo_vehicle_checklist`);
    await queryRunner.query(`
      ALTER TABLE warehouse_photos
      DROP COLUMN IF EXISTS checklist_item
    `);
  }
}
