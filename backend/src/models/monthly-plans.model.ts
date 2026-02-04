import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.model';

export enum PlanRegion {
  VLADIVOSTOK = 'Владивосток',
  MOSCOW = 'Москва'
}

export enum PlanCategory {
  KTK = 'КТК',
  AUTOVOZY = 'Автовозы',
  RAILWAY = 'ЖД',
  AUTO_KTK = 'Авто в КТК',
  ADDITIONAL_SERVICES = 'Доп.услуги',
  MAINTENANCE = 'ТО авто'
}

export enum PlanSubcategory {
  CONSOLIDATED_CARGO = 'Сборный груз',
  TARPS = 'Шторы (тенты)',
  EXPEDITION = 'Экспедирование',
  REPACKING = 'Перетарки/доукрепление'
}

@Entity('monthly_plans')
export class MonthlyPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: PlanRegion,
    default: PlanRegion.VLADIVOSTOK
  })
  region!: PlanRegion;

  @Column({
    type: 'enum',
    enum: PlanCategory,
    default: PlanCategory.KTK
  })
  category!: PlanCategory;

  @Column({
    type: 'enum',
    enum: PlanSubcategory,
    nullable: true
  })
  subcategory!: PlanSubcategory | null;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number; // 1-12

  @Column({ name: 'base_plan', type: 'decimal', precision: 10, scale: 2 })
  basePlan!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  actual!: number | null;

  @Column({ name: 'adjusted_plan', type: 'decimal', precision: 10, scale: 2, nullable: true })
  adjustedPlan!: number | null;

  @Column({ name: 'carried_over', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  carriedOver!: number | null;

  @Column({ name: 'completion_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })
  completionPercentage!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  // Unique constraint for category+year+month
  // (can be defined in migration)
}