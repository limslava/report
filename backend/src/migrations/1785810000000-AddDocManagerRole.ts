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
  'doc_manager_vvo',
] as const;

const buildRoleCheck = (roles: readonly string[]) => roles.map((role) => `'${role}'`).join(', ');

/** Роль «Менеджер документационного отдела» (Владивосток, диспетчерский отдел) — решение 15.09.2026. */
export class AddDocManagerRole1785810000000 implements MigrationInterface {
  name = 'AddDocManagerRole1785810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES)}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES.filter((role) => role !== 'doc_manager_vvo'))}))
    `);
  }
}
