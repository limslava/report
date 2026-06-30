import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WarehouseVehicle } from './warehouse-vehicle.model';

export type WarehouseInspectionPhase = 'reception' | 'issue';

@Entity('warehouse_vehicle_inspections')
@Index('uq_warehouse_vehicle_inspection_phase', ['vehicleId', 'phase'], { unique: true })
export class WarehouseVehicleInspection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @ManyToOne(() => WarehouseVehicle, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: WarehouseVehicle;

  @Column({ type: 'varchar', length: 20 })
  phase!: WarehouseInspectionPhase;

  @Column({ name: 'vehicle_details', type: 'jsonb', default: {} })
  vehicleDetails!: Record<string, unknown>;

  @Column({ name: 'documents_and_keys', type: 'jsonb', default: {} })
  documentsAndKeys!: Record<string, unknown>;

  @Column({ name: 'equipment', type: 'jsonb', default: {} })
  equipment!: Record<string, unknown>;

  @Column({ name: 'technical_condition', type: 'jsonb', default: {} })
  technicalCondition!: Record<string, unknown>;

  @Column({ name: 'photo_checklist', type: 'jsonb', default: {} })
  photoChecklist!: Record<string, unknown>;

  @Column({ name: 'damage_notes', type: 'text', nullable: true })
  damageNotes!: string | null;

  @Column({ name: 'personal_items_notes', type: 'text', nullable: true })
  personalItemsNotes!: string | null;

  @Column({ name: 'responsibility_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  responsibilityAmount!: string | null;

  @Column({ name: 'inspected_by_id', type: 'uuid' })
  inspectedById!: string;

  @Column({ name: 'inspected_by_name', type: 'varchar', length: 255 })
  inspectedByName!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
