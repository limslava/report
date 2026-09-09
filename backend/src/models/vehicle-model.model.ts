import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Справочник моделей техники. Нормы расхода живут на модели, а не на машине:
 * одна запись «Volvo FH — 41,5/38,0» покрывает весь парк этой модели.
 * Модели раздельны по городам (решение 2026-09-09): у ВВО и МСК свои списки
 * и свои нормы, существующие записи закреплены за 'vvo'.
 */
@Entity('vehicle_models')
@Index(['brand', 'name', 'location'], { unique: true })
export class VehicleModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8, default: 'vvo' })
  location!: 'vvo' | 'mow';

  @Column({ type: 'varchar', length: 120 })
  brand!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  name!: string;

  @Column({ name: 'fuel_norm_winter', type: 'numeric', precision: 6, scale: 2, nullable: true })
  fuelNormWinter!: string | null;

  @Column({ name: 'fuel_norm_summer', type: 'numeric', precision: 6, scale: 2, nullable: true })
  fuelNormSummer!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
