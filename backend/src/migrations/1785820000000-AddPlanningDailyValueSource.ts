import { MigrationInterface, QueryRunner } from 'typeorm';

/** Источник значения ежедневного отчёта: расчёт из реестра ('auto') или правка поверх расчёта ('manual'). */
export class AddPlanningDailyValueSource1785820000000 implements MigrationInterface {
  name = 'AddPlanningDailyValueSource1785820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE planning_daily_values ADD COLUMN IF NOT EXISTS source varchar(16) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE planning_daily_values DROP COLUMN IF EXISTS source`);
  }
}
