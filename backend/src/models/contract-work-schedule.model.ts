import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type WorkScheduleScope = 'global' | 'role' | 'user';

@Entity('contract_work_schedules')
@Index('idx_contract_work_schedule_unique', ['scope', 'roleCode', 'userId'], { unique: true })
export class ContractWorkSchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  scope!: WorkScheduleScope;

  @Column({ name: 'role_code', type: 'varchar', length: 64, nullable: true })
  roleCode!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Vladivostok' })
  timezone!: string;

  @Column({ name: 'workday_start', type: 'varchar', length: 5, default: '09:00' })
  workdayStart!: string;

  @Column({ name: 'workday_end', type: 'varchar', length: 5, default: '18:00' })
  workdayEnd!: string;

  @Column({ type: 'varchar', length: 32, default: '1,2,3,4,5' })
  workdays!: string; // CSV of JS weekdays, where 0=Sun ... 6=Sat

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
