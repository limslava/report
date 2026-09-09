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

  /** СОР — свидетельство о регистрации ТС. */
  @Column({ type: 'varchar', length: 40, default: '' })
  sor!: string;

  /** Дата выдачи СОР (в Excel перевозчику выводится «номер от даты»). */
  @Column({ name: 'sor_issue_date', type: 'date', nullable: true })
  sorIssueDate!: string | null;

  /** Собственник ТС; свободный ввод с подсказками из уже введённых значений. */
  @Column({ type: 'varchar', length: 200, default: '' })
  owner!: string;

  /** Год выпуска; текстом — как вводят (в фикс. карточку водителя не входит). */
  @Column({ name: 'manufacture_year', type: 'varchar', length: 10, default: '' })
  manufactureYear!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: FleetVehicleStatus;

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;


  /** Принадлежность контрагенту (Справочники → Контрагенты); NULL — наша организация. */
  @Index()
  @Column({ name: 'counterparty_id', type: 'uuid', nullable: true })
  counterpartyId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
