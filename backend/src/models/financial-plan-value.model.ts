import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.model';

@Entity('financial_plan_values')
@Index(['year', 'month', 'groupCode', 'directionCode', 'metricCode'], { unique: true })
export class FinancialPlanValue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'group_code', type: 'varchar', length: 32 })
  groupCode!: string;

  @Column({ name: 'direction_code', type: 'varchar', length: 64 })
  directionCode!: string;

  @Column({ name: 'metric_code', type: 'varchar', length: 64 })
  metricCode!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  value!: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
