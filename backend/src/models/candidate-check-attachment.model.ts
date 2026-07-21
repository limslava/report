import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CandidateCheck } from './candidate-check.model';
import { User } from './user.model';

@Entity('candidate_check_attachments')
@Index('idx_candidate_check_attachments_check', ['candidateCheckId'])
export class CandidateCheckAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'candidate_check_id', type: 'uuid' })
  candidateCheckId!: string;

  @ManyToOne(() => CandidateCheck, (candidateCheck) => candidateCheck.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_check_id' })
  candidateCheck!: CandidateCheck;

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
