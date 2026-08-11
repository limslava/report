import { MigrationInterface, QueryRunner } from 'typeorm';
import { encryptHhSecret, hashHhContact, looksEncrypted } from '../services/hh-crypto.service';

/**
 * Защита персональных данных кандидатов:
 *  - контакты (phone/email/messenger) шифруются AES-256-GCM;
 *  - для дедупликации вводятся детерминированные хэши phone_hash/email_hash;
 *  - поля ретенции: reserve_consent_until, retention_until, anonymized_at.
 *
 * Идемпотентна: колонки через IF NOT EXISTS, перешифровка пропускает значения,
 * уже имеющие формат шифртекста.
 */
export class AddCandidateContactProtection1785410000000 implements MigrationInterface {
  name = 'AddCandidateContactProtection1785410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // varchar -> text: шифртекст длиннее исходных значений.
    await queryRunner.query(`ALTER TABLE "hh_candidates" ALTER COLUMN "phone" TYPE text`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ALTER COLUMN "email" TYPE text`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ALTER COLUMN "messenger" TYPE text`);

    await queryRunner.query(`ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "phone_hash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "email_hash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "reserve_consent_until" date`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" ADD COLUMN IF NOT EXISTS "anonymized_at" TIMESTAMP WITH TIME ZONE`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_hh_candidates_phone_hash" ON "hh_candidates" ("phone_hash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_hh_candidates_email_hash" ON "hh_candidates" ("email_hash")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_hh_candidates_retention" ON "hh_candidates" ("retention_until") WHERE "anonymized_at" IS NULL`,
    );

    // Перешифровка существующих значений. На базах без кандидатов — no-op.
    const rows: Array<{ id: string; phone: string | null; email: string | null; messenger: string | null }> =
      await queryRunner.query(
        `SELECT "id", "phone", "email", "messenger" FROM "hh_candidates" ` +
        `WHERE "phone" IS NOT NULL OR "email" IS NOT NULL OR "messenger" IS NOT NULL`,
      );
    for (const row of rows) {
      const phonePlain = row.phone && !looksEncrypted(row.phone) ? row.phone : null;
      const emailPlain = row.email && !looksEncrypted(row.email) ? row.email : null;
      const messengerPlain = row.messenger && !looksEncrypted(row.messenger) ? row.messenger : null;
      if (!phonePlain && !emailPlain && !messengerPlain) continue;
      await queryRunner.query(
        `UPDATE "hh_candidates" SET ` +
        `"phone" = COALESCE($2, "phone"), ` +
        `"email" = COALESCE($3, "email"), ` +
        `"messenger" = COALESCE($4, "messenger"), ` +
        `"phone_hash" = COALESCE($5, "phone_hash"), ` +
        `"email_hash" = COALESCE($6, "email_hash") ` +
        `WHERE "id" = $1`,
        [
          row.id,
          phonePlain ? encryptHhSecret(phonePlain) : null,
          emailPlain ? encryptHhSecret(emailPlain) : null,
          messengerPlain ? encryptHhSecret(messengerPlain) : null,
          phonePlain ? hashHhContact('phone', phonePlain) : null,
          emailPlain ? hashHhContact('email', emailPlain) : null,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Расшифровку данных down не выполняет (ключ может быть недоступен);
    // удаляются только служебные поля.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_retention"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_email_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_phone_hash"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "anonymized_at"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "retention_until"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "reserve_consent_until"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "email_hash"`);
    await queryRunner.query(`ALTER TABLE "hh_candidates" DROP COLUMN IF EXISTS "phone_hash"`);
  }
}
