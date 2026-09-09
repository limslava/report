import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Модели и нормы раздельны по городам (решение 2026-09-09): существующие записи
 * закрепляются за Владивостоком, уникальность марка+модель действует в рамках города.
 */
export class AddLocationToVehicleModels1785640000000 implements MigrationInterface {
  name = 'AddLocationToVehicleModels1785640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "location" character varying(8) NOT NULL DEFAULT \'vvo\''
    );
    // старый уникальный индекс (brand, name) — имя сгенерировано TypeORM, ищем по определению
    await queryRunner.query(`
      DO $$
      DECLARE idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'vehicle_models'
            AND indexdef LIKE '%UNIQUE%'
            AND indexdef LIKE '%brand%'
            AND indexdef NOT LIKE '%location%'
        LOOP
          EXECUTE format('DROP INDEX %I', idx.indexname);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_models_brand_name_location" ON "vehicle_models" ("brand", "name", "location")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_vehicle_models_location" ON "vehicle_models" ("location")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "uq_vehicle_models_brand_name_location"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_vehicle_models_location"');
    await queryRunner.query('ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "location"');
  }
}
