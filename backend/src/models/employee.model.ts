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
import { FleetVehicle } from './fleet-vehicle.model';
import type { FleetLocation } from './fleet-vehicle.model';
import { Trailer } from './trailer.model';

/**
 * Справочник сотрудников подразделения (не пользователи системы!).
 * Карточка содержит ПДн (паспорт, адрес, ВУ) — доступ к ней ограничен ролями
 * КТК (руководитель/менеджер), отдела кадров и администратором; каждое
 * копирование карточки пишется в журнал аудита. Роли БДД доступа к ПДн не имеют.
 */
@Entity('directory_employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  location!: FleetLocation;

  @Index()
  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  /** Роль в подразделении: водитель, диспетчер и т.п. */
  @Column({ type: 'varchar', length: 60, default: 'водитель' })
  position!: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  phone!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'fired';

  // --- ПДн ---
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'birth_place', type: 'varchar', length: 255, default: '' })
  birthPlace!: string;

  /** Серия и номер одним полем, как в карточке: «0520 826924». */
  @Column({ name: 'passport_number', type: 'varchar', length: 32, default: '' })
  passportNumber!: string;

  @Column({ name: 'passport_issue_date', type: 'date', nullable: true })
  passportIssueDate!: string | null;

  @Column({ name: 'passport_issued_by', type: 'varchar', length: 255, default: '' })
  passportIssuedBy!: string;

  @Column({ name: 'registration_address', type: 'varchar', length: 500, default: '' })
  registrationAddress!: string;

  @Column({ name: 'license_number', type: 'varchar', length: 32, default: '' })
  licenseNumber!: string;

  @Column({ name: 'license_issue_date', type: 'date', nullable: true })
  licenseIssueDate!: string | null;

  // --- Закрепление техники (текущее) ---
  @ManyToOne(() => FleetVehicle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_vehicle_id' })
  assignedVehicle!: FleetVehicle | null;

  @Column({ name: 'assigned_vehicle_id', type: 'uuid', nullable: true })
  assignedVehicleId!: string | null;

  @ManyToOne(() => Trailer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_trailer_id' })
  assignedTrailer!: Trailer | null;

  @Column({ name: 'assigned_trailer_id', type: 'uuid', nullable: true })
  assignedTrailerId!: string | null;

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
