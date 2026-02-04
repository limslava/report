import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('department_metrics')
export class DepartmentMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  department!: 'container_vladivostok' | 'container_moscow' | 'railway' | 'autotruck' | 'additional';

  @Column({ type: 'date' })
  metricDate!: Date;

  @Column({ type: 'varchar', length: 50 })
  metricType!: 'monthly_plan' | 'daily_plan' | 'completion' | 'daily_actual' | 'monthly_completion' | 'daily_completion' | 'daily_average' | 'total_value' | 'daily_value' | 'avg_request_value' | 'avg_vehicles' | 'total_waiting' | 'autotruck_waiting' | 'ktk_waiting' | 'curtain_waiting' | 'overload_debt' | 'cashback_debt';

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  value!: number | null;

  @Column({ name: 'is_calculated', type: 'boolean', default: false })
  isCalculated!: boolean;

  @Column({ type: 'text', nullable: true })
  formula!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Unique constraint for department+metricDate+metricType
}