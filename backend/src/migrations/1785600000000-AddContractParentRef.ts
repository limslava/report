import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Допсоглашение теперь можно завести без основного договора в системе.
 * Реквизиты такого договора (если известны) хранятся текстом.
 */
export class AddContractParentRef1785600000000 implements MigrationInterface {
  name = 'AddContractParentRef1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "parent_contract_ref" character varying(255)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "contracts" DROP COLUMN IF EXISTS "parent_contract_ref"');
  }
}
