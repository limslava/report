import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WarehousePhotoPhase } from './warehouse-photo.model';

@Entity('warehouse_pending_photo_uploads')
@Index('idx_warehouse_pending_photo_session', ['uploadSessionId'])
@Index('idx_warehouse_pending_photo_hash', ['uploadSessionId', 'clientHash'])
@Index('uq_warehouse_pending_photo_upload', ['uploadSessionId', 'uploadedById', 'clientHash'], { unique: true })
@Index('idx_warehouse_pending_photo_expires', ['expiresAt'])
export class WarehousePendingPhotoUpload {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'upload_session_id', type: 'varchar', length: 120 })
  uploadSessionId!: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 100 })
  storedName!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ name: 'client_hash', type: 'varchar', length: 80 })
  clientHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'reception' })
  phase!: WarehousePhotoPhase;

  @Column({ name: 'checklist_item', type: 'varchar', length: 64, nullable: true })
  checklistItem!: string | null;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById!: string;

  @Column({ name: 'uploaded_by_name', type: 'varchar', length: 255 })
  uploadedByName!: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
