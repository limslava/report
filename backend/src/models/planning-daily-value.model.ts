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
import { PlanningSegment } from './planning-segment.model';
import { PlanningMetric } from './planning-metric.model';
import { User } from './user.model';

@Entity('planning_daily_values')
@Index(['date', 'metricId'], { unique: true })
@Index(['segmentId', 'date'])
export class PlanningDailyValue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ name: 'segment_id', type: 'uuid' })
  segmentId!: string;

  @ManyToOne(() => PlanningSegment, (segment) => segment.dailyValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment!: PlanningSegment;

  @Column({ name: 'metric_id', type: 'uuid' })
  metricId!: string;

  @ManyToOne(() => PlanningMetric, (metric) => metric.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'metric_id' })
  metric!: PlanningMetric;

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
