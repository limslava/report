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
import { ContractApprovalDecision, ContractApprovalStep } from './contract-approval-step.model';
import { User } from './user.model';

@Entity('contract_approval_decision_events')
@Index('idx_contract_decision_events_contract', ['contractId', 'createdAt'])
export class ContractApprovalDecisionEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  @Column({ name: 'approval_step_id', type: 'uuid' })
  approvalStepId!: string;

  @ManyToOne(() => ContractApprovalStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'approval_step_id' })
  approvalStep!: ContractApprovalStep;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: User;

  @Column({ name: 'role_code', type: 'varchar', length: 64 })
  roleCode!: string;

  @Column({ name: 'revision_no', type: 'int', default: 1 })
  revisionNo!: number;

  @Column({ name: 'previous_decision', type: 'varchar', length: 32, nullable: true })
  previousDecision!: ContractApprovalDecision | null;

  @Column({ name: 'new_decision', type: 'varchar', length: 32 })
  newDecision!: ContractApprovalDecision;

  @Column({ name: 'previous_comment', type: 'text', nullable: true })
  previousComment!: string | null;

  @Column({ name: 'new_comment', type: 'text', nullable: true })
  newComment!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
