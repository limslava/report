import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PlanningSegment } from './planning-segment.model';
import { PlanningMonthlyPlanMetric } from './planning-monthly-plan-metric.model';

@Entity('planning_monthly_plans')
@Index(['segmentId', 'year', 'month'], { unique: true })
export class PlanningMonthlyPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'segment_id', type: 'uuid' })
  segmentId!: string;

  @ManyToOne(() => PlanningSegment, (segment) => segment.monthlyPlans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment!: PlanningSegment;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ type: 'jsonb', nullable: true })
  params!: Record<string, unknown> | null;

  @OneToMany(() => PlanningMonthlyPlanMetric, (metric) => metric.planMonthly)
  planMetrics!: PlanningMonthlyPlanMetric[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
