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
import { User } from './user.model';

@Entity('warehouse_clients')
@Index('uq_warehouse_client_counterparty', ['counterpartyId'], { unique: true })
export class WarehouseClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'counterparty_id', type: 'uuid' })
  counterpartyId!: string;

  @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'counterparty_id' })
  counterparty!: Counterparty;

  @Column({ name: 'contract_number', type: 'varchar', length: 100, nullable: true })
  contractNumber!: string | null;

  @Column({ name: 'contract_date', type: 'date', nullable: true })
  contractDate!: string | null;

  @Column({ name: 'service_start_date', type: 'date', nullable: true })
  serviceStartDate!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => User, (user) => user.warehouseClient)
  users!: User[];
}
