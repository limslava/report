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
import { Counterparty } from './counterparty.model';

export type WarehouseBillingPeriodStatus = 'closed';

@Entity('warehouse_billing_periods')
@Index('uq_warehouse_billing_period', ['counterpartyId', 'periodFrom', 'periodTo'], { unique: true })
@Index('idx_warehouse_billing_period_dates', ['counterpartyId', 'periodFrom', 'periodTo'])
export class WarehouseBillingPeriod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'counterparty_id', type: 'uuid' })
  counterpartyId!: string;

  @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'counterparty_id' })
  counterparty!: Counterparty;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom!: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo!: string;

  @Column({ type: 'varchar', length: 20, default: 'closed' })
  status!: WarehouseBillingPeriodStatus;

  @Column({ name: 'storage_amount', type: 'decimal', precision: 14, scale: 2 })
  storageAmount!: string;

  @Column({ name: 'services_amount', type: 'decimal', precision: 14, scale: 2 })
  servicesAmount!: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 14, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ name: 'closed_by_id', type: 'uuid' })
  closedById!: string;

  @Column({ name: 'closed_by_name', type: 'varchar', length: 255 })
  closedByName!: string;

  @Column({ name: 'closed_at', type: 'timestamptz' })
  closedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
