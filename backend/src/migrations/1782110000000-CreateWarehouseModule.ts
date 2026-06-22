import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWarehouseModule1782110000000 implements MigrationInterface {
  name = 'CreateWarehouseModule1782110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
        contract_number VARCHAR(100),
        contract_date DATE,
        service_start_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_by_id UUID NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_client_counterparty
      ON warehouse_clients(counterparty_id)
    `);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS warehouse_client_id UUID`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint constraint_record
          JOIN pg_attribute column_record
            ON column_record.attrelid = constraint_record.conrelid
           AND column_record.attnum = ANY(constraint_record.conkey)
          WHERE constraint_record.conrelid = 'users'::regclass
            AND constraint_record.contype = 'f'
            AND column_record.attname = 'warehouse_client_id'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT fk_users_warehouse_client
          FOREIGN KEY (warehouse_client_id) REFERENCES warehouse_clients(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_storage_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_number VARCHAR(100) NOT NULL,
        request_date DATE NOT NULL,
        counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        notes TEXT,
        created_by_id UUID NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_request_counterparty_number
      ON warehouse_storage_requests(counterparty_id, request_number)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_number VARCHAR(32) NOT NULL,
        counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
        storage_request_id UUID REFERENCES warehouse_storage_requests(id) ON DELETE SET NULL,
        vehicle_type VARCHAR(20) NOT NULL,
        vin VARCHAR(32),
        chassis_number VARCHAR(64),
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        registration_number VARCHAR(32),
        received_date DATE NOT NULL,
        issued_date DATE,
        fuel_level_percent SMALLINT,
        status VARCHAR(20) NOT NULL DEFAULT 'on_site',
        notes TEXT,
        created_by_id UUID NOT NULL,
        updated_by_id UUID NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_vehicle_number
      ON warehouse_vehicles(warehouse_number)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_vehicle_status_received
      ON warehouse_vehicles(status, received_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_vehicle_counterparty
      ON warehouse_vehicles(counterparty_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID NOT NULL REFERENCES warehouse_vehicles(id) ON DELETE CASCADE,
        type VARCHAR(30) NOT NULL,
        actor_user_id UUID NOT NULL,
        actor_name VARCHAR(255) NOT NULL,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_operation_vehicle_date
      ON warehouse_operations(vehicle_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID NOT NULL REFERENCES warehouse_vehicles(id) ON DELETE CASCADE,
        stored_name VARCHAR(100) NOT NULL UNIQUE,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        size_bytes INTEGER NOT NULL,
        uploaded_by_id UUID NOT NULL,
        uploaded_by_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_photo_vehicle_date
      ON warehouse_photos(vehicle_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_service_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'operation',
        default_quantity NUMERIC(12,3),
        is_repeatable BOOLEAN NOT NULL DEFAULT TRUE,
        is_operational BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_service_code
      ON warehouse_service_definitions(code)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_tariffs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id UUID NOT NULL REFERENCES warehouse_service_definitions(id) ON DELETE CASCADE,
        vehicle_type VARCHAR(20) NOT NULL,
        price NUMERIC(14,2) NOT NULL,
        valid_from DATE NOT NULL,
        valid_to DATE,
        created_by_id UUID NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_tariff_lookup
      ON warehouse_tariffs(service_id, vehicle_type, valid_from)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_performed_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID NOT NULL REFERENCES warehouse_vehicles(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES warehouse_service_definitions(id) ON DELETE RESTRICT,
        performed_at TIMESTAMPTZ NOT NULL,
        quantity NUMERIC(12,3) NOT NULL,
        unit_price NUMERIC(14,2) NOT NULL,
        total_amount NUMERIC(14,2) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        performed_by_id UUID NOT NULL,
        performed_by_name VARCHAR(255) NOT NULL,
        updated_by_id UUID NOT NULL,
        comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_performed_vehicle_date
      ON warehouse_performed_services(vehicle_id, performed_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouse_billing_periods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
        period_from DATE NOT NULL,
        period_to DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'closed',
        storage_amount NUMERIC(14,2) NOT NULL,
        services_amount NUMERIC(14,2) NOT NULL,
        total_amount NUMERIC(14,2) NOT NULL,
        snapshot JSONB NOT NULL,
        closed_by_id UUID NOT NULL,
        closed_by_name VARCHAR(255) NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_billing_period
      ON warehouse_billing_periods(counterparty_id, period_from, period_to)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_billing_period_dates
      ON warehouse_billing_periods(counterparty_id, period_from, period_to)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_warehouse_client`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS warehouse_client_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_billing_periods`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_performed_services`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_tariffs`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_service_definitions`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_photos`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_operations`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_vehicles`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_storage_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouse_clients`);
  }
}
