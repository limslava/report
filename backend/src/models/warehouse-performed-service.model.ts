import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WarehouseServiceDefinition } from './warehouse-service-definition.model';
import { WarehouseVehicle } from './warehouse-vehicle.model';

@Entity('warehouse_performed_services')
@Index('idx_warehouse_performed_vehicle_date', ['vehicleId', 'performedAt'])
export class WarehousePerformedService {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @ManyToOne(() => WarehouseVehicle, (vehicle) => vehicle.performedServices, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: WarehouseVehicle;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => WarehouseServiceDefinition, (service) => service.performedServices, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'service_id' })
  service!: WarehouseServiceDefinition;

  @Column({ name: 'performed_at', type: 'timestamptz' })
  performedAt!: Date;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  unitPrice!: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 14, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 20 })
  unit!: string;

  @Column({ name: 'performed_by_id', type: 'uuid' })
  performedById!: string;

  @Column({ name: 'performed_by_name', type: 'varchar', length: 255 })
  performedByName!: string;

  @Column({ name: 'updated_by_id', type: 'uuid' })
  updatedById!: string;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
