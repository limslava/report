import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DirectoryAttachmentEntityType = 'employee' | 'vehicle' | 'trailer';

/** Виды документов: паспорт и ВУ — у сотрудников, СОР — у техники и прицепов. */
export type DirectoryAttachmentKind = 'passport' | 'license' | 'sor';

/**
 * Сканы документов к записям справочников (паспорт/ВУ сотрудника, СОР техники
 * и прицепа). Файлы лежат в UPLOAD_PATH/directory-docs, в БД — только метаданные.
 */
@Entity('directory_attachments')
export class DirectoryAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'entity_type', type: 'varchar', length: 16 })
  entityType!: DirectoryAttachmentEntityType;

  @Index()
  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: DirectoryAttachmentKind;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, default: '' })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath!: string;

  @Column({ name: 'uploaded_by_id', type: 'uuid', nullable: true })
  uploadedById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
