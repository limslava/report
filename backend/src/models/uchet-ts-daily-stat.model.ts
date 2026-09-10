import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Буфер ежедневных показателей из внешней программы учёта ТС (SimpleWozi).
 * Одна строка = один день. Заполняется импортёром по их API
 * (GET /api/external/reports/daily-shipments) или тестовым генератором.
 * Числовые поля nullable: если их API какую-то метрику не отдаёт,
 * в сверке она показывается как «нет данных», а не как ноль.
 */
@Entity('uchet_ts_daily_stats')
@Unique('uq_uchet_ts_daily_stats_date', ['statDate'])
export class UchetTsDailyStat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'stat_date', type: 'date' })
  statDate!: string;

  @Column({ name: 'ktk_received', type: 'integer', nullable: true })
  ktkReceived!: number | null;

  @Column({ name: 'ktk_sent', type: 'integer', nullable: true })
  ktkSent!: number | null;

  @Column({ name: 'ktk_waiting', type: 'integer', nullable: true })
  ktkWaiting!: number | null;

  @Column({ name: 'autocarrier_received', type: 'integer', nullable: true })
  autocarrierReceived!: number | null;

  @Column({ name: 'autocarrier_sent', type: 'integer', nullable: true })
  autocarrierSent!: number | null;

  @Column({ name: 'autocarrier_sent_own', type: 'integer', nullable: true })
  autocarrierSentOwn!: number | null;

  @Column({ name: 'autocarrier_sent_hired', type: 'integer', nullable: true })
  autocarrierSentHired!: number | null;

  @Column({ name: 'autocarrier_waiting', type: 'integer', nullable: true })
  autocarrierWaiting!: number | null;

  @Column({ name: 'curtain_received', type: 'integer', nullable: true })
  curtainReceived!: number | null;

  @Column({ name: 'curtain_sent', type: 'integer', nullable: true })
  curtainSent!: number | null;

  @Column({ name: 'curtain_waiting', type: 'integer', nullable: true })
  curtainWaiting!: number | null;

  /** Сырой фрагмент ответа их API за этот день — для отладки маппинга. */
  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload!: unknown | null;

  /** 'api' — импорт из SimpleWozi, 'mock' — тестовый генератор на деве. */
  @Column({ type: 'varchar', length: 16, default: 'api' })
  source!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
