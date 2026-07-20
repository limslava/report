import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contract } from './contract.model';
import { User } from './user.model';
import { ContractDiscussionAttachment } from './contract-discussion-attachment.model';

@Entity('contract_discussion_messages')
@Index('idx_contract_discussion_messages_contract', ['contractId', 'createdAt'])
export class ContractDiscussionMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  authorUser!: User | null;

  @Column({ name: 'author_name_snapshot', type: 'varchar', length: 255 })
  authorNameSnapshot!: string;

  @Column({ name: 'body', type: 'text' })
  body!: string;

  @Column({ name: 'mentioned_user_ids', type: 'uuid', array: true, default: () => "'{}'" })
  mentionedUserIds!: string[];

  @OneToMany(() => ContractDiscussionAttachment, (attachment) => attachment.message)
  attachments!: ContractDiscussionAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
