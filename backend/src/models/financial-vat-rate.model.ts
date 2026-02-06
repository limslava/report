import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.model';

@Entity('financial_vat_rates')
@Index(['effectiveFrom'], { unique: true })
export class FinancialVatRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: Date;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  rate!: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
