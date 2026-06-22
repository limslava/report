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
import { WarehouseVehicle } from './warehouse-vehicle.model';

export type WarehouseRequestStatus = 'open' | 'closed' | 'cancelled';

@Entity('warehouse_storage_requests')
@Index('uq_warehouse_request_counterparty_number', ['counterpartyId', 'requestNumber'], { unique: true })
export class WarehouseStorageRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_number', type: 'varchar', length: 100 })
  requestNumber!: string;

  @Column({ name: 'request_date', type: 'date' })
  requestDate!: string;

  @Column({ name: 'counterparty_id', type: 'uuid' })
  counterpartyId!: string;

  @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'counterparty_id' })
  counterparty!: Counterparty;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: WarehouseRequestStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => WarehouseVehicle, (vehicle) => vehicle.storageRequest)
  vehicles!: WarehouseVehicle[];
}
