import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HhSyncRunStatus } from '../constants/hh';
import { HhConnection } from './hh-connection.model';

@Entity('hh_sync_runs')
@Index('idx_hh_sync_runs_job_started', ['jobType', 'startedAt'])
export class HhSyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId!: string | null;

  @ManyToOne(() => HhConnection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connection_id' })
  connection!: HhConnection | null;

  @Column({ name: 'job_type', type: 'varchar', length: 80 })
  jobType!: string;

  @CreateDateColumn({ name: 'started_at' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'varchar', length: 32 })
  status!: HhSyncRunStatus;

  @Column({ name: 'items_processed', type: 'int', default: 0 })
  itemsProcessed!: number;

  @Column({ name: 'items_failed', type: 'int', default: 0 })
  itemsFailed!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}
