import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('operations_preview_state')
export class OperationsPreviewState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scope_key', type: 'varchar', length: 64, unique: true })
  scopeKey!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ name: 'updated_by_user_id', type: 'varchar', length: 64, nullable: true })
  updatedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
