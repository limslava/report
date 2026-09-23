import { MigrationInterface, QueryRunner } from 'typeorm';

/** Галочки реестра «ЭЗЗ/ПЭ» и «ЭТРН» (решение 23.09.2026). */
export class AddDispatcherEzzEtrn1785850000000 implements MigrationInterface {
  name = 'AddDispatcherEzzEtrn1785850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS ezz_pe boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders ADD COLUMN IF NOT EXISTS etrn boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS etrn`);
    await queryRunner.query(`ALTER TABLE dispatcher_orders DROP COLUMN IF EXISTS ezz_pe`);
  }
}
