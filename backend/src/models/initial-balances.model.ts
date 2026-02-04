import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.model';

@Entity('initial_balances')
export class InitialBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  department!: 'container_vladivostok' | 'container_moscow' | 'railway' | 'autotruck' | 'additional';

  @Column({ type: 'date' })
  balanceDate!: Date;

  @Column({ type: 'varchar', length: 50 })
  category!: 'Автовоз' | 'КТК' | 'Штора';

  @Column({ name: 'balance_value', type: 'decimal', precision: 10, scale: 2 })
  balanceValue!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'entered_by' })
  enteredBy!: User;

  @CreateDateColumn({ name: 'entered_at' })
  enteredAt!: Date;
}