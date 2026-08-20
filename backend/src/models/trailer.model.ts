import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import type { FleetLocation } from './fleet-vehicle.model';

/** Справочник прицепов: у прицепа свой госномер, сцепка задаётся в карточке сотрудника. */
@Entity('trailers')
export class Trailer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  location!: FleetLocation;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  plate!: string;

  /** Тип прицепа: автовозный/контейнерный; пусто — не указан (необязательное). */
  @Column({ type: 'varchar', length: 20, default: '' })
  kind!: '' | 'auto' | 'container';

  /** Марка (Schmitz, Krone…) — пока свободный текст. */
  @Column({ type: 'varchar', length: 120, default: '' })
  brand!: string;

  /** Количество осей — пока свободный текст. */
  @Column({ type: 'varchar', length: 40, default: '' })
  axles!: string;

  /** Футовость (20/40/45…) — пока свободный текст. */
  @Column({ type: 'varchar', length: 40, default: '' })
  footage!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'repair' | 'archived';

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
