import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHhModuleFoundation1785260000000 implements MigrationInterface {
  name = 'CreateHhModuleFoundation1785260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "hh_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employer_id" varchar(64),
        "employer_name" varchar(255),
        "manager_id" varchar(64),
        "manager_name" varchar(255),
        "manager_account_id" varchar(64),
        "auth_type" varchar(64),
        "client_id" varchar(255),
        "client_secret_enc" text,
        "redirect_uri" text,
        "user_agent" varchar(255),
        "access_token_enc" text,
        "refresh_token_enc" text,
        "access_token_expires_at" timestamptz,
        "scopes_json" jsonb,
        "status" varchar(32) NOT NULL DEFAULT 'disconnected',
        "webhook_secret_enc" text,
        "last_checked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_connections" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_connections_status" CHECK ("status" IN ('active', 'needs_reauth', 'captcha_required', 'disconnected'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_hh_connections_employer" ON "hh_connections" ("employer_id") WHERE employer_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_hh_connections_status" ON "hh_connections" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "hh_oauth_states" (
        "state" varchar(128) NOT NULL,
        "created_by_user_id" uuid,
        "redirect_to" text,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_oauth_states" PRIMARY KEY ("state"),
        CONSTRAINT "fk_hh_oauth_states_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "hh_webhook_events" (
        "id" varchar(128) NOT NULL,
        "connection_id" uuid,
        "subscription_id" varchar(128),
        "action_type" varchar(100) NOT NULL,
        "payload_json" jsonb NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "status" varchar(32) NOT NULL DEFAULT 'received',
        "attempts" integer NOT NULL DEFAULT 0,
        "error" text,
        "processed_at" timestamptz,
        CONSTRAINT "pk_hh_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_webhook_events_status" CHECK ("status" IN ('received', 'processed', 'failed', 'dead')),
        CONSTRAINT "fk_hh_webhook_events_connection" FOREIGN KEY ("connection_id") REFERENCES "hh_connections"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_hh_webhook_events_connection_status" ON "hh_webhook_events" ("connection_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_hh_webhook_events_action_type" ON "hh_webhook_events" ("action_type")`);

    await queryRunner.query(`
      CREATE TABLE "hh_sync_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "connection_id" uuid,
        "job_type" varchar(80) NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "status" varchar(32) NOT NULL,
        "items_processed" integer NOT NULL DEFAULT 0,
        "items_failed" integer NOT NULL DEFAULT 0,
        "error" text,
        CONSTRAINT "pk_hh_sync_runs" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_sync_runs_status" CHECK ("status" IN ('running', 'success', 'failed', 'skipped')),
        CONSTRAINT "fk_hh_sync_runs_connection" FOREIGN KEY ("connection_id") REFERENCES "hh_connections"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_hh_sync_runs_job_started" ON "hh_sync_runs" ("job_type", "started_at")`);

    await queryRunner.query(`
      CREATE TABLE "hh_dictionaries" (
        "key" varchar(120) NOT NULL,
        "etag" varchar(255),
        "payload_json" jsonb NOT NULL,
        "fetched_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_dictionaries" PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "hh_vacancies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "hh_vacancy_id" varchar(64),
        "source" varchar(32) NOT NULL DEFAULT 'manual',
        "title" varchar(255) NOT NULL,
        "department" varchar(255),
        "manager_user_id" uuid,
        "city" varchar(120),
        "salary_from" integer,
        "salary_to" integer,
        "currency" varchar(16) NOT NULL DEFAULT 'RUR',
        "requirements" text,
        "responsibilities" text,
        "benefits" text,
        "opened_at" date,
        "target_close_at" date,
        "closed_at" date,
        "status" varchar(32) NOT NULL DEFAULT 'draft',
        "created_by_user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_vacancies" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_vacancies_source" CHECK ("source" IN ('manual', 'hh', 'farpost')),
        CONSTRAINT "chk_hh_vacancies_status" CHECK ("status" IN ('draft', 'open', 'paused', 'closed', 'archived')),
        CONSTRAINT "fk_hh_vacancies_manager" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_vacancies_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_hh_vacancies_hh_id" ON "hh_vacancies" ("hh_vacancy_id") WHERE hh_vacancy_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_hh_vacancies_status" ON "hh_vacancies" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_hh_vacancies_source" ON "hh_vacancies" ("source")`);

    await queryRunner.query(`
      CREATE TABLE "hh_candidates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "hh_resume_id" varchar(64),
        "source" varchar(32) NOT NULL DEFAULT 'manual',
        "full_name" varchar(255) NOT NULL,
        "photo_url" text,
        "age" integer,
        "phone" varchar(100),
        "email" varchar(255),
        "messenger" varchar(255),
        "city" varchar(120),
        "desired_salary" integer,
        "position" varchar(255),
        "experience_text" text,
        "skills_text" text,
        "education_text" text,
        "current_stage" varchar(48) NOT NULL DEFAULT 'new',
        "status" varchar(32) NOT NULL DEFAULT 'active',
        "vacancy_id" uuid,
        "assigned_recruiter_id" uuid,
        "created_by_user_id" uuid,
        "last_contact_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_candidates" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_candidates_source" CHECK ("source" IN ('manual', 'hh', 'farpost')),
        CONSTRAINT "chk_hh_candidates_stage" CHECK ("current_stage" IN ('new', 'screening', 'phone_interview', 'submitted_to_manager', 'manager_interview', 'offer', 'hired', 'rejected')),
        CONSTRAINT "chk_hh_candidates_status" CHECK ("status" IN ('active', 'reserve', 'hired', 'rejected')),
        CONSTRAINT "fk_hh_candidates_vacancy" FOREIGN KEY ("vacancy_id") REFERENCES "hh_vacancies"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_candidates_recruiter" FOREIGN KEY ("assigned_recruiter_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_candidates_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_hh_candidates_resume_id" ON "hh_candidates" ("hh_resume_id") WHERE hh_resume_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_hh_candidates_stage" ON "hh_candidates" ("current_stage")`);
    await queryRunner.query(`CREATE INDEX "idx_hh_candidates_status" ON "hh_candidates" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_hh_candidates_vacancy" ON "hh_candidates" ("vacancy_id")`);

    await queryRunner.query(`
      CREATE TABLE "hh_candidate_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "candidate_id" uuid NOT NULL,
        "vacancy_id" uuid,
        "type" varchar(48) NOT NULL,
        "title" varchar(255) NOT NULL,
        "comment" text,
        "from_stage" varchar(48),
        "to_stage" varchar(48),
        "due_at" timestamptz,
        "created_by_user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_candidate_events" PRIMARY KEY ("id"),
        CONSTRAINT "chk_hh_candidate_events_type" CHECK ("type" IN ('created', 'stage_changed', 'status_changed', 'comment', 'interview_scheduled', 'email_sent', 'imported')),
        CONSTRAINT "fk_hh_candidate_events_candidate" FOREIGN KEY ("candidate_id") REFERENCES "hh_candidates"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_hh_candidate_events_vacancy" FOREIGN KEY ("vacancy_id") REFERENCES "hh_vacancies"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_hh_candidate_events_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_hh_candidate_events_candidate_created" ON "hh_candidate_events" ("candidate_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_hh_candidate_events_type" ON "hh_candidate_events" ("type")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidate_events_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidate_events_candidate_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_candidate_events"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_vacancy"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_candidates_stage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_hh_candidates_resume_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_candidates"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_vacancies_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_vacancies_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_hh_vacancies_hh_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_vacancies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_dictionaries"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_sync_runs_job_started"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_sync_runs"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_webhook_events_action_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_webhook_events_connection_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_oauth_states"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hh_connections_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_hh_connections_employer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hh_connections"`);
  }
}
