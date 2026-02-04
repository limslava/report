import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.model';

@Entity('operational_data')
export class OperationalData {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  department!: 'container_vladivostok' | 'container_moscow' | 'railway' | 'autotruck' | 'additional';

  @Column({ type: 'date' })
  recordDate!: Date;

  @Column({ type: 'varchar', length: 100 })
  category!: string; // 'Выгрузка/выгрузка - план', 'Перемещение - факт'

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value!: number;

  @Column({ name: 'is_plan', type: 'boolean' })
  isPlan!: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}