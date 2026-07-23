import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.model';

export enum ContractTemplateType {
  INCOME_STANDARD = 'income_standard',
  INCOME_WITH_PSR = 'income_with_psr',
  INCOME_AGENCY_STANDARD = 'income_agency_standard',
  INCOME_AGENCY_WITH_PSR = 'income_agency_with_psr',
  EXPENSE = 'expense',
  ADDENDUM = 'addendum',
}

@Entity('contract_template_versions')
@Index('idx_contract_template_versions_type', ['templateType'])
@Index('idx_contract_template_versions_active', ['templateType', 'isActive'])
export class ContractTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_type', type: 'enum', enum: ContractTemplateType })
  templateType!: ContractTemplateType;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath!: string;

  @Column({ name: 'size_bytes', type: 'int', default: 0 })
  sizeBytes!: number;

  @Column({ name: 'content_sha256', type: 'varchar', length: 64 })
  contentSha256!: string;

  @Column({ name: 'placeholders', type: 'jsonb', nullable: true })
  placeholders!: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
