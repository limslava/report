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
 * Роль dispatcher_vvo упразднена (решение 2026-09-11): диспетчер — это и есть
 * менеджер КТК (manager_ktk_vvo), в интерфейсе роль переименована в
 * «Диспетчер КТК». Существующие пользователи с dispatcher_vvo (если успели
 * завести) переводятся в manager_ktk_vvo.
 */
export class RemoveDispatcherRole1785720000000 implements MigrationInterface {
  name = 'RemoveDispatcherRole1785720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`UPDATE users SET role = 'manager_ktk_vvo' WHERE role = 'dispatcher_vvo'`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES)}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Переведённых пользователей назад не различить — возвращаем только
    // ограничение с dispatcher_vvo.
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck([...ROLE_VALUES, 'dispatcher_vvo'])}))
    `);
  }
}
