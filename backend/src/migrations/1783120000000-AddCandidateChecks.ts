import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCandidateChecks1783120000000 implements MigrationInterface {
  name = 'AddCandidateChecks1783120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_checks_status_enum') THEN
          CREATE TYPE candidate_checks_status_enum AS ENUM (
            'pending_security',
            'approved',
            'approved_with_remarks',
            'rejected'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS candidate_checks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        candidate_full_name varchar(255) NOT NULL,
        position varchar(255),
        phone varchar(100),
        email varchar(255),
        hr_comment text,
        status candidate_checks_status_enum NOT NULL DEFAULT 'pending_security',
        security_comment text,
        created_by_user_id uuid,
        decided_by_user_id uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_candidate_checks_created_by
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_candidate_checks_decided_by
          FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_candidate_checks_status_created_at
      ON candidate_checks(status, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS candidate_check_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        candidate_check_id uuid NOT NULL,
        uploaded_by_user_id uuid,
        original_name varchar(255) NOT NULL,
        mime_type varchar(120),
        size_bytes int NOT NULL DEFAULT 0,
        storage_path varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_candidate_check_attachments_check
          FOREIGN KEY (candidate_check_id) REFERENCES candidate_checks(id) ON DELETE CASCADE,
        CONSTRAINT fk_candidate_check_attachments_uploaded_by
          FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_candidate_check_attachments_check
      ON candidate_check_attachments(candidate_check_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_candidate_check_attachments_check`);
    await queryRunner.query(`DROP TABLE IF EXISTS candidate_check_attachments`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_candidate_checks_status_created_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS candidate_checks`);
    await queryRunner.query(`DROP TYPE IF EXISTS candidate_checks_status_enum`);
  }
}
