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
import { PlanningMetricAggregation, PlanningMetricValueType } from './planning.enums';
import { PlanningSegment } from './planning-segment.model';
import { PlanningDailyValue } from './planning-daily-value.model';

@Entity('planning_metrics')
@Index(['segmentId', 'code'], { unique: true })
export class PlanningMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'segment_id', type: 'uuid' })
  segmentId!: string;

  @ManyToOne(() => PlanningSegment, (segment) => segment.metrics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment!: PlanningSegment;

  @Column({ type: 'varchar', length: 120 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'is_editable', type: 'boolean', default: false })
  isEditable!: boolean;

  @Column({ name: 'value_type', type: 'enum', enum: PlanningMetricValueType })
  valueType!: PlanningMetricValueType;

  @Column({ type: 'enum', enum: PlanningMetricAggregation })
  aggregation!: PlanningMetricAggregation;

  @Column({ type: 'varchar', length: 120, nullable: true })
  formula!: string | null;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex!: number;

  @OneToMany(() => PlanningDailyValue, (value) => value.metric)
  values!: PlanningDailyValue[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
