import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgencyTemplateTypes1783150000000 implements MigrationInterface {
  name = 'AddAgencyTemplateTypes1783150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "contract_template_versions_template_type_enum"
      ADD VALUE IF NOT EXISTS 'income_agency_standard'
    `);
    await queryRunner.query(`
      ALTER TYPE "contract_template_versions_template_type_enum"
      ADD VALUE IF NOT EXISTS 'income_agency_with_psr'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL не поддерживает удаление значений из enum-типа (DROP VALUE),
    // поэтому откат оставлен пустым: значения 'income_agency_standard' и
    // 'income_agency_with_psr' остаются в типе contract_template_versions_template_type_enum.
  }
}
