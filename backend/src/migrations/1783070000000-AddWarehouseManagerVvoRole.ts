import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLE_VALUES = [
  'admin',
  'director',
  'general_director',
  'financer',
  'chief_accountant',
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
  'garage_head_vvo',
  'garage_head',
  'manager_auto',
  'manager_rail',
  'manager_extra',
  'manager_to',
  'warehouse_manager_vvo',
  'warehouse_manager',
  'warehouse_keeper',
  'counterparty_user',
] as const;

const buildRoleCheck = (roles: readonly string[]) => roles.map((role) => `'${role}'`).join(', ');

export class AddWarehouseManagerVvoRole1783070000000 implements MigrationInterface {
  name = 'AddWarehouseManagerVvoRole1783070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES)}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rolesWithoutWarehouseManagerVvo = ROLE_VALUES.filter((role) => role !== 'warehouse_manager_vvo');
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(rolesWithoutWarehouseManagerVvo)}))
    `);
  }
}
