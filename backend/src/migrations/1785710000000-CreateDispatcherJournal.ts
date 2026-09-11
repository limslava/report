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
  'dispatcher_vvo',
] as const;

const buildRoleCheck = (roles: readonly string[]) => roles.map((role) => `'${role}'`).join(', ');

/** Статусы из выпадающего списка google-таблицы диспетчеров (цвета приближены к гуглу). */
const STATUS_SEED: Array<[string, string]> = [
  ['выполнена', '#38761d'],
  ['новая', '#f4cccc'],
  ['стоп', '#990000'],
  ['не везем', '#990000'],
  ['выдано', '#674ea7'],
  ['в обработке', '#d9d2e9'],
  ['короткая', '#efefef'],
  ['не откреплен', '#d9ead3'],
  ['Бронь', '#fce5cd'],
  ['слот готовности', '#d5348c'],
  ['Готов', '#38761d'],
  ['Закопан', '#00ff00'],
  ['запросила доступ', '#efefef'],
  ['отмена', '#ff00ff'],
  ['продлить коммерческий', '#fff2cc'],
  ['Штормовое', '#cfe2f3'],
  ['На терминале', '#674ea7'],
  ['Негабарит', '#990000'],
  ['сортировка', '#1c4587'],
  ['кран в ремонте', '#f4cccc'],
  ['с контейнером', '#fff2cc'],
  ['СРОЧНЫЙ', '#1c4587'],
  ['не принимают', '#f4cccc'],
  ['доверенность', '#efefef'],
  ['Ожидает подтверждения', '#990000'],
  ['Срочный до 00', '#00ffbf'],
  ['прибыл ктк согласован', '#6cd9ea'],
  ['опасник наклейки', '#990000'],
  ['перецеп', '#674ea7'],
  ['закрыть склад', '#990000'],
  ['не в доступе', '#434343'],
  ['не готов', '#ff0000'],
  ['Спецприцеп', '#d9d2e9'],
  ['нет мест', '#f4cccc'],
  ['прибыл согласован', '#674ea7'],
  ['передать экспедитору', '#ffe599'],
  ['Уведомления о прибытии', '#cfe2f3'],
  ['Прибыл', '#00ff00'],
  ['отменен пин', '#d9d2e9'],
  ['Отправили уведомление', '#990000'],
  ['Прибыл нет заявки', '#990000'],
  ['уточнить по готовности', '#990000'],
  ['Шарк Интермодал', '#d9ead3'],
  ['таможенные документы', '#990000'],
  ['секция в то', '#990000'],
];

/**
 * Диспетчерский журнал КТК Владивосток: таблица заявок (перенос google-таблицы
 * отдела), справочник статусов и новая роль dispatcher_vvo.
 */
export class CreateDispatcherJournal1785710000000 implements MigrationInterface {
  name = 'CreateDispatcherJournal1785710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(ROLE_VALUES)}))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatcher_statuses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL,
        color varchar(7) NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uq_dispatcher_statuses_name UNIQUE (name)
      )
    `);

    for (let index = 0; index < STATUS_SEED.length; index += 1) {
      const [name, color] = STATUS_SEED[index];
      await queryRunner.query(
        `INSERT INTO dispatcher_statuses (name, color, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT uq_dispatcher_statuses_name DO NOTHING`,
        [name, color, (index + 1) * 10],
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatcher_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_date date NOT NULL,
        status varchar(64),
        info varchar(255),
        client varchar(255),
        driver_name varchar(255),
        vehicle_plate varchar(64),
        ktk_number varchar(32),
        ktk_type varchar(16),
        gross_weight varchar(64),
        comments text,
        operation varchar(64),
        terminal_from varchar(255),
        slot_from varchar(64),
        pin_from varchar(64),
        submit_time varchar(32),
        delivery_address text,
        terminal_to varchar(255),
        slot_to varchar(64),
        pin_to varchar(64),
        driver_rate varchar(32),
        vat varchar(16),
        client_rate varchar(32),
        passes varchar(255),
        extra_address text,
        demurrage varchar(64),
        order_on_vehicle boolean NOT NULL DEFAULT false,
        invoice_sent boolean NOT NULL DEFAULT false,
        extra_ton varchar(64),
        seal varchar(64),
        recoupling boolean NOT NULL DEFAULT false,
        driver_remarks text,
        created_by uuid,
        updated_by uuid,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispatcher_orders_date ON dispatcher_orders (order_date)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dispatcher_orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS dispatcher_statuses`);
    const rolesWithoutDispatcher = ROLE_VALUES.filter((role) => role !== 'dispatcher_vvo');
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN (${buildRoleCheck(rolesWithoutDispatcher)}))
    `);
  }
}
