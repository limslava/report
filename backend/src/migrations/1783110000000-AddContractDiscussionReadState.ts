import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractDiscussionReadState1783110000000 implements MigrationInterface {
  name = 'AddContractDiscussionReadState1783110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_discussion_messages
      ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_discussion_reads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL,
        user_id uuid NOT NULL,
        read_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_contract_discussion_reads_contract
          FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        CONSTRAINT fk_contract_discussion_reads_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT uq_contract_discussion_reads_contract_user
          UNIQUE (contract_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_discussion_reads_user
      ON contract_discussion_reads(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_discussion_reads_contract_user
      ON contract_discussion_reads(contract_id, user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_discussion_reads_contract_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contract_discussion_reads_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_discussion_reads`);
    await queryRunner.query(`ALTER TABLE contract_discussion_messages DROP COLUMN IF EXISTS mentioned_user_ids`);
  }
}
