import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseOperationTimestamps1782190000000 implements MigrationInterface {
  name = 'AddWarehouseOperationTimestamps1782190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_vehicles
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE warehouse_vehicles vehicle
      SET received_at = COALESCE(
        (
          SELECT MIN(operation.created_at)
          FROM warehouse_operations operation
          WHERE operation.vehicle_id = vehicle.id
            AND operation.type = 'created'
        ),
        (vehicle.received_date::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Vladivostok'
      )
      WHERE vehicle.received_at IS NULL
    `);

    await queryRunner.query(`
      UPDATE warehouse_vehicles vehicle
      SET issued_at = COALESCE(
        (
          SELECT MIN(operation.created_at)
          FROM warehouse_operations operation
          WHERE operation.vehicle_id = vehicle.id
            AND operation.type = 'issued'
        ),
        (vehicle.issued_date::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Vladivostok'
      )
      WHERE vehicle.issued_date IS NOT NULL
        AND vehicle.issued_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE warehouse_vehicles
      ALTER COLUMN received_at SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warehouse_vehicles
      DROP COLUMN IF EXISTS issued_at,
      DROP COLUMN IF EXISTS received_at
    `);
  }
}
