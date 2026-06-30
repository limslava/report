import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehousePendingPhotoUploads1782195000000 implements MigrationInterface {
  name = 'AddWarehousePendingPhotoUploads1782195000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_pending_photo_uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        upload_session_id VARCHAR(120) NOT NULL,
        stored_name VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        size_bytes INTEGER NOT NULL,
        client_hash VARCHAR(80) NOT NULL,
        phase VARCHAR(20) NOT NULL DEFAULT 'reception',
        checklist_item VARCHAR(64),
        uploaded_by_id UUID NOT NULL,
        uploaded_by_name VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_pending_photo_session
      ON warehouse_pending_photo_uploads(upload_session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_pending_photo_hash
      ON warehouse_pending_photo_uploads(upload_session_id, client_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_pending_photo_expires
      ON warehouse_pending_photo_uploads(expires_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_pending_photo_expires`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_pending_photo_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_warehouse_pending_photo_session`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_pending_photo_uploads`);
  }
}
