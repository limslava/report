import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Contract } from './contract.model';
import { User } from './user.model';

@Entity('contract_discussion_reads')
@Unique('uq_contract_discussion_reads_contract_user', ['contractId', 'userId'])
@Index('idx_contract_discussion_reads_user', ['userId'])
export class ContractDiscussionRead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'read_at', type: 'timestamptz' })
  readAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
