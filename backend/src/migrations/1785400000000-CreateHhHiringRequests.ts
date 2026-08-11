import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Заявки на подбор от руководителей и отправка кандидатов автору заявки.
 * Маршрута согласования заявки нет: создал — рекрутер увидел.
 */
export class CreateHhHiringRequests1785400000000 implements MigrationInterface {
  name = 'CreateHhHiringRequests1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hh_hiring_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "position" character varying(255) NOT NULL,
        "department" character varying(255),
        "city" character varying(120),
        "headcount" integer NOT NULL DEFAULT 1,
        "reason" text,
        "requirements" text,
        "responsibilities" text,
        "salary_from" integer,
        "salary_to" integer,
        "needed_by" date,
        "status" character varying(32) NOT NULL DEFAULT 'new',
        "recruiter_comment" text,
        "created_by_user_id" uuid,
        "assigned_recruiter_id" uuid,
        "vacancy_id" uuid,
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_hiring_requests" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_hiring_requests_status"
          CHECK ("status" IN ('new', 'in_progress', 'closed', 'cancelled')),
        CONSTRAINT "chk_hh_hiring_requests_headcount" CHECK ("headcount" > 0),
        CONSTRAINT "fk_hh_hiring_requests_author"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_hiring_requests_recruiter"
          FOREIGN KEY ("assigned_recruiter_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_hiring_requests_vacancy"
          FOREIGN KEY ("vacancy_id") REFERENCES "hh_vacancies"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_hiring_requests_status"
        ON "hh_hiring_requests" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_hiring_requests_author"
        ON "hh_hiring_requests" ("created_by_user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hh_candidate_submissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "recruiter_note" text,
        "submitted_by_user_id" uuid,
        "decision" character varying(32) NOT NULL DEFAULT 'pending',
        "decision_comment" text,
        "decided_by_user_id" uuid,
        "decided_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_candidate_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_hh_submission_request_candidate" UNIQUE ("request_id", "candidate_id"),
        CONSTRAINT "chk_hh_submissions_decision"
          CHECK ("decision" IN ('pending', 'approved', 'rejected')),
        CONSTRAINT "fk_hh_submissions_request"
          FOREIGN KEY ("request_id") REFERENCES "hh_hiring_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_hh_submissions_candidate"
          FOREIGN KEY ("candidate_id") REFERENCES "hh_candidates"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_hh_submissions_submitted_by"
          FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_submissions_decided_by"
          FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_submissions_request_decision"
        ON "hh_candidate_submissions" ("request_id", "decision")
    `);

    // Индексы под фильтры и поиск в реестре кандидатов (ранее seq scan).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_candidates_stage" ON "hh_candidates" ("current_stage")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_candidates_status" ON "hh_candidates" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hh_candidates_vacancy" ON "hh_candidates" ("vacancy_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_vacancy"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_stage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_candidate_submissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_hiring_requests"`);
  }
}
