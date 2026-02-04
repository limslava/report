import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('email_schedules')
export class EmailSchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  department!: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  frequency!: 'daily' | 'weekly' | 'monthly';

  @Column({ type: 'jsonb' })
  schedule!: {
    time: string; // '09:00'
    daysOfWeek?: number[]; // 1-7 для weekly
    dayOfMonth?: number; // 1-31 для monthly
    reportType?: 'sv_pdf' | 'planning_v2_segment';
    timezone?: string; // IANA TZ, e.g. Asia/Vladivostok
  };

  @Column({ type: 'jsonb' })
  recipients!: string[]; // emails

  @Column({ name: 'is_active', type: 'boolean' })
  isActive!: boolean;

  @Column({ name: 'last_sent', type: 'timestamp', nullable: true })
  lastSent!: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
