import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VehicleModel } from './vehicle-model.model';

export type FleetLocation = 'vvo' | 'mow';

export type FleetVehicleStatus = 'active' | 'repair' | 'archived';

/**
 * Справочник техники подразделения. `location` определяет, в каком городе машина
 * учитывается (перевод в другой город = смена location, старые записи топлива
 * остаются в прежнем городе).
 */
@Entity('fleet_vehicles')
export class FleetVehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  location!: FleetLocation;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  plate!: string;

  /** Тип ТС, например «Грузовой тягач седельный», «автовоз», «эвакуатор». */
  @Column({ name: 'vehicle_kind', type: 'varchar', length: 120, default: '' })
  vehicleKind!: string;

  @ManyToOne(() => VehicleModel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'model_id' })
  model!: VehicleModel | null;

  @Column({ name: 'model_id', type: 'uuid', nullable: true })
  modelId!: string | null;

  @Column({ type: 'varchar', length: 60, default: '' })
  color!: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  vin!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: FleetVehicleStatus;

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
