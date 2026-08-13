import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.model';
import { encryptedContactTransformer } from '../services/hh-crypto.service';
import { HhVacancy } from './hh-vacancy.model';
import { HhCandidateEvent } from './hh-candidate-event.model';
import { HhCandidateStage, HhCandidateStatus, HhSource } from '../constants/hh';

@Entity('hh_candidates')
@Index('idx_hh_candidates_stage', ['currentStage'])
@Index('idx_hh_candidates_status', ['status'])
@Index('idx_hh_candidates_vacancy', ['vacancyId'])
@Index('uq_hh_candidates_resume_id', ['hhResumeId'], { unique: true, where: 'hh_resume_id IS NOT NULL' })
export class HhCandidate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'hh_resume_id', type: 'varchar', length: 64, nullable: true })
  hhResumeId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'manual' })
  source!: HhSource;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'integer', nullable: true })
  age!: number | null;

  // Контакты — персональные данные: в БД лежат зашифрованными (AES-256-GCM),
  // трансформер шифрует/расшифровывает прозрачно. SQL-сравнения по этим
  // колонкам не работают — для дедупликации есть phoneHash/emailHash.
  @Column({ type: 'text', nullable: true, transformer: encryptedContactTransformer })
  phone!: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedContactTransformer })
  email!: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedContactTransformer })
  messenger!: string | null;

  /** HMAC-SHA256 нормализованного телефона — для поиска дублей. */
  @Column({ name: 'phone_hash', type: 'varchar', length: 64, nullable: true })
  phoneHash!: string | null;

  /** HMAC-SHA256 нормализованного email — для поиска дублей. */
  @Column({ name: 'email_hash', type: 'varchar', length: 64, nullable: true })
  emailHash!: string | null;

  /**
   * Ретенция ПДн по событию (см. docs/HR_ACCESS_AND_PDN.md §5):
   * - отказ / закрытие вакансии -> +30 дней;
   * - кадровый резерв -> до даты из согласия кандидата (reserveConsentUntil),
   *   без записанного согласия — тоже +30 дней;
   * - принят / в работе -> хранение не ограничивается этим механизмом.
   * По наступлении retentionUntil фоновая задача обезличивает запись.
   */
  /** Код причины отказа из справочника HH_REJECTION_REASONS. */
  @Column({ name: 'rejection_reason_code', type: 'varchar', length: 40, nullable: true })
  rejectionReasonCode!: string | null;

  @Column({ name: 'reserve_consent_until', type: 'date', nullable: true })
  reserveConsentUntil!: string | null;

  @Column({ name: 'retention_until', type: 'timestamptz', nullable: true })
  retentionUntil!: Date | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ name: 'desired_salary', type: 'integer', nullable: true })
  desiredSalary!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  position!: string | null;

  @Column({ name: 'experience_text', type: 'text', nullable: true })
  experienceText!: string | null;

  @Column({ name: 'skills_text', type: 'text', nullable: true })
  skillsText!: string | null;

  @Column({ name: 'education_text', type: 'text', nullable: true })
  educationText!: string | null;

  @Column({ name: 'current_stage', type: 'varchar', length: 48, default: 'new' })
  currentStage!: HhCandidateStage;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: HhCandidateStatus;

  @Column({ name: 'vacancy_id', type: 'uuid', nullable: true })
  vacancyId!: string | null;

  @ManyToOne(() => HhVacancy, (vacancy) => vacancy.candidates, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vacancy_id' })
  vacancy!: HhVacancy | null;

  @Column({ name: 'assigned_recruiter_id', type: 'uuid', nullable: true })
  assignedRecruiterId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_recruiter_id' })
  assignedRecruiter!: User | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @Column({ name: 'last_contact_at', type: 'timestamptz', nullable: true })
  lastContactAt!: Date | null;

  @OneToMany(() => HhCandidateEvent, (event) => event.candidate)
  events!: HhCandidateEvent[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
