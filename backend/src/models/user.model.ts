import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { WarehouseClient } from './warehouse-client.model';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  role!:
    | 'manager_sales'
    | 'head_sales'
    | 'manager_ktk_vvo'
    | 'head_ktk_vvo'
    | 'manager_ktk_mow'
    | 'head_ktk_mow'
    | 'head_hr'
    | 'hr_specialist'
    | 'garage_head_vvo'
    | 'garage_head'
    | 'manager_auto'
    | 'manager_rail'
    | 'manager_extra'
    | 'manager_to'
    | 'warehouse_manager'
    | 'warehouse_keeper'
    | 'warehouse_receiver'
    | 'counterparty_user'
    | 'financer'
    | 'chief_accountant'
    | 'lawyer'
    | 'security'
    | 'secretary'
    | 'director'
    | 'general_director'
    | 'admin';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

  @Column({ name: 'workday_start', type: 'varchar', length: 5, nullable: true })
  workdayStart!: string | null;

  @Column({ name: 'workday_end', type: 'varchar', length: 5, nullable: true })
  workdayEnd!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  workdays!: string | null;

  @Column({ name: 'warehouse_client_id', type: 'uuid', nullable: true })
  warehouseClientId!: string | null;

  @ManyToOne(() => WarehouseClient, (client) => client.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'warehouse_client_id' })
  warehouseClient!: WarehouseClient | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Virtual property for plain password (not stored)
  password?: string;
}
