import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.model';
import { CandidateCheckAttachment } from './candidate-check-attachment.model';

export enum CandidateCheckStatus {
  PENDING_SECURITY = 'pending_security',
  APPROVED = 'approved',
  APPROVED_WITH_REMARKS = 'approved_with_remarks',
  REJECTED = 'rejected',
}

@Entity('candidate_checks')
export class CandidateCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'candidate_full_name', type: 'varchar', length: 255 })
  candidateFullName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  position!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'hr_comment', type: 'text', nullable: true })
  hrComment!: string | null;

  @Column({
    type: 'enum',
    enum: CandidateCheckStatus,
    default: CandidateCheckStatus.PENDING_SECURITY,
  })
  status!: CandidateCheckStatus;

  @Column({ name: 'security_comment', type: 'text', nullable: true })
  securityComment!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedByUser!: User | null;

  @OneToMany(() => CandidateCheckAttachment, (attachment) => attachment.candidateCheck)
  attachments!: CandidateCheckAttachment[];

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
