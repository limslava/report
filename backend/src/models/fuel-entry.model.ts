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

/**
 * Запись учёта топлива: одна строка = машина × месяц.
 * Оператор вводит три поля: odometer, fuelEnd, fuelFilled.
 * mileageManual / fuelStartManual — ручные оверрайды расчётных значений
 * (замена одометра, возврат машины из другого города); null = считается
 * автоматически из записи прошлого месяца.
 */
@Entity('fuel_entries')
@Index(['vehicleId', 'monthValue'], { unique: true })
export class FuelEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  location!: FleetLocation;

  @ManyToOne(() => FleetVehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: FleetVehicle;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  /** Месяц в формате YYYY-MM. */
  @Index()
  @Column({ name: 'month_value', type: 'varchar', length: 7 })
  monthValue!: string;

  /** Показания одометра, км — на конец месяца. */
  @Column({ type: 'numeric', precision: 12, scale: 1, nullable: true })
  odometer!: string | null;

  /** Конечный уровень Топлива, л. */
  @Column({ name: 'fuel_end', type: 'numeric', precision: 10, scale: 2, nullable: true })
  fuelEnd!: string | null;

  /** Заправлено по ППР, л — одной цифрой за месяц. */
  @Column({ name: 'fuel_filled', type: 'numeric', precision: 10, scale: 2, nullable: true })
  fuelFilled!: string | null;

  /** Ручной оверрайд поля «Пробег по Одометру, км». */
  @Column({ name: 'mileage_manual', type: 'numeric', precision: 10, scale: 1, nullable: true })
  mileageManual!: string | null;

  /** Ручной оверрайд поля «Начальный уровень Топлива, л». */
  @Column({ name: 'fuel_start_manual', type: 'numeric', precision: 10, scale: 2, nullable: true })
  fuelStartManual!: string | null;

  @Column({ name: 'updated_by_user_id', type: 'varchar', length: 64, nullable: true })
  updatedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
