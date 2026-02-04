import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MonthlyPlan } from './monthly-plans.model';
import { User } from './user.model';

@Entity('plan_history')
export class PlanHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MonthlyPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: MonthlyPlan;

  @Column({ name: 'field_name', type: 'varchar', length: 50 })
  fieldName!: 'basePlan' | 'actual' | 'adjustedPlan' | 'carriedOver';

  @Column({ name: 'old_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  oldValue!: number | null;

  @Column({ name: 'new_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  newValue!: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by_id' })
  changedBy!: User;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt!: Date;

  @Column({ type: 'text', nullable: true })
  reason?: string;
}