import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehousePhotoUploadUniqueness1782801000000 implements MigrationInterface {
  name = 'AddWarehousePhotoUploadUniqueness1782801000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM warehouse_pending_photo_uploads keep
      USING warehouse_pending_photo_uploads dup
      WHERE keep.upload_session_id = dup.upload_session_id
        AND keep.uploaded_by_id = dup.uploaded_by_id
        AND keep.client_hash = dup.client_hash
        AND keep.created_at > dup.created_at
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_pending_photo_upload
      ON warehouse_pending_photo_uploads(upload_session_id, uploaded_by_id, client_hash)
    `);

    await queryRunner.query(`
      DELETE FROM warehouse_photos keep
      USING warehouse_photos dup
      WHERE keep.vehicle_id = dup.vehicle_id
        AND keep.client_hash IS NOT NULL
        AND keep.client_hash = dup.client_hash
        AND keep.created_at > dup.created_at
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_photo_vehicle_hash
      ON warehouse_photos(vehicle_id, client_hash)
      WHERE client_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_warehouse_photo_vehicle_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_warehouse_pending_photo_upload`);
  }
}
