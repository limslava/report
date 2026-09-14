import { MigrationInterface, QueryRunner } from 'typeorm';

const TEXT_COLUMNS = [
  'status', 'info', 'client', 'driver_name', 'vehicle_plate', 'ktk_number', 'ktk_type', 'gross_weight',
  'operation', 'terminal_from', 'slot_from', 'pin_from', 'submit_time', 'terminal_to', 'slot_to', 'pin_to',
  'driver_rate', 'vat', 'client_rate', 'passes', 'demurrage', 'extra_ton', 'seal',
];

/**
 * Текстовые поля реестра без ограничения длины: в рабочей таблице отдела в
 * «ставку»/«слот»/«простой» пишут развёрнутые пояснения (до сотен символов).
 * ALTER TYPE text не теряет данные.
 */
export class WidenDispatcherOrderText1785780000000 implements MigrationInterface {
  name = 'WidenDispatcherOrderText1785780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of TEXT_COLUMNS) {
      await queryRunner.query(`ALTER TABLE dispatcher_orders ALTER COLUMN ${column} TYPE text`);
    }
  }

  public async down(): Promise<void> {
    // обратное сужение обрезало бы данные — не выполняем
  }
}
