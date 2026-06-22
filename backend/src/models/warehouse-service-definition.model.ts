import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WarehousePerformedService } from './warehouse-performed-service.model';
import { WarehouseTariff } from './warehouse-tariff.model';

export type WarehouseServiceUnit = 'operation' | 'liter' | 'day';

@Entity('warehouse_service_definitions')
@Index('uq_warehouse_service_code', ['code'], { unique: true })
export class WarehouseServiceDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'operation' })
  unit!: WarehouseServiceUnit;

  @Column({ name: 'default_quantity', type: 'decimal', precision: 12, scale: 3, nullable: true })
  defaultQuantity!: string | null;

  @Column({ name: 'is_repeatable', type: 'boolean', default: true })
  isRepeatable!: boolean;

  @Column({ name: 'is_operational', type: 'boolean', default: true })
  isOperational!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => WarehouseTariff, (tariff) => tariff.service)
  tariffs!: WarehouseTariff[];

  @OneToMany(() => WarehousePerformedService, (performed) => performed.service)
  performedServices!: WarehousePerformedService[];
}
