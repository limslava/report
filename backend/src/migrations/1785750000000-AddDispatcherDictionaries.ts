import { MigrationInterface, QueryRunner } from 'typeorm';
import { DISPATCHER_DICTIONARY_SEED } from '../models/dispatcher-dictionary-item.model';

/** Справочники реестра диспетчеров: типы КТК, варианты НДС (в т.ч. «нал»), операции. */
export class AddDispatcherDictionaries1785750000000 implements MigrationInterface {
  name = 'AddDispatcherDictionaries1785750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatcher_dictionary_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind varchar(32) NOT NULL,
        name varchar(128) NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uq_dispatcher_dictionary_items_kind_name UNIQUE (kind, name)
      )
    `);
    for (const [kind, names] of Object.entries(DISPATCHER_DICTIONARY_SEED)) {
      for (let index = 0; index < names.length; index += 1) {
        await queryRunner.query(
          `INSERT INTO dispatcher_dictionary_items (kind, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT ON CONSTRAINT uq_dispatcher_dictionary_items_kind_name DO NOTHING`,
          [kind, names[index], (index + 1) * 10],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dispatcher_dictionary_items`);
  }
}
