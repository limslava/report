import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WarehouseVehicle } from './warehouse-vehicle.model';

export type WarehouseOperationType = 'created' | 'updated' | 'received' | 'issued';

@Entity('warehouse_operations')
@Index('idx_warehouse_operation_vehicle_date', ['vehicleId', 'createdAt'])
export class WarehouseOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @ManyToOne(() => WarehouseVehicle, (vehicle) => vehicle.operations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: WarehouseVehicle;

  @Column({ type: 'varchar', length: 30 })
  type!: WarehouseOperationType;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 255 })
  actorName!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
