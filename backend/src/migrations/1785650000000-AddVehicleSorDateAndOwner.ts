import { MigrationInterface, QueryRunner } from 'typeorm';

/** Дата выдачи СОР и собственник в карточке техники (замечания от 2026-09-09). */
export class AddVehicleSorDateAndOwner1785650000000 implements MigrationInterface {
  name = 'AddVehicleSorDateAndOwner1785650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fleet_vehicles" ADD COLUMN IF NOT EXISTS "sor_issue_date" date');
    await queryRunner.query(
      "ALTER TABLE \"fleet_vehicles\" ADD COLUMN IF NOT EXISTS \"owner\" character varying(200) NOT NULL DEFAULT ''"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "sor_issue_date"');
    await queryRunner.query('ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "owner"');
  }
}
