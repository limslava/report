import { MigrationInterface, QueryRunner } from 'typeorm';

/** Сканы документов справочников: паспорт/ВУ сотрудника, СОР техники и прицепа. */
export class CreateDirectoryAttachments1785660000000 implements MigrationInterface {
  name = 'CreateDirectoryAttachments1785660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "directory_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity_type" character varying(16) NOT NULL,
        "entity_id" uuid NOT NULL,
        "kind" character varying(16) NOT NULL,
        "original_name" character varying(255) NOT NULL,
        "mime_type" character varying(120) NOT NULL DEFAULT '',
        "size_bytes" bigint NOT NULL,
        "storage_path" character varying(500) NOT NULL,
        "uploaded_by_id" uuid,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_directory_attachments_entity_type" ON "directory_attachments" ("entity_type")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_directory_attachments_entity_id" ON "directory_attachments" ("entity_id")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "directory_attachments"');
  }
}
