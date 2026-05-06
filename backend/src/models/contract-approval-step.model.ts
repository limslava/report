import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contract } from './contract.model';
import { User } from './user.model';

export enum ContractApprovalDecision {
  APPROVE = 'approve',
  REWORK = 'rework',
  REJECT = 'reject',
}

@Entity('contract_approval_steps')
@Index('idx_contract_steps_contract', ['contractId'])
@Index('idx_contract_steps_contract_order', ['contractId', 'orderNo'])
export class ContractApprovalStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, (contract) => contract.approvalSteps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'role_code', type: 'varchar', length: 64 })
  roleCode!: string;

  @Column({ name: 'approver_user_id', type: 'uuid' })
  approverUserId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'approver_user_id' })
  approverUser!: User;

  @Column({ name: 'order_no', type: 'int' })
  orderNo!: number;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'signed_at', type: 'timestamp', nullable: true })
  signedAt!: Date | null;

  @Column({ name: 'decision', type: 'enum', enum: ContractApprovalDecision, nullable: true })
  decision!: ContractApprovalDecision | null;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'sla_workdays', type: 'int', default: 1 })
  slaWorkdays!: number;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt!: Date | null;

  @Column({ name: 'deadline_at', type: 'timestamp', nullable: true })
  deadlineAt!: Date | null;

  @Column({ name: 'reminder_before_sent_at', type: 'timestamp', nullable: true })
  reminderBeforeSentAt!: Date | null;

  @Column({ name: 'reminder_deadline_sent_at', type: 'timestamp', nullable: true })
  reminderDeadlineSentAt!: Date | null;

  @Column({ name: 'reminder_overdue_sent_at', type: 'timestamp', nullable: true })
  reminderOverdueSentAt!: Date | null;

  @Column({ name: 'escalation_sent_at', type: 'timestamp', nullable: true })
  escalationSentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
