import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('counterparties')
@Index('uq_counterparties_inn', ['inn'], { unique: true })
export class Counterparty {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 12 })
  inn!: string;

  @Column({ name: 'name_full', type: 'varchar', length: 500 })
  nameFull!: string;

  @Column({ name: 'name_short', type: 'varchar', length: 255, nullable: true })
  nameShort!: string | null;

  @Column({ name: 'counterparty_form', type: 'varchar', length: 32, nullable: true })
  counterpartyForm!: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  ogrn!: string | null;

  @Column({ type: 'varchar', length: 9, nullable: true })
  kpp!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source!: 'manual' | 'fns';

  @Column({ name: 'source_payload', type: 'jsonb', nullable: true })
  sourcePayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
