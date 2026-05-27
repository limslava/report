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
import { ContractApprovalStep } from './contract-approval-step.model';
import { User } from './user.model';

@Entity('contract_attachments')
@Index('idx_contract_attachments_contract', ['contractId'])
@Index('idx_contract_attachments_step', ['approvalStepId'])
@Index('idx_contract_attachments_contract_revision', ['contractId', 'revisionNo'])
export class ContractAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'approval_step_id', type: 'uuid', nullable: true })
  approvalStepId!: string | null;

  @ManyToOne(() => ContractApprovalStep, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'approval_step_id' })
  approvalStep!: ContractApprovalStep | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: User | null;

  @Column({ name: 'context', type: 'varchar', length: 40, default: 'contract' })
  context!: 'contract' | 'approval_step';

  @Column({ name: 'revision_no', type: 'int', default: 1 })
  revisionNo!: number;

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
