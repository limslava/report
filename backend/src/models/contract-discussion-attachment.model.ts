import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contract } from './contract.model';
import { ContractDiscussionMessage } from './contract-discussion-message.model';
import { User } from './user.model';

@Entity('contract_discussion_attachments')
@Index('idx_contract_discussion_attachments_contract', ['contractId'])
@Index('idx_contract_discussion_attachments_message', ['messageId'])
export class ContractDiscussionAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => ContractDiscussionMessage, (message) => message.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: ContractDiscussionMessage;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: User | null;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'size_bytes', type: 'int', default: 0 })
  sizeBytes!: number;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
