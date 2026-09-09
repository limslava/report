import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Чистка дублей фотографий склада ТС.
 *
 * Эндпоинт прямой загрузки (/vehicles/:id/photos) не имел идемпотентности:
 * на плохой связи клиент не получал ответ и слал фото повторно — на сервере
 * появлялись дубли (client_hash IS NULL), раздувавшие счётчик к лимиту 60.
 * Удаляем повторы с совпадающими vehicle_id + original_name + size_bytes +
 * phase, оставляя самую раннюю запись. Файлы дублей на диске не трогаем
 * (осиротевшие файлы безопасны и малы по объёму).
 */
export class DedupeWarehousePhotos1785690000000 implements MigrationInterface {
  name = 'DedupeWarehousePhotos1785690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM warehouse_photos a
      USING warehouse_photos b
      WHERE a.id <> b.id
        AND a.vehicle_id = b.vehicle_id
        AND a.original_name = b.original_name
        AND a.size_bytes = b.size_bytes
        AND a.phase = b.phase
        AND a.client_hash IS NULL
        AND (b.created_at < a.created_at OR (b.created_at = a.created_at AND b.id < a.id))
    `);
  }

  public async down(): Promise<void> {
    // Удалённые дубли не восстанавливаются.
  }
}
