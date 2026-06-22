import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Counterparty } from './counterparty.model';
import { WarehouseStorageRequest } from './warehouse-storage-request.model';
import { WarehouseOperation } from './warehouse-operation.model';
import { WarehousePhoto } from './warehouse-photo.model';
import { WarehousePerformedService } from './warehouse-performed-service.model';

export type WarehouseVehicleType = 'passenger' | 'truck';
export type WarehouseVehicleStatus = 'expected' | 'on_site' | 'issued';

@Entity('warehouse_vehicles')
@Index('uq_warehouse_vehicle_number', ['warehouseNumber'], { unique: true })
@Index('idx_warehouse_vehicle_status_received', ['status', 'receivedDate'])
@Index('idx_warehouse_vehicle_counterparty', ['counterpartyId'])
export class WarehouseVehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'warehouse_number', type: 'varchar', length: 32 })
  warehouseNumber!: string;

  @Column({ name: 'counterparty_id', type: 'uuid' })
  counterpartyId!: string;

  @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'counterparty_id' })
  counterparty!: Counterparty;

  @Column({ name: 'storage_request_id', type: 'uuid', nullable: true })
  storageRequestId!: string | null;

  @ManyToOne(() => WarehouseStorageRequest, (request) => request.vehicles, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'storage_request_id' })
  storageRequest!: WarehouseStorageRequest | null;

  @Column({ name: 'vehicle_type', type: 'varchar', length: 20 })
  vehicleType!: WarehouseVehicleType;

  @Column({ type: 'varchar', length: 32, nullable: true })
  vin!: string | null;

  @Column({ name: 'chassis_number', type: 'varchar', length: 64, nullable: true })
  chassisNumber!: string | null;

  @Column({ type: 'varchar', length: 100 })
  brand!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'registration_number', type: 'varchar', length: 32, nullable: true })
  registrationNumber!: string | null;

  @Column({ name: 'received_date', type: 'date' })
  receivedDate!: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'issued_date', type: 'date', nullable: true })
  issuedDate!: string | null;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'fuel_level_percent', type: 'smallint', nullable: true })
  fuelLevelPercent!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'on_site' })
  status!: WarehouseVehicleStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @Column({ name: 'updated_by_id', type: 'uuid' })
  updatedById!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => WarehouseOperation, (operation) => operation.vehicle)
  operations!: WarehouseOperation[];

  @OneToMany(() => WarehousePhoto, (photo) => photo.vehicle)
  photos!: WarehousePhoto[];

  @OneToMany(() => WarehousePerformedService, (service) => service.vehicle)
  performedServices!: WarehousePerformedService[];
}
