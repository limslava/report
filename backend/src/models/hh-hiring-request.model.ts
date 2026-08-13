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
import { HhHiringRequestStatus } from '../constants/hh';
import { User } from './user.model';
import { HhVacancy } from './hh-vacancy.model';
import { HhCandidateSubmission } from './hh-candidate-submission.model';

/**
 * Заявка на подбор от руководителя подразделения.
 * Маршрута согласования нет по решению заказчика: создал — рекрутер увидел.
 */
@Entity('hh_hiring_requests')
@Index('idx_hh_hiring_requests_status', ['status'])
@Index('idx_hh_hiring_requests_author', ['createdByUserId'])
export class HhHiringRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Кого нужно найти. */
  @Column({ type: 'varchar', length: 255 })
  position!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  /** Сколько человек требуется. */
  @Column({ type: 'int', default: 1 })
  headcount!: number;

  /** Причина: замена, расширение штата, новая функция. */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  requirements!: string | null;

  @Column({ type: 'text', nullable: true })
  responsibilities!: string | null;

  @Column({ name: 'salary_from', type: 'int', nullable: true })
  salaryFrom!: number | null;

  @Column({ name: 'salary_to', type: 'int', nullable: true })
  salaryTo!: number | null;

  /** К какой дате нужен сотрудник. */
  @Column({ name: 'needed_by', type: 'date', nullable: true })
  neededBy!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'new' })
  status!: HhHiringRequestStatus;

  /** Комментарий рекрутера автору заявки. */
  @Column({ name: 'recruiter_comment', type: 'text', nullable: true })
  recruiterComment!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @Column({ name: 'assigned_recruiter_id', type: 'uuid', nullable: true })
  assignedRecruiterId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_recruiter_id' })
  assignedRecruiter!: User | null;

  /** Вакансия, которую рекрутер завёл по этой заявке. */
  @Column({ name: 'vacancy_id', type: 'uuid', nullable: true })
  vacancyId!: string | null;

  @ManyToOne(() => HhVacancy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vacancy_id' })
  vacancy!: HhVacancy | null;

  @OneToMany(() => HhCandidateSubmission, (submission) => submission.request)
  submissions!: HhCandidateSubmission[];

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
