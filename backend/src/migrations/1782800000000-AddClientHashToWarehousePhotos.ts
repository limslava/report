import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientHashToWarehousePhotos1782800000000 implements MigrationInterface {
  name = 'AddClientHashToWarehousePhotos1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_photos
      ADD COLUMN IF NOT EXISTS client_hash VARCHAR(80)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_photo_vehicle_hash
      ON warehouse_photos(vehicle_id, client_hash)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_photo_vehicle_hash`);
    await queryRunner.query(`
      ALTER TABLE warehouse_photos
      DROP COLUMN IF EXISTS client_hash
    `);
  }
}
