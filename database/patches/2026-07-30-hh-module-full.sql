-- Полная установка модуля подбора (HR) на существующую базу Report.
--
-- Объединяет две миграции:
--   1785260000000-CreateHhModuleFoundation  — базовые таблицы модуля
--   1785400000000-CreateHhHiringRequests    — заявки на подбор и отправка кандидатов
--
-- Идемпотентно: можно применять повторно. Ничего, кроме таблиц hh_*, не трогает.
-- Сгенерировано из файлов миграций, поэтому расходиться с ними не может.
--
-- Применение:
--   docker exec -i logistics_postgres psql -U postgres -d logistics_reporting < database/patches/2026-07-30-hh-module-full.sql
-- либо:
--   PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d logistics_reporting -f database/patches/2026-07-30-hh-module-full.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'users') THEN
    RAISE EXCEPTION 'Нет таблицы users — это не база Report. Проверьте имя БД.';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "hh_connections" (
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
      );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hh_connections_employer" ON "hh_connections" ("employer_id") WHERE employer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_hh_connections_status" ON "hh_connections" ("status");

CREATE TABLE IF NOT EXISTS "hh_oauth_states" (
        "state" varchar(128) NOT NULL,
        "created_by_user_id" uuid,
        "redirect_to" text,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_oauth_states" PRIMARY KEY ("state"),
        CONSTRAINT "fk_hh_oauth_states_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );

CREATE TABLE IF NOT EXISTS "hh_webhook_events" (
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
      );

CREATE INDEX IF NOT EXISTS "idx_hh_webhook_events_connection_status" ON "hh_webhook_events" ("connection_id", "status");

CREATE INDEX IF NOT EXISTS "idx_hh_webhook_events_action_type" ON "hh_webhook_events" ("action_type");

CREATE TABLE IF NOT EXISTS "hh_sync_runs" (
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
      );

CREATE INDEX IF NOT EXISTS "idx_hh_sync_runs_job_started" ON "hh_sync_runs" ("job_type", "started_at");

CREATE TABLE IF NOT EXISTS "hh_dictionaries" (
        "key" varchar(120) NOT NULL,
        "etag" varchar(255),
        "payload_json" jsonb NOT NULL,
        "fetched_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_hh_dictionaries" PRIMARY KEY ("key")
      );

CREATE TABLE IF NOT EXISTS "hh_vacancies" (
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
      );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hh_vacancies_hh_id" ON "hh_vacancies" ("hh_vacancy_id") WHERE hh_vacancy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_hh_vacancies_status" ON "hh_vacancies" ("status");

CREATE INDEX IF NOT EXISTS "idx_hh_vacancies_source" ON "hh_vacancies" ("source");

CREATE TABLE IF NOT EXISTS "hh_candidates" (
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
      );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hh_candidates_resume_id" ON "hh_candidates" ("hh_resume_id") WHERE hh_resume_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_stage" ON "hh_candidates" ("current_stage");

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_status" ON "hh_candidates" ("status");

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_vacancy" ON "hh_candidates" ("vacancy_id");

CREATE TABLE IF NOT EXISTS "hh_candidate_events" (
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
      );

CREATE INDEX IF NOT EXISTS "idx_hh_candidate_events_candidate_created" ON "hh_candidate_events" ("candidate_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_hh_candidate_events_type" ON "hh_candidate_events" ("type");

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
      );

CREATE INDEX IF NOT EXISTS "idx_hh_hiring_requests_status"
        ON "hh_hiring_requests" ("status");

CREATE INDEX IF NOT EXISTS "idx_hh_hiring_requests_author"
        ON "hh_hiring_requests" ("created_by_user_id");

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
      );

CREATE INDEX IF NOT EXISTS "idx_hh_submissions_request_decision"
        ON "hh_candidate_submissions" ("request_id", "decision");

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_stage" ON "hh_candidates" ("current_stage");

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_status" ON "hh_candidates" ("status");

CREATE INDEX IF NOT EXISTS "idx_hh_candidates_vacancy" ON "hh_candidates" ("vacancy_id");

-- Отмечаем обе миграции применёнными, чтобы typeorm их не повторил.
INSERT INTO "typeorm_migrations" ("timestamp", "name")
SELECT v.ts, v.nm FROM (VALUES
  (1785260000000::bigint, 'CreateHhModuleFoundation1785260000000'),
  (1785400000000::bigint, 'CreateHhHiringRequests1785400000000')
) AS v(ts, nm)
WHERE EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'typeorm_migrations')
  AND NOT EXISTS (SELECT 1 FROM "typeorm_migrations" m WHERE m."name" = v.nm);

SELECT 'Готово. Модуль подбора установлен: ' ||
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'hh_%') || ' таблиц hh_*.' AS result;
