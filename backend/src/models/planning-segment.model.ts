import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { PlanningSegmentCode } from './planning.enums';
import { PlanningMetric } from './planning-metric.model';
import { PlanningDailyValue } from './planning-daily-value.model';
import { PlanningMonthlyPlan } from './planning-monthly-plan.model';

@Entity('planning_segments')
export class PlanningSegment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({
    type: 'enum',
    enum: PlanningSegmentCode,
  })
  code!: PlanningSegmentCode;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @OneToMany(() => PlanningMetric, (metric) => metric.segment)
  metrics!: PlanningMetric[];

  @OneToMany(() => PlanningDailyValue, (value) => value.segment)
  dailyValues!: PlanningDailyValue[];

  @OneToMany(() => PlanningMonthlyPlan, (plan) => plan.segment)
  monthlyPlans!: PlanningMonthlyPlan[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
