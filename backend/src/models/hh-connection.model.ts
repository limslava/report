import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HhConnectionStatus } from '../constants/hh';

@Entity('hh_connections')
@Index('idx_hh_connections_status', ['status'])
@Index('uq_hh_connections_employer', ['employerId'], { unique: true, where: 'employer_id IS NOT NULL' })
export class HhConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employer_id', type: 'varchar', length: 64, nullable: true })
  employerId!: string | null;

  @Column({ name: 'employer_name', type: 'varchar', length: 255, nullable: true })
  employerName!: string | null;

  @Column({ name: 'manager_id', type: 'varchar', length: 64, nullable: true })
  managerId!: string | null;

  @Column({ name: 'manager_name', type: 'varchar', length: 255, nullable: true })
  managerName!: string | null;

  @Column({ name: 'manager_account_id', type: 'varchar', length: 64, nullable: true })
  managerAccountId!: string | null;

  @Column({ name: 'auth_type', type: 'varchar', length: 64, nullable: true })
  authType!: string | null;

  @Column({ name: 'client_id', type: 'varchar', length: 255, nullable: true })
  clientId!: string | null;

  @Column({ name: 'client_secret_enc', type: 'text', nullable: true })
  clientSecretEnc!: string | null;

  @Column({ name: 'redirect_uri', type: 'text', nullable: true })
  redirectUri!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'access_token_enc', type: 'text', nullable: true })
  accessTokenEnc!: string | null;

  @Column({ name: 'refresh_token_enc', type: 'text', nullable: true })
  refreshTokenEnc!: string | null;

  @Column({ name: 'access_token_expires_at', type: 'timestamptz', nullable: true })
  accessTokenExpiresAt!: Date | null;

  @Column({ name: 'scopes_json', type: 'jsonb', nullable: true })
  scopesJson!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: 'disconnected' })
  status!: HhConnectionStatus;

  @Column({ name: 'webhook_secret_enc', type: 'text', nullable: true })
  webhookSecretEnc!: string | null;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
