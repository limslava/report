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

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'archived';

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
