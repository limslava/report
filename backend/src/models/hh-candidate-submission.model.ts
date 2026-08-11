import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { HhSubmissionDecision } from '../constants/hh';
import { User } from './user.model';
import { HhCandidate } from './hh-candidate.model';
import { HhHiringRequest } from './hh-hiring-request.model';

/**
 * Кандидат, отправленный рекрутером автору заявки на рассмотрение.
 *
 * Автор заявки видит только обезличенный профессиональный профиль (должность,
 * опыт, навыки, образование, город, ожидания по ЗП) — по принципу минимизации
 * объёма обрабатываемых данных (ст. 5 ч. 5 152-ФЗ). ФИО, фото и контакты для
 * решения «подходит ли по опыту» не нужны и не передаются.
 */
@Entity('hh_candidate_submissions')
@Unique('uq_hh_submission_request_candidate', ['requestId', 'candidateId'])
@Index('idx_hh_submissions_request_decision', ['requestId', 'decision'])
export class HhCandidateSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => HhHiringRequest, (request) => request.submissions, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: HhHiringRequest;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => HhCandidate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: HhCandidate;

  /** Комментарий рекрутера: почему прислал этого кандидата. */
  @Column({ name: 'recruiter_note', type: 'text', nullable: true })
  recruiterNote!: string | null;

  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_by_user_id' })
  submittedByUser!: User | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  decision!: HhSubmissionDecision;

  /** Код причины отказа заказчика из справочника HH_REJECTION_REASONS. */
  @Column({ name: 'decision_reason_code', type: 'varchar', length: 40, nullable: true })
  decisionReasonCode!: string | null;

  @Column({ name: 'decision_comment', type: 'text', nullable: true })
  decisionComment!: string | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedByUser!: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
