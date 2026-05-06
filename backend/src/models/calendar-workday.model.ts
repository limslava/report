import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('calendar_workdays')
export class CalendarWorkday {
  @PrimaryColumn({ type: 'date' })
  date!: string; // YYYY-MM-DD

  @Column({ name: 'is_workday', type: 'boolean', default: true })
  isWorkday!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  comment!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
