import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type!: 'daily' | 'monthly' | 'summary';

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  department!: string | null;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath!: string;

  @CreateDateColumn({ name: 'generated_at' })
  generatedAt!: Date;
}