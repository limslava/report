import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.model';

@Entity('manual_entries')
export class ManualEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  department!: 'container_vladivostok' | 'container_moscow' | 'railway' | 'autotruck' | 'additional';

  @Column({ type: 'date' })
  entryDate!: Date;

  @Column({ type: 'varchar', length: 50 })
  entryType!: 'val_total' | 'overload_debt' | 'cashback_debt';

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  value!: number;

  @Column({ type: 'varchar', length: 10, default: 'RUB' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'entered_by' })
  enteredBy!: User;

  @CreateDateColumn({ name: 'entered_at' })
  enteredAt!: Date;
}