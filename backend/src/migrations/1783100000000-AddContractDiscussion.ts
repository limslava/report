import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractDiscussion1783100000000 implements MigrationInterface {
  name = 'AddContractDiscussion1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_discussion_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL,
        author_user_id uuid,
        author_name_snapshot varchar(255) NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_contract_discussion_messages_contract
          FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        CONSTRAINT fk_contract_discussion_messages_author
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_discussion_messages_contract
      ON contract_discussion_messages(contract_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_discussion_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL,
        message_id uuid NOT NULL,
        uploaded_by_user_id uuid,
        original_name varchar(255) NOT NULL,
        mime_type varchar(120),
        size_bytes integer NOT NULL DEFAULT 0,
        storage_path varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_contract_discussion_attachments_contract
          FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        CONSTRAINT fk_contract_discussion_attachments_message
          FOREIGN KEY (message_id) REFERENCES contract_discussion_messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_contract_discussion_attachments_uploader
          FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_discussion_attachments_contract
      ON contract_discussion_attachments(contract_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_discussion_attachments_message
      ON contract_discussion_attachments(message_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_discussion_attachments_message`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_discussion_attachments_contract`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_discussion_attachments`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_discussion_messages_contract`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_discussion_messages`);
  }
}
