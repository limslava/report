import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLE_VALUES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'chief_accountant',
  'deputy_chief_accountant',
  'lawyer',
  'security',
  'secretary',
  'manager_sales',
  'head_sales',
  'manager_ktk_vvo',
  'head_ktk_vvo',
  'manager_ktk_mow',
  'head_ktk_mow',
  'head_hr',
  'hr_specialist',
  'hr_recruiter',
  'garage_head_vvo',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'warehouse_manager_vvo',
  'warehouse_keeper',
  'counterparty_user',
  'bdd_specialist_vvo',
  'bdd_specialist_mow',
] as const;

const buildRoleCheck = (roles: readonly string[]) => roles.map((role) => `'${role}'`).join(', ');

/**
 * Консолидация ролей (решения 2026-09-10, Роли_Report_v2.xlsx):
 * garage_head → garage_head_vvo (дубль); manager_to и warehouse_manager →
 * warehouse_manager_vvo («Заведующий складом»: склад ТС + показатели ТО +
 * график склада); новая роль deputy_chief_accountant (права главбуха).
 */
export class ConsolidateRoles1785680000000 implements MigrationInterface {
  name = 'ConsolidateRoles1785680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`UPDATE users SET role = 'garage_head_vvo' WHERE role = 'garage_head'`);
    await queryRunner.query(`UPDATE users SET role = 'warehouse_manager_vvo' WHERE role IN ('manager_to', 'warehouse_manager')`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES)}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // объединённые роли назад не разложить — снимаем только новое ограничение
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  }
}
