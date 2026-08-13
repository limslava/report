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
import { HhCandidate } from './hh-candidate.model';
import { HhSource, HhVacancyStatus } from '../constants/hh';

@Entity('hh_vacancies')
@Index('idx_hh_vacancies_status', ['status'])
@Index('idx_hh_vacancies_source', ['source'])
@Index('uq_hh_vacancies_hh_id', ['hhVacancyId'], { unique: true, where: 'hh_vacancy_id IS NOT NULL' })
export class HhVacancy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'hh_vacancy_id', type: 'varchar', length: 64, nullable: true })
  hhVacancyId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'manual' })
  source!: HhSource;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ name: 'manager_user_id', type: 'uuid', nullable: true })
  managerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manager_user_id' })
  managerUser!: User | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ name: 'salary_from', type: 'integer', nullable: true })
  salaryFrom!: number | null;

  @Column({ name: 'salary_to', type: 'integer', nullable: true })
  salaryTo!: number | null;

  @Column({ type: 'varchar', length: 16, default: 'RUR' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  requirements!: string | null;

  @Column({ type: 'text', nullable: true })
  responsibilities!: string | null;

  @Column({ type: 'text', nullable: true })
  benefits!: string | null;

  @Column({ name: 'opened_at', type: 'date', nullable: true })
  openedAt!: string | null;

  @Column({ name: 'target_close_at', type: 'date', nullable: true })
  targetCloseAt!: string | null;

  @Column({ name: 'closed_at', type: 'date', nullable: true })
  closedAt!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status!: HhVacancyStatus;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @OneToMany(() => HhCandidate, (candidate) => candidate.vacancy)
  candidates!: HhCandidate[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
