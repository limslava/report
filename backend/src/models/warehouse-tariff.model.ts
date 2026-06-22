import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WarehouseServiceDefinition } from './warehouse-service-definition.model';
import { WarehouseVehicleType } from './warehouse-vehicle.model';

@Entity('warehouse_tariffs')
@Index('idx_warehouse_tariff_lookup', ['serviceId', 'vehicleType', 'validFrom'])
export class WarehouseTariff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => WarehouseServiceDefinition, (service) => service.tariffs, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_id' })
  service!: WarehouseServiceDefinition;

  @Column({ name: 'vehicle_type', type: 'varchar', length: 20 })
  vehicleType!: WarehouseVehicleType;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  price!: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom!: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
