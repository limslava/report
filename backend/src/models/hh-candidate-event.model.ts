import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.model';
import { HhCandidate } from './hh-candidate.model';
import { HhVacancy } from './hh-vacancy.model';
import { HhCandidateEventType, HhCandidateStage } from '../constants/hh';

@Entity('hh_candidate_events')
@Index('idx_hh_candidate_events_candidate_created', ['candidateId', 'createdAt'])
@Index('idx_hh_candidate_events_type', ['type'])
export class HhCandidateEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => HhCandidate, (candidate) => candidate.events, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: HhCandidate;

  @Column({ name: 'vacancy_id', type: 'uuid', nullable: true })
  vacancyId!: string | null;

  @ManyToOne(() => HhVacancy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vacancy_id' })
  vacancy!: HhVacancy | null;

  @Column({ type: 'varchar', length: 48 })
  type!: HhCandidateEventType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'from_stage', type: 'varchar', length: 48, nullable: true })
  fromStage!: HhCandidateStage | null;

  @Column({ name: 'to_stage', type: 'varchar', length: 48, nullable: true })
  toStage!: HhCandidateStage | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
