import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractTemplateVersions1783080000000 implements MigrationInterface {
  name = 'AddContractTemplateVersions1783080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_template_versions_template_type_enum') THEN
          CREATE TYPE contract_template_versions_template_type_enum AS ENUM (
            'income_standard',
            'income_with_psr',
            'expense',
            'addendum'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_template_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_type contract_template_versions_template_type_enum NOT NULL,
        version integer NOT NULL,
        original_name varchar(255) NOT NULL,
        storage_path varchar(500) NOT NULL,
        size_bytes integer NOT NULL DEFAULT 0,
        content_sha256 varchar(64) NOT NULL,
        placeholders jsonb,
        is_active boolean NOT NULL DEFAULT false,
        uploaded_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_contract_template_versions_uploaded_by
          FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_versions_type_version
      ON contract_template_versions(template_type, version)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_template_versions_type
      ON contract_template_versions(template_type)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_versions_active_type
      ON contract_template_versions(template_type)
      WHERE is_active = true
    `);

    await queryRunner.query(`
      ALTER TABLE contracts
      ADD COLUMN IF NOT EXISTS template_version_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
      ADD CONSTRAINT fk_contracts_template_version
      FOREIGN KEY (template_version_id) REFERENCES contract_template_versions(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contracts DROP CONSTRAINT IF EXISTS fk_contracts_template_version`);
    await queryRunner.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS template_version_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_contract_template_versions_active_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_template_versions_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_contract_template_versions_type_version`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_template_versions`);
    await queryRunner.query(`DROP TYPE IF EXISTS contract_template_versions_template_type_enum`);
  }
}
