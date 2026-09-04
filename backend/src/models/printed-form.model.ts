import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import type { FleetLocation } from './fleet-vehicle.model';

/**
 * Журнал печатных форм (доверенности, заявки): каждая генерация фиксируется —
 * это и автонумерация доверенностей, и аудит доступа к ПДн, и возможность
 * скачать форму повторно с теми же параметрами.
 */
@Entity('printed_forms')
export class PrintedForm {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  location!: FleetLocation;

  /** Ключ шаблона (poa_warehouse, poa_pl, poa_terminal_vehicle, vmpp_*, carrier_vehicles). */
  @Index()
  @Column({ name: 'template_key', type: 'varchar', length: 40 })
  templateKey!: string;

  /** Номер доверенности (сквозной по году и региону); у заявок может быть null. */
  @Column({ name: 'form_number', type: 'int', nullable: true })
  formNumber!: number | null;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  /** Краткое описание для журнала: «Адаменко Р.А. · ВМП Первомайский». */
  @Column({ type: 'varchar', length: 300, default: '' })
  summary!: string;

  /** Все параметры генерации — для повторного скачивания той же формы. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  params!: Record<string, unknown>;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
