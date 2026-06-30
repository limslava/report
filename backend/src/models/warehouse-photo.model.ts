import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WarehouseVehicle } from './warehouse-vehicle.model';

export type WarehousePhotoPhase = 'reception' | 'issue';

@Entity('warehouse_photos')
@Index('idx_warehouse_photo_vehicle_date', ['vehicleId', 'createdAt'])
@Index('idx_warehouse_photo_vehicle_hash', ['vehicleId', 'clientHash'])
@Index('uq_warehouse_photo_vehicle_hash', ['vehicleId', 'clientHash'], {
  unique: true,
  where: 'client_hash IS NOT NULL',
})
export class WarehousePhoto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @ManyToOne(() => WarehouseVehicle, (vehicle) => vehicle.photos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: WarehouseVehicle;

  @Column({ name: 'stored_name', type: 'varchar', length: 100, unique: true })
  storedName!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ name: 'client_hash', type: 'varchar', length: 80, nullable: true })
  clientHash!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'reception' })
  phase!: WarehousePhotoPhase;

  @Column({ name: 'checklist_item', type: 'varchar', length: 64, nullable: true })
  checklistItem!: string | null;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById!: string;

  @Column({ name: 'uploaded_by_name', type: 'varchar', length: 255 })
  uploadedByName!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
