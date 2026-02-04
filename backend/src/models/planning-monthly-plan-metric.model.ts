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
import { PlanningMonthlyPlan } from './planning-monthly-plan.model';
import { PlanningPlanMetricCode } from './planning.enums';

@Entity('planning_monthly_plan_metrics')
@Index(['planMonthlyId', 'code'], { unique: true })
export class PlanningMonthlyPlanMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'plan_monthly_id', type: 'uuid' })
  planMonthlyId!: string;

  @ManyToOne(() => PlanningMonthlyPlan, (plan) => plan.planMetrics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_monthly_id' })
  planMonthly!: PlanningMonthlyPlan;

  @Column({ type: 'enum', enum: PlanningPlanMetricCode })
  code!: PlanningPlanMetricCode;

  @Column({ name: 'base_plan', type: 'int', nullable: true })
  basePlan!: number | null;

  @Column({ name: 'carry_plan', type: 'int', nullable: true })
  carryPlan!: number | null;

  @Column({ name: 'carry_mode', type: 'varchar', length: 32, nullable: true })
  carryMode!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
