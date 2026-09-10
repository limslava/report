import { MigrationInterface, QueryRunner } from 'typeorm';

/** Буфер ежедневных показателей из программы учёта ТС (SimpleWozi). */
export class CreateUchetTsDailyStats1785700000000 implements MigrationInterface {
  name = 'CreateUchetTsDailyStats1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "uchet_ts_daily_stats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stat_date" date NOT NULL,
        "ktk_received" integer,
        "ktk_sent" integer,
        "ktk_waiting" integer,
        "autocarrier_received" integer,
        "autocarrier_sent" integer,
        "autocarrier_sent_own" integer,
        "autocarrier_sent_hired" integer,
        "autocarrier_waiting" integer,
        "curtain_received" integer,
        "curtain_sent" integer,
        "curtain_waiting" integer,
        "raw_payload" jsonb,
        "source" character varying(16) NOT NULL DEFAULT 'api',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uq_uchet_ts_daily_stats_date" UNIQUE ("stat_date"),
        CONSTRAINT "pk_uchet_ts_daily_stats" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "uchet_ts_daily_stats"');
  }
}
